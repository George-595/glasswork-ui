import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import type { DbClient } from '../infra/db/types.ts';
import {
  createSettingsService,
  DEFAULT_MAINTENANCE_MESSAGE,
  SETTINGS,
  type SettingsRegistry,
} from './settings.ts';

const T0 = new Date('2026-10-12T10:00:00.000Z');
const ADMIN = {
  id: 'admin-1',
  name: 'Ada Admin',
  email: 'ada@example.com',
  role: 'admin',
} as const;

let db: DbClient;
let clock: Date;
const now = () => clock;

beforeEach(async () => {
  clock = new Date(T0);
  db = await createDbClient('sqlite::memory:');
  await migrate(db);
  await db.execute(
    `INSERT INTO users (id, email, name, role, status, team, created_at, updated_at)
     VALUES ('admin-1', 'ada@example.com', 'Ada Admin', 'admin', 'active', 'Ops', ?, ?)`,
    [T0, T0],
  );
});
afterEach(async () => {
  await db.close();
});

describe('reading', () => {
  it('serves the defaults until something is set', async () => {
    const s = createSettingsService(db, { now });
    expect(await s.forViewer('viewer')).toEqual({
      'workspace.name': 'Base app',
      'maintenance.enabled': false,
      'maintenance.message': DEFAULT_MAINTENANCE_MESSAGE,
    });
    expect(await s.maintenance()).toEqual({ enabled: false, message: DEFAULT_MAINTENANCE_MESSAGE });
    expect(await s.workspaceName()).toBe('Base app');
  });

  it('shows admin-only keys to admins and hides them from everyone else', async () => {
    const registry: SettingsRegistry = {
      ...SETTINGS,
      'maintenance.message': { ...SETTINGS['maintenance.message'], visibility: 'admin' },
    };
    const s = createSettingsService(db, { now, registry });
    expect(Object.keys(await s.forViewer('editor')).toSorted()).toEqual([
      'maintenance.enabled',
      'workspace.name',
    ]);
    expect(Object.keys(await s.forViewer('admin')).toSorted()).toEqual([
      'maintenance.enabled',
      'maintenance.message',
      'workspace.name',
    ]);
  });

  it('treats a stored value that no longer validates as the default', async () => {
    await db.execute(
      "INSERT INTO app_settings (setting_key, value, updated_at) VALUES ('maintenance.enabled', '\"yes\"', ?)",
      [T0],
    );
    await db.execute(
      "INSERT INTO app_settings (setting_key, value, updated_at) VALUES ('workspace.name', 'not json', ?)",
      [T0],
    );
    const s = createSettingsService(db, { now });
    expect((await s.maintenance()).enabled).toBe(false);
    expect(await s.workspaceName()).toBe('Base app');
  });

  it('caches for a moment, so the maintenance gate costs no query per request', async () => {
    const s = createSettingsService(db, { now, cacheMs: 2_000 });
    expect(await s.workspaceName()).toBe('Base app');
    // changed behind its back (another instance)
    await db.execute(
      "INSERT INTO app_settings (setting_key, value, updated_at) VALUES ('workspace.name', '\"Other\"', ?)",
      [T0],
    );
    expect(await s.workspaceName()).toBe('Base app');
    clock = new Date(T0.getTime() + 2_001);
    expect(await s.workspaceName()).toBe('Other');
  });
});

describe('update', () => {
  it('stores, trims, audits and returns the new values; the next read sees them at once', async () => {
    const s = createSettingsService(db, { now });
    await s.workspaceName(); // warm the cache
    const out = await s.update(
      { 'workspace.name': '  Acme HQ  ', 'maintenance.enabled': true },
      ADMIN,
      '203.0.113.9',
    );
    expect(out).toMatchObject({ 'workspace.name': 'Acme HQ', 'maintenance.enabled': true });
    expect(await s.workspaceName()).toBe('Acme HQ');
    expect(await s.maintenance()).toEqual({ enabled: true, message: DEFAULT_MAINTENANCE_MESSAGE });

    const [audit] = await db.query<Record<string, unknown>>(
      "SELECT * FROM audit_events WHERE action = 'settings.update'",
    );
    expect(audit).toMatchObject({
      actor_user_id: 'admin-1',
      actor_label: 'Ada Admin',
      target: 'workspace.name, maintenance.enabled',
      ip: '203.0.113.9',
      outcome: 'success',
    });
    expect(JSON.parse(String(audit?.detail))).toEqual({
      'workspace.name': 'Acme HQ',
      'maintenance.enabled': true,
    });
    const [row] = await db.query<{ updated_by_user_id: string }>(
      "SELECT updated_by_user_id FROM app_settings WHERE setting_key = 'workspace.name'",
    );
    expect(row?.updated_by_user_id).toBe('admin-1');
  });

  it('only changes the keys it is given', async () => {
    const s = createSettingsService(db, { now });
    await s.update({ 'maintenance.message': 'Back at 3pm' }, ADMIN, 'ip');
    await s.update({ 'maintenance.enabled': true }, ADMIN, 'ip');
    expect(await s.maintenance()).toEqual({ enabled: true, message: 'Back at 3pm' });
    expect(await s.workspaceName()).toBe('Base app');
  });

  it('an empty maintenance message reads as the default one', async () => {
    const s = createSettingsService(db, { now });
    await s.update({ 'maintenance.message': '   ' }, ADMIN, 'ip');
    expect((await s.maintenance()).message).toBe(DEFAULT_MAINTENANCE_MESSAGE);
  });

  it('rejects an unknown key, a wrong type and a bad value, naming the key, and stores nothing', async () => {
    const s = createSettingsService(db, { now });
    const bad = async (body: Record<string, unknown>) =>
      await s.update(body, ADMIN, 'ip').catch((e: unknown) => e);
    expect(await bad({ nope: 1 })).toMatchObject({ code: 'invalid_setting', field: 'nope' });
    expect(await bad({ 'maintenance.enabled': 'true' })).toMatchObject({
      code: 'invalid_setting',
      field: 'maintenance.enabled',
    });
    expect(await bad({ 'workspace.name': '   ' })).toMatchObject({ field: 'workspace.name' });
    expect(await bad({ 'workspace.name': 'x'.repeat(61) })).toMatchObject({
      field: 'workspace.name',
    });
    expect(await bad({ 'workspace.name': 5 })).toMatchObject({ field: 'workspace.name' });
    expect(await bad({})).toMatchObject({ code: 'invalid_body' });
    // one bad value in a batch stores none of it
    expect(await bad({ 'maintenance.enabled': true, 'workspace.name': '' })).toMatchObject({
      code: 'invalid_setting',
    });
    expect(await db.query('SELECT * FROM app_settings')).toHaveLength(0);
    expect(
      await db.query("SELECT * FROM audit_events WHERE action = 'settings.update'"),
    ).toHaveLength(0);
  });
});

describe('publishing', () => {
  it('broadcasts the public settings to everyone, after the commit', async () => {
    const publish = vi.fn<(target: string, event: string, data: unknown) => void>();
    const s = createSettingsService(db, { now, publish });
    await s.update({ 'maintenance.enabled': true }, ADMIN, 'ip');
    expect(publish).toHaveBeenCalledOnce();
    expect(publish).toHaveBeenCalledWith('*', 'settings', {
      'workspace.name': 'Base app',
      'maintenance.enabled': true,
      'maintenance.message': DEFAULT_MAINTENANCE_MESSAGE,
    });
  });

  it('publishes nothing for a failed update, or for a change to admin-only keys alone', async () => {
    const publish = vi.fn<(target: string, event: string, data: unknown) => void>();
    const registry: SettingsRegistry = {
      ...SETTINGS,
      'maintenance.message': { ...SETTINGS['maintenance.message'], visibility: 'admin' },
    };
    const s = createSettingsService(db, { now, publish, registry });
    await s.update({ 'workspace.name': '' }, ADMIN, 'ip').catch(() => undefined);
    await s.update({ 'maintenance.message': 'Private note' }, ADMIN, 'ip');
    expect(publish).not.toHaveBeenCalled();
  });

  it('an admin-only value never rides on the broadcast', async () => {
    const publish = vi.fn<(target: string, event: string, data: unknown) => void>();
    const registry: SettingsRegistry = {
      ...SETTINGS,
      'maintenance.message': { ...SETTINGS['maintenance.message'], visibility: 'admin' },
    };
    const s = createSettingsService(db, { now, publish, registry });
    await s.update(
      { 'maintenance.message': 'Private note', 'workspace.name': 'Acme' },
      ADMIN,
      'ip',
    );
    const [, , data] = publish.mock.calls[0] ?? [];
    expect(JSON.stringify(data)).not.toContain('Private note');
    expect(data).toMatchObject({ 'workspace.name': 'Acme' });
  });

  it('works without a publisher', async () => {
    const s = createSettingsService(db, { now });
    await expect(s.update({ 'workspace.name': 'Acme' }, ADMIN, 'ip')).resolves.toBeDefined();
  });
});

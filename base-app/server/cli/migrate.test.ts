import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import { MIGRATIONS } from '../infra/db/migrations/index.ts';
import { databaseUrlFor, deployAction, describeTarget, runCli } from './migrate.ts';

/* The migration CLI, in process, against a SQLite file (a fresh one per test). */

let dir: string;
let url: string;
let out: string[];
let err: string[];
const io = {
  info: (l: string) => out.push(l),
  error: (l: string) => err.push(l),
};

beforeEach(() => {
  dir = mkdtempSync(join(tmpdir(), 'app-migrate-cli-'));
  url = `sqlite:${join(dir, 'app.sqlite')}`;
  out = [];
  err = [];
});
afterEach(() => rmSync(dir, { recursive: true, force: true }));

async function applied(): Promise<string[]> {
  const db = await createDbClient(url);
  try {
    const rows = await db.query<{ id: string }>('SELECT id FROM schema_migrations ORDER BY id');
    return rows.map((r) => r.id);
  } catch {
    return [];
  } finally {
    await db.close();
  }
}

const PROD = {
  VERCEL_ENV: 'production',
  NODE_ENV: 'production',
  ADMIN_EMAIL: 'admin@example.test',
  ADMIN_PASSWORD: 'a-long-production-password',
  MAIL_TRANSPORT: 'log',
  APP_BASE_URL: 'https://app.example.org',
};

describe('databaseUrlFor', () => {
  it('prefers the migration URL, then the unpooled one, then DATABASE_URL', () => {
    const all = { MIGRATION_DATABASE_URL: 'm', DATABASE_URL_UNPOOLED: 'u', DATABASE_URL: 'd' };
    expect(databaseUrlFor(all)).toBe('m');
    expect(databaseUrlFor({ DATABASE_URL_UNPOOLED: 'u', DATABASE_URL: 'd' })).toBe('u');
    expect(databaseUrlFor({ DATABASE_URL: 'd' })).toBe('d');
    expect(databaseUrlFor({})).toBeUndefined();
  });

  it('describes a target without its credentials', () => {
    const shown = describeTarget(
      'postgres://app:s3cret-pw@ep-x-pooler.eu-west-2.aws.neon.tech/neondb?sslmode=require',
    );
    expect(shown).toBe('ep-x-pooler.eu-west-2.aws.neon.tech/neondb');
    expect(shown).not.toContain('s3cret');
  });
});

describe('deployAction', () => {
  it('applies on production, and on a preview only when MIGRATE_PREVIEW=apply', () => {
    expect(deployAction({ VERCEL_ENV: 'production' })).toBe('apply');
    expect(deployAction({ VERCEL_ENV: 'preview' })).toBe('verify');
    expect(deployAction({ VERCEL_ENV: 'preview', MIGRATE_PREVIEW: 'apply' })).toBe('apply');
    expect(deployAction({ VERCEL_ENV: 'development' })).toBe('verify');
    expect(deployAction({})).toBe('verify');
    expect(deployAction({ MIGRATE_PREVIEW: 'apply' })).toBe('verify');
  });
});

describe('runCli', () => {
  it('needs exactly one mode and a database', async () => {
    expect(await runCli([], { DATABASE_URL: url }, io)).toBe(2);
    expect(await runCli(['--apply', '--verify'], { DATABASE_URL: url }, io)).toBe(2);
    expect(await runCli(['--apply'], {}, io)).toBe(1);
    expect(err.join('\n')).toContain('no database');
  });

  it('--apply migrates and --verify then passes', async () => {
    expect(await runCli(['--apply'], { DATABASE_URL: url }, io)).toBe(0);
    expect(await applied()).toEqual(MIGRATIONS.map((m) => m.id));
    expect(out.join('\n')).toContain('applied 001_baseline');
    out.length = 0;
    expect(await runCli(['--verify'], { DATABASE_URL: url }, io)).toBe(0);
    expect(out.join('\n')).toContain('schema matches the code');
    // a second apply changes nothing
    expect(await runCli(['--apply'], { DATABASE_URL: url }, io)).toBe(0);
    expect(out.join('\n')).toContain('already up to date');
  });

  it('--verify fails on an empty database and does not create anything', async () => {
    expect(await runCli(['--verify'], { DATABASE_URL: url }, io)).toBe(1);
    expect(err.join('\n')).toContain('behind the code');
    expect(await applied()).toEqual([]);
  });

  it('prefers MIGRATION_DATABASE_URL to DATABASE_URL', async () => {
    const other = `sqlite:${join(dir, 'direct.sqlite')}`;
    expect(
      await runCli(['--apply'], { DATABASE_URL: url, MIGRATION_DATABASE_URL: other }, io),
    ).toBe(0);
    expect(await applied()).toEqual([]); // the pooled URL was never touched
    url = other;
    expect((await applied()).length).toBe(MIGRATIONS.length);
  });

  it('--deploy on production applies, then seeds the admin and no demo data', async () => {
    expect(await runCli(['--deploy'], { ...PROD, DATABASE_URL: url }, io)).toBe(0);
    expect(await applied()).toEqual(MIGRATIONS.map((m) => m.id));
    const db = await createDbClient(url);
    const users = await db.query<{ email: string }>('SELECT email FROM users');
    const demo = await db.query('SELECT id FROM transactions');
    await db.close();
    expect(users).toEqual([{ email: 'admin@example.test' }]);
    expect(demo).toEqual([]);
    expect(out.join('\n')).toContain('admin account created');
    expect(out.join('\n')).not.toContain('a-long-production-password');
  });

  it('--deploy on production with a bad config fails before touching the database', async () => {
    const bad = { ...PROD, ADMIN_PASSWORD: 'short', DATABASE_URL: url };
    expect(await runCli(['--deploy'], bad, io)).toBe(1);
    expect(err.join('\n')).toContain('ADMIN_PASSWORD');
    expect(await applied()).toEqual([]);
  });

  it('--deploy on a preview verifies, and fails the build when this commit adds a migration', async () => {
    const db = await createDbClient(url);
    await migrate(db, MIGRATIONS.slice(0, -1));
    await db.close();
    const env = { VERCEL_ENV: 'preview', DATABASE_URL: url };
    expect(await runCli(['--deploy'], env, io)).toBe(1);
    expect(err.join('\n')).toContain(`adds migration ${MIGRATIONS.at(-1)?.id}`);
    expect(err.join('\n')).toContain('previews share the production database');
    // nothing was applied
    expect((await applied()).length).toBe(MIGRATIONS.length - 1);
  });

  it('--deploy on a preview passes when the schema is current', async () => {
    await runCli(['--apply'], { DATABASE_URL: url }, io);
    out.length = 0;
    expect(await runCli(['--deploy'], { VERCEL_ENV: 'preview', DATABASE_URL: url }, io)).toBe(0);
    expect(out.join('\n')).toContain('schema matches the code');
  });

  it('--deploy on a preview with MIGRATE_PREVIEW=apply migrates its own branch', async () => {
    const env = { ...PROD, VERCEL_ENV: 'preview', MIGRATE_PREVIEW: 'apply', DATABASE_URL: url };
    expect(await runCli(['--deploy'], env, io)).toBe(0);
    expect((await applied()).length).toBe(MIGRATIONS.length);
  });

  it('a failed migration is a failed deploy and leaves the database as it was', async () => {
    const db = await createDbClient(url);
    await migrate(db, MIGRATIONS);
    // an edited migration in the database's history
    await db.execute("UPDATE schema_migrations SET checksum = ? WHERE id = '001_baseline'", [
      '0'.repeat(64),
    ]);
    await db.close();
    expect(await runCli(['--deploy'], { ...PROD, DATABASE_URL: url }, io)).toBe(1);
    expect(err.join('\n')).toContain('"001_baseline" was applied and then changed');
  });
});

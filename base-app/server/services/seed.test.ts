import { describe, expect, it } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import { verifyPassword } from './passwords.ts';
import { seedIfEmpty } from './seed.ts';

const fresh = async () => {
  const db = await createDbClient('sqlite::memory:');
  await migrate(db);
  return db;
};
const adminHash = async (db: Awaited<ReturnType<typeof fresh>>, email: string) =>
  (
    await db.query<{ password_hash: string | null }>(
      'SELECT password_hash FROM users WHERE email = ?',
      [email],
    )
  )[0]?.password_hash;

describe('seedIfEmpty', () => {
  it('fills empty tables and creates the admin with a hashed password', async () => {
    const db = await fresh();
    const r = await seedIfEmpty(db, { adminEmail: 'Boss@Example.com', adminPassword: 'pw-123456' });
    expect(r.seeded).toEqual([
      'users',
      'transactions',
      'audit_events',
      'activity',
      'revenue_daily',
      'kpis',
      'signups_monthly',
      'notifications',
    ]);
    expect(r.admin).toBe('created');
    const hash = await adminHash(db, 'boss@example.com');
    expect(hash).toMatch(/^scrypt\$/);
    expect(hash).not.toContain('pw-123456');
    expect(await verifyPassword('pw-123456', hash ?? '')).toBe(true);
    await db.close();
  });

  it('never touches a table that already has rows, and never changes an existing password', async () => {
    const db = await fresh();
    await db.execute(
      "INSERT INTO transactions (id, occurred_at, customer, description, category, amount_minor, currency, status) VALUES ('t1', '2026-01-01T00:00:00.000Z', 'Mine', 'Real', 'Office', 1, 'GBP', 'paid')",
    );
    const r = await seedIfEmpty(db, {
      adminEmail: 'a@example.com',
      adminPassword: 'first-password',
    });
    expect(r.seeded).not.toContain('transactions');
    expect(await db.query('SELECT id FROM transactions')).toEqual([{ id: 't1' }]);
    const again = await seedIfEmpty(db, {
      adminEmail: 'a@example.com',
      adminPassword: 'other-password',
    });
    expect(again).toEqual({ seeded: [], admin: 'exists' });
    expect(
      await verifyPassword('first-password', (await adminHash(db, 'a@example.com')) ?? ''),
    ).toBe(true);
    await db.close();
  });

  it('production seeds no demo data, only the admin', async () => {
    const db = await fresh();
    const r = await seedIfEmpty(db, {
      adminEmail: 'a@example.com',
      adminPassword: 'x'.repeat(16),
      seedDemoData: false,
    });
    expect(r.seeded).toEqual([]);
    expect(await db.query('SELECT email FROM users')).toEqual([{ email: 'a@example.com' }]);
    expect(await db.query('SELECT id FROM transactions')).toEqual([]);
    await db.close();
  });

  it('gives a passwordless existing admin the configured password', async () => {
    const db = await fresh();
    await db.execute(
      "INSERT INTO users (id, name, email, role, status, team, created_at, updated_at) VALUES ('u1', 'A', 'a@example.com', 'admin', 'active', 'T', '2026-01-01T00:00:00.000Z', '2026-01-01T00:00:00.000Z')",
    );
    const r = await seedIfEmpty(db, {
      adminEmail: 'a@example.com',
      adminPassword: 'now-set-123',
      seedDemoData: false,
    });
    expect(r.admin).toBe('password set');
    expect(await verifyPassword('now-set-123', (await adminHash(db, 'a@example.com')) ?? '')).toBe(
      true,
    );
    await db.close();
  });
});

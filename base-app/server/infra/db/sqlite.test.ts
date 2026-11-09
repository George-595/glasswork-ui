import { describe, expect, it } from 'vitest';
import { DbQueryError } from './errors.ts';
import { createDbClient } from './index.ts';
import type { DbClient } from './types.ts';

async function memoryDb(): Promise<DbClient> {
  const db = await createDbClient('sqlite::memory:');
  await db.execute(
    'CREATE TABLE item (id INTEGER PRIMARY KEY, name TEXT NOT NULL, active INTEGER, seen TEXT)',
  );
  return db;
}

describe('sqlite client', () => {
  it('reports its driver', async () => {
    const db = await memoryDb();
    expect(db.driver).toBe('sqlite');
    await db.close();
  });

  it('inserts and reads typed rows', async () => {
    const db = await memoryDb();
    const res = await db.execute('INSERT INTO item (name) VALUES (?)', ['apple']);
    expect(res.rowsAffected).toBe(1);
    expect(res.lastInsertId).toBe(1);

    const rows = await db.query<{ id: number; name: string }>('SELECT id, name FROM item');
    expect(rows).toEqual([{ id: 1, name: 'apple' }]);
    await db.close();
  });

  it('reports rowsAffected for update and delete', async () => {
    const db = await memoryDb();
    await db.execute('INSERT INTO item (name) VALUES (?), (?)', ['a', 'b']);
    expect((await db.execute('UPDATE item SET name = ?', ['z'])).rowsAffected).toBe(2);
    expect((await db.execute('DELETE FROM item WHERE name = ?', ['z'])).rowsAffected).toBe(2);
    await db.close();
  });

  it('stores booleans as 1/0 and Dates as ISO text', async () => {
    const db = await memoryDb();
    const when = new Date('2026-10-11T09:30:00.000Z');
    await db.execute('INSERT INTO item (name, active, seen) VALUES (?, ?, ?)', ['x', true, when]);
    const rows = await db.query<{ active: number; seen: string }>('SELECT active, seen FROM item');
    expect(rows[0]).toEqual({ active: 1, seen: '2026-10-11T09:30:00.000Z' });
    await db.close();
  });

  it('commits a transaction that resolves', async () => {
    const db = await memoryDb();
    await db.transaction(async (tx) => {
      await tx.execute('INSERT INTO item (name) VALUES (?)', ['kept']);
    });
    expect(await db.query('SELECT name FROM item')).toEqual([{ name: 'kept' }]);
    await db.close();
  });

  it('rolls back a transaction that throws and rethrows the error', async () => {
    const db = await memoryDb();
    await expect(
      db.transaction(async (tx) => {
        await tx.execute('INSERT INTO item (name) VALUES (?)', ['gone']);
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    expect(await db.query('SELECT name FROM item')).toEqual([]);
    await db.close();
  });

  it('wraps a bad statement in DbQueryError without the SQL text', async () => {
    const db = await memoryDb();
    const err = await db.query('SELECT * FROM missing_table').catch((e: unknown) => e);
    expect(err).toBeInstanceOf(DbQueryError);
    expect((err as DbQueryError).driver).toBe('sqlite');
    expect((err as DbQueryError).code).toBe('ERR_SQLITE_ERROR');
    expect((err as Error).message).toBe('sqlite query failed (ERR_SQLITE_ERROR)');
    expect((err as Error).message).not.toContain('missing_table');
    await db.close();
  });

  it('answers ping with a latency', async () => {
    const db = await memoryDb();
    const { latencyMs } = await db.ping();
    expect(latencyMs).toBeGreaterThanOrEqual(0);
    await db.close();
  });

  it('refuses queries after close', async () => {
    const db = await memoryDb();
    await db.close();
    await expect(db.query('SELECT 1')).rejects.toBeInstanceOf(DbQueryError);
  });
});

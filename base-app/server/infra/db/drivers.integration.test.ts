import { randomUUID } from 'node:crypto';
import { afterAll, describe, expect, it } from 'vitest';
import { createDbClient } from './index.ts';
import type { DbClient } from './types.ts';

/* The same CRUD and transaction suite on the real Postgres and MySQL servers. Each suite
   is skipped unless its URL is set: TEST_POSTGRES_URL / TEST_MYSQL_URL. Every run uses a
   fresh table name and drops it afterwards. */

function runSuite(label: string, url: string | undefined, expectedDriver: string): void {
  describe.skipIf(!url)(`${label} driver (integration)`, () => {
    const table = `it_${randomUUID().replaceAll('-', '')}`;
    let db: DbClient | undefined;

    const client = async (): Promise<DbClient> => {
      if (!db) {
        db = await createDbClient(url ?? '');
        await db.execute(
          `CREATE TABLE ${table} (id INT PRIMARY KEY, name VARCHAR(100) NOT NULL, amount INT)`,
        );
      }
      return db;
    };

    afterAll(async () => {
      if (!db) return;
      await db.execute(`DROP TABLE IF EXISTS ${table}`);
      await db.close();
    });

    it('reports its driver and answers ping', async () => {
      const c = await client();
      expect(c.driver).toBe(expectedDriver);
      expect((await c.ping()).latencyMs).toBeGreaterThanOrEqual(0);
    });

    it('inserts, selects with placeholders, updates and deletes', async () => {
      const c = await client();
      const ins = await c.execute(`INSERT INTO ${table} (id, name, amount) VALUES (?, ?, ?)`, [
        1,
        'apple',
        3,
      ]);
      expect(ins.rowsAffected).toBe(1);

      const rows = await c.query<{ id: number; name: string; amount: number }>(
        `SELECT id, name, amount FROM ${table} WHERE id = ?`,
        [1],
      );
      expect(rows).toEqual([{ id: 1, name: 'apple', amount: 3 }]);

      const upd = await c.execute(`UPDATE ${table} SET amount = ? WHERE id = ?`, [7, 1]);
      expect(upd.rowsAffected).toBe(1);

      const del = await c.execute(`DELETE FROM ${table} WHERE id = ?`, [1]);
      expect(del.rowsAffected).toBe(1);
    });

    it('commits a transaction that resolves', async () => {
      const c = await client();
      await c.transaction(async (tx) => {
        await tx.execute(`INSERT INTO ${table} (id, name, amount) VALUES (?, ?, ?)`, [
          10,
          'kept',
          1,
        ]);
      });
      const rows = await c.query(`SELECT id FROM ${table} WHERE id = ?`, [10]);
      expect(rows).toHaveLength(1);
    });

    it('rolls back a transaction that throws', async () => {
      const c = await client();
      await expect(
        c.transaction(async (tx) => {
          await tx.execute(`INSERT INTO ${table} (id, name, amount) VALUES (?, ?, ?)`, [
            20,
            'gone',
            1,
          ]);
          throw new Error('boom');
        }),
      ).rejects.toThrow('boom');
      const rows = await c.query(`SELECT id FROM ${table} WHERE id = ?`, [20]);
      expect(rows).toEqual([]);
    });
  });
}

runSuite('postgres', process.env.TEST_POSTGRES_URL, 'postgres');
runSuite('mysql', process.env.TEST_MYSQL_URL, 'mysql');

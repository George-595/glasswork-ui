import { afterEach, describe, expect, it } from 'vitest';
import { afterCommit, withAfterCommit } from './after-commit.ts';
import { createDbClient } from './index.ts';
import type { DbClient } from './types.ts';

let raw: DbClient | undefined;
afterEach(async () => {
  await raw?.close();
  raw = undefined;
});

async function open() {
  raw = await createDbClient('sqlite::memory:');
  await raw.execute('CREATE TABLE t (n INTEGER)');
  const errors: unknown[] = [];
  return { db: withAfterCommit(raw, (e) => errors.push(e)), errors };
}

describe('afterCommit', () => {
  it('runs hooks after the commit, in order, and the data is visible to them', async () => {
    const { db } = await open();
    const seen: string[] = [];
    await db.transaction(async (tx) => {
      await tx.execute('INSERT INTO t (n) VALUES (1)');
      afterCommit(tx, async () => {
        const [row] = await db.query<{ n: number }>('SELECT COUNT(*) AS n FROM t');
        seen.push(`first:${row?.n}`);
      });
      afterCommit(tx, () => {
        seen.push('second');
      });
      seen.push('body done');
    });
    expect(seen).toEqual(['body done', 'first:1', 'second']);
  });

  it('drops the hooks when the transaction rolls back', async () => {
    const { db } = await open();
    let ran = false;
    await expect(
      db.transaction(async (tx) => {
        await tx.execute('INSERT INTO t (n) VALUES (1)');
        afterCommit(tx, () => {
          ran = true;
        });
        throw new Error('boom');
      }),
    ).rejects.toThrow('boom');
    await new Promise((r) => setTimeout(r, 5));
    expect(ran).toBe(false);
    expect(await db.query('SELECT * FROM t')).toHaveLength(0);
  });

  it('reports a hook that throws, still runs the rest, and does not fail the transaction', async () => {
    const { db, errors } = await open();
    const ran: string[] = [];
    const result = await db.transaction(async (tx) => {
      afterCommit(tx, () => {
        throw new Error('bad hook');
      });
      afterCommit(tx, () => {
        ran.push('next');
      });
      return 'value';
    });
    expect(result).toBe('value');
    expect(ran).toEqual(['next']);
    expect(errors).toHaveLength(1);
  });

  it('runs at once (asynchronously) outside a transaction', async () => {
    const { db } = await open();
    let ran = false;
    afterCommit(db, () => {
      ran = true;
    });
    await new Promise((r) => setTimeout(r, 5));
    expect(ran).toBe(true);
  });

  it('keeps each transaction on its own queue', async () => {
    const { db } = await open();
    const seen: string[] = [];
    await db.transaction(async (tx) => {
      afterCommit(tx, () => {
        seen.push('a');
      });
    });
    await db.transaction(async (tx) => {
      afterCommit(tx, () => {
        seen.push('b');
      });
    });
    expect(seen).toEqual(['a', 'b']);
  });
});

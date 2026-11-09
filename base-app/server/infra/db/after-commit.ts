import type { DbClient, DbExecutor } from './types.ts';

/* After-commit hooks: "do this only once the transaction really committed".

   Why it exists: a notification is inserted inside a transaction, and the browser must hear about it
   only if that transaction commits. Publishing from inside the transaction would announce a row
   that a later failure rolls back.

   How: withAfterCommit(db) wraps the client once, in createServices. Its transaction() gives each
   run a queue, keyed by the `tx` it hands to the callback. A service (or Notifier) that holds that
   `tx` calls afterCommit(tx, fn); fn is kept and runs after the commit succeeded, in the order it was
   queued. If the callback throws, the transaction rolls back and the queue is dropped unrun. A hook
   that throws is reported to `onError` and never fails the request (the data is already committed).

   Outside a transaction (the client itself, whose statements autocommit as they are awaited) the
   hook runs at once. Hooks are for cheap, in-process side effects (publishing to the realtime hub,
   closing a stream); anything that must not be lost belongs in a job enqueued inside the transaction. */
export type AfterCommitHook = () => void | Promise<void>;

const queues = new WeakMap<DbExecutor, AfterCommitHook[]>();

/** Registers `hook` to run after `executor`'s transaction commits (at once when it is not in one). */
export function afterCommit(executor: DbExecutor, hook: AfterCommitHook): void {
  const queue = queues.get(executor);
  if (queue) queue.push(hook);
  else void Promise.resolve().then(hook);
}

export function withAfterCommit(
  db: DbClient,
  onError: (err: unknown) => void = () => {},
): DbClient {
  return {
    get driver() {
      return db.driver;
    },
    query: (sql, params) => db.query(sql, params),
    execute: (sql, params) => db.execute(sql, params),
    ping: () => db.ping(),
    close: () => db.close(),
    async transaction(fn) {
      const queue: AfterCommitHook[] = [];
      const result = await db.transaction((tx) => {
        queues.set(tx, queue);
        return fn(tx);
      });
      // Committed: run what was queued, one at a time, in order.
      for (const hook of queue) {
        try {
          await hook();
        } catch (err) {
          onError(err);
        }
      }
      return result;
    },
  };
}

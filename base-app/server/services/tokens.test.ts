import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import type { DbClient } from '../infra/db/types.ts';
import { createRepositories } from '../repositories/index.ts';
import { createTokenService, emailLink, sha256Hex, TOKEN_TTL_MS } from './tokens.ts';

let db: DbClient;
let clock = new Date('2026-10-12T09:00:00.000Z');
const tick = (ms: number) => {
  clock = new Date(clock.getTime() + ms);
};

beforeEach(async () => {
  clock = new Date('2026-10-12T09:00:00.000Z');
  db = await createDbClient('sqlite::memory:');
  await migrate(db);
  const at = clock;
  const users = createRepositories(db).users;
  for (const id of ['u1', 'u2']) {
    await users.insert({
      id,
      name: id,
      email: `${id}@example.com`,
      role: 'viewer',
      status: 'invited',
      team: 'Ops',
      createdAt: at.toISOString(),
      lastActiveAt: at.toISOString(),
    });
  }
});
afterEach(() => db.close());

const service = () => createTokenService({ now: () => clock });

describe('token service', () => {
  it('mints 32 random bytes as base64url and stores only the SHA-256', async () => {
    const t = service();
    const issued = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    expect(issued.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
    const rows = await db.query<{ token_hash: string }>('SELECT token_hash FROM auth_tokens');
    expect(rows).toEqual([{ token_hash: sha256Hex(issued.token) }]);
    const another = await db.transaction((tx) => t.issue(tx, 'u2', 'invite'));
    expect(another.token).not.toBe(issued.token);
  });

  it('lives 7 days for an invitation and 1 hour for a reset', async () => {
    const t = service();
    const invite = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    const reset = await db.transaction((tx) => t.issue(tx, 'u1', 'password_reset'));
    expect(invite.expiresAt.getTime() - clock.getTime()).toBe(7 * 24 * 3_600_000);
    expect(reset.expiresAt.getTime() - clock.getTime()).toBe(3_600_000);
    expect(TOKEN_TTL_MS).toEqual({ invite: 604_800_000, password_reset: 3_600_000 });
  });

  it('is valid up to its expiry and not at it', async () => {
    const t = service();
    const { token } = await db.transaction((tx) => t.issue(tx, 'u1', 'password_reset'));
    tick(3_600_000 - 1);
    expect(await t.peek(db, token, 'password_reset')).not.toBeNull();
    tick(1);
    expect(await t.peek(db, token, 'password_reset')).toBeNull();
    await expect(
      db.transaction((tx) => t.consume(tx, token, 'password_reset')),
    ).rejects.toMatchObject({
      code: 'invalid_token',
      message: 'This link is invalid or has expired.',
    });
  });

  it('issuing a new token of a purpose revokes the older unused ones, of that purpose only', async () => {
    const t = service();
    const first = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    const reset = await db.transaction((tx) => t.issue(tx, 'u1', 'password_reset'));
    const other = await db.transaction((tx) => t.issue(tx, 'u2', 'invite'));
    const second = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    expect(await t.peek(db, first.token, 'invite')).toBeNull();
    expect(await t.peek(db, second.token, 'invite')).not.toBeNull();
    expect(await t.peek(db, reset.token, 'password_reset')).not.toBeNull();
    expect(await t.peek(db, other.token, 'invite')).not.toBeNull();
  });

  it('a token of one purpose is not valid for the other', async () => {
    const t = service();
    const { token } = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    expect(await t.peek(db, token, 'password_reset')).toBeNull();
  });

  it('consume spends once: sequentially and under concurrency', async () => {
    const t = service();
    const { token } = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    const attempts = await Promise.allSettled(
      Array.from({ length: 8 }, () => db.transaction((tx) => t.consume(tx, token, 'invite'))),
    );
    expect(attempts.filter((a) => a.status === 'fulfilled')).toHaveLength(1);
    expect(attempts.filter((a) => a.status === 'rejected')).toHaveLength(7);
    await expect(db.transaction((tx) => t.consume(tx, token, 'invite'))).rejects.toMatchObject({
      code: 'invalid_token',
    });
  });

  it('the conditional UPDATE decides, even when both callers saw the token as unused', async () => {
    const t = service();
    const { token } = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    const seen = await t.peek(db, token, 'invite');
    expect(seen).not.toBeNull();
    const repo = createRepositories(db).authTokens;
    const results = await Promise.all([
      repo.markUsed(seen?.record.id ?? '', clock),
      repo.markUsed(seen?.record.id ?? '', clock),
    ]);
    expect(results.filter(Boolean)).toHaveLength(1);
  });

  it('a rolled-back action leaves the token usable', async () => {
    const t = service();
    const { token } = await db.transaction((tx) => t.issue(tx, 'u1', 'invite'));
    await expect(
      db.transaction(async (tx) => {
        await t.consume(tx, token, 'invite');
        throw new Error('the action failed after the token was spent');
      }),
    ).rejects.toThrow('the action failed');
    expect(await t.peek(db, token, 'invite')).not.toBeNull();
  });

  it('unknown, empty and absurd tokens are the same generic error', async () => {
    const t = service();
    for (const bad of ['', 'x', 'nope', 'a'.repeat(5000)]) {
      await expect(db.transaction((tx) => t.consume(tx, bad, 'invite'))).rejects.toMatchObject({
        kind: 'invalid',
        code: 'invalid_token',
      });
    }
  });
});

describe('emailLink', () => {
  it('puts the token in the fragment of an absolute link, whatever the base ends with', () => {
    expect(emailLink('https://app.example.com', 'accept-invite', 'tok_en-1')).toBe(
      'https://app.example.com/accept-invite#token=tok_en-1',
    );
    expect(emailLink('https://app.example.com/', 'reset-password', 'abc')).toBe(
      'https://app.example.com/reset-password#token=abc',
    );
  });
});

import { createId } from '../lib/ids.ts';
import { createRng } from '../lib/rng.ts';
import { FAKE_NOW, FAKE_SEED } from './constants.ts';
import { memoByCount } from './memo.ts';
import type { AuditEvent } from './types.ts';
import { getUsers } from './users.ts';
import { AUDIT_ACTIONS } from './words.ts';

const SEED_OFFSET = 6;
const NOW_MS = Date.parse(FAKE_NOW);
const WINDOW_MINUTES = 60 * 24 * 60;

/* Documentation address ranges only (RFC 5737). */
const IP_PREFIXES = ['192.0.2.', '198.51.100.'] as const;

function buildAuditLog(count: number): readonly AuditEvent[] {
  const rng = createRng(FAKE_SEED + SEED_OFFSET);
  const users = getUsers();
  const events: AuditEvent[] = [];
  for (let i = 0; i < count; i++) {
    const action = rng.pick(AUDIT_ACTIONS);
    let target = 'session';
    if (action.startsWith('user.')) target = rng.pick(users).email;
    else if (action === 'settings.update') target = 'workspace settings';
    else if (action === 'export') target = 'transactions.csv';
    events.push({
      id: createId('evt', rng),
      at: new Date(NOW_MS - rng.int(0, WINDOW_MINUTES) * 60_000).toISOString(),
      actor: rng.pick(users).email,
      action,
      target,
      ip: `${rng.pick(IP_PREFIXES)}${rng.int(1, 254)}`,
      outcome: rng.bool(0.92) ? 'success' : 'failure',
    });
  }
  // Newest first.
  return events.toSorted((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const cachedAuditLog = memoByCount(buildAuditLog);

export function getAuditLog(count = 120): readonly AuditEvent[] {
  return cachedAuditLog(count);
}

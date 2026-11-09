import { createId, slugify } from '../lib/ids.ts';
import { createRng } from '../lib/rng.ts';
import { FAKE_NOW, FAKE_SEED } from './constants.ts';
import { memoByCount } from './memo.ts';
import type { User } from './types.ts';
import { FIRST_NAMES, SURNAMES, TEAMS } from './words.ts';

const SEED_OFFSET = 1;
const NOW_MS = Date.parse(FAKE_NOW);
/* Accounts were created within the last two years. Times are whole minutes. */
const TWO_YEARS_MIN = 2 * 365 * 24 * 60;

function buildUsers(count: number): readonly User[] {
  const rng = createRng(FAKE_SEED + SEED_OFFSET);
  const users: User[] = [];
  for (let i = 0; i < count; i++) {
    const first = FIRST_NAMES[i % FIRST_NAMES.length] ?? 'Sam';
    const last = SURNAMES[(i * 7) % SURNAMES.length] ?? 'Smith';
    const createdMs = NOW_MS - rng.int(0, TWO_YEARS_MIN) * 60_000;
    const lastActiveMs = createdMs + rng.int(0, Math.floor((NOW_MS - createdMs) / 60_000)) * 60_000;
    users.push({
      id: createId('usr', rng),
      name: `${first} ${last}`,
      email: `${slugify(first)}.${slugify(last)}.${i + 1}@example.com`,
      role: rng.pick(['viewer', 'viewer', 'viewer', 'editor', 'editor', 'admin'] as const),
      status: rng.pick(['active', 'active', 'active', 'active', 'invited', 'suspended'] as const),
      team: rng.pick(TEAMS),
      createdAt: new Date(createdMs).toISOString(),
      lastActiveAt: new Date(lastActiveMs).toISOString(),
    });
  }
  return users;
}

const cachedUsers = memoByCount(buildUsers);

export function getUsers(count = 48): readonly User[] {
  return cachedUsers(count);
}

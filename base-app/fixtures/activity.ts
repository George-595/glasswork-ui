import { formatMoney } from '../lib/format.ts';
import { createId } from '../lib/ids.ts';
import { createRng } from '../lib/rng.ts';
import { FAKE_NOW, FAKE_SEED } from './constants.ts';
import { memoByCount } from './memo.ts';
import type { ActivityItem } from './types.ts';
import { getUsers } from './users.ts';
import { COMPANIES } from './words.ts';

const SEED_OFFSET = 7;
const NOW_MS = Date.parse(FAKE_NOW);
const WINDOW_MINUTES = 24 * 60;

function buildActivity(count: number): readonly ActivityItem[] {
  const rng = createRng(FAKE_SEED + SEED_OFFSET);
  const users = getUsers();
  const items: ActivityItem[] = [];
  for (let i = 0; i < count; i++) {
    const kind = rng.pick(['payment', 'signup', 'ticket', 'deploy'] as const);
    const at = new Date(NOW_MS - rng.int(0, WINDOW_MINUTES) * 60_000).toISOString();
    const id = createId('act', rng);
    if (kind === 'payment') {
      const amount = formatMoney(rng.int(4_900, 480_000));
      items.push({
        id,
        at,
        actor: 'Billing',
        summary: `Payment of ${amount} from ${rng.pick(COMPANIES)}`,
        kind,
      });
    } else if (kind === 'signup') {
      const user = rng.pick(users);
      items.push({ id, at, actor: user.name, summary: `${user.name} joined`, kind });
    } else if (kind === 'ticket') {
      items.push({
        id,
        at,
        actor: 'Support',
        summary: `Ticket #${rng.int(1000, 9999)} opened`,
        kind,
      });
    } else {
      const summary = `Deployed release 2.${rng.int(1, 40)}.${rng.int(0, 9)}`;
      items.push({ id, at, actor: 'CI', summary, kind });
    }
  }
  // Newest first.
  return items.toSorted((a, b) => (a.at < b.at ? 1 : a.at > b.at ? -1 : 0));
}

const cachedActivity = memoByCount(buildActivity);

export function getRecentActivity(count = 8): readonly ActivityItem[] {
  return cachedActivity(count);
}

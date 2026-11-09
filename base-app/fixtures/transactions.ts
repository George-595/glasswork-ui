import { createId } from '../lib/ids.ts';
import { createRng } from '../lib/rng.ts';
import { DAY_MS, FAKE_NOW, FAKE_SEED } from './constants.ts';
import { memoByCount } from './memo.ts';
import type { Category, Transaction } from './types.ts';
import { COMPANIES, DESCRIPTIONS } from './words.ts';

const SEED_OFFSET = 2;
const NOW_MS = Date.parse(FAKE_NOW);
const WINDOW_DAYS = 180;
const CATEGORIES: readonly Category[] = ['Software', 'Hardware', 'Services', 'Travel', 'Office'];
const STATUSES = ['paid', 'paid', 'paid', 'paid', 'pending', 'failed', 'refunded'] as const;

function buildTransactions(count: number): readonly Transaction[] {
  const rng = createRng(FAKE_SEED + SEED_OFFSET);
  const rows: Transaction[] = [];
  for (let i = 0; i < count; i++) {
    const category = rng.pick(CATEGORIES);
    const offsetMs = rng.int(0, (WINDOW_DAYS * DAY_MS) / 60_000) * 60_000;
    rows.push({
      id: createId('txn', rng),
      date: new Date(NOW_MS - offsetMs).toISOString(),
      customer: rng.pick(COMPANIES),
      description: rng.pick(DESCRIPTIONS[category]),
      category,
      amountMinor: rng.int(4_900, 480_000),
      currency: 'GBP',
      status: rng.pick(STATUSES),
    });
  }
  // Newest first. ISO timestamps in one format sort correctly as strings.
  return rows.toSorted((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : 0));
}

const cachedTransactions = memoByCount(buildTransactions);

export function getTransactions(count = 240): readonly Transaction[] {
  return cachedTransactions(count);
}

import {
  apiPaths,
  type Category,
  type TransactionStatus,
  type TransactionsQuery,
} from '~/core/api';
import { param, readParams, type UrlValues } from '~/core/router';
import { DENSITIES, type SortKey } from '~/core/ui';
import { cleanDay, rangeBounds } from './range';

/* The transactions table's address and the API call it makes, with no components in them. The page
   draws from this, and the route table (app/routes.ts) uses the same module to say which API call
   a server render should answer ahead of the browser (`prefetch`): one definition, so the server
   asks for exactly what the page will. */

export const STATUSES: readonly TransactionStatus[] = ['paid', 'pending', 'failed', 'refunded'];
export const CATEGORIES: readonly Category[] = [
  'Software',
  'Hardware',
  'Services',
  'Travel',
  'Office',
];
/** The columns the API can sort by, and so the only keys a `sort=` in the URL may carry. */
export const SORT_KEYS: readonly string[] = [
  'date',
  'customer',
  'description',
  'category',
  'amount',
  'status',
];

export const SCHEMA = {
  mode: param.oneOf(['server', 'browser'] as const, 'server'),
  q: param.string(),
  from: param.string(),
  to: param.string(),
  status: param.listOf(STATUSES),
  category: param.listOf(CATEGORIES),
  sort: param.list(['-date']),
  page: param.number(1, { min: 1, integer: true }),
  size: param.number(25, { min: 1, max: 100, integer: true }),
  density: param.oneOf(DENSITIES, 'normal'),
  hide: param.list([]),
};
export type Url = UrlValues<typeof SCHEMA>;

/* `sort=` as the URL carries it ('-date,customer') to the table's keys. Unknown keys
   are dropped (the server would answer 400), and no key at all is the server's own
   default, newest first. */
export function toSortKeys(sort: readonly string[]): SortKey[] {
  const keys = sort.flatMap((s): SortKey[] => {
    const desc = s.startsWith('-');
    const key = desc ? s.slice(1) : s;
    return SORT_KEYS.includes(key) ? [{ key, dir: desc ? 'desc' : 'asc' }] : [];
  });
  return keys.length > 0 ? keys : [{ key: 'date', dir: 'desc' }];
}
export const toWire = (sort: readonly SortKey[]): string[] =>
  sort.map((s) => (s.dir === 'desc' ? `-${s.key}` : s.key));

/** The date range: UK days in the URL, instants for the API. */
export const boundsOf = (url: Pick<Url, 'from' | 'to'>) =>
  rangeBounds(cleanDay(url.from), cleanDay(url.to));

/** The API's table-mode query for an address's values. */
export function tableQuery(
  url: Url,
  sort: readonly SortKey[],
  bounds: ReturnType<typeof boundsOf>,
) {
  const params: TransactionsQuery = {
    page: url.page,
    pageSize: url.size,
    sort: toWire(sort),
    q: url.q.trim() || undefined,
    status: url.status,
    category: url.category,
    ...bounds,
  };
  return params;
}

/** The API calls a server render answers for `/table?…` (its route's `prefetch`): the same one the
    page makes first, for the same address. */
export function tablePrefetch(url: URL): string[] {
  const values = readParams(SCHEMA, url.search);
  if (values.mode !== 'server') return [apiPaths.transactions];
  return [apiPaths.transactionsPage(tableQuery(values, toSortKeys(values.sort), boundsOf(values)))];
}

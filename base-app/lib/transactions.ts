/* The vocabulary of the transactions table-mode query, shared by the server
   (which validates against it) and the client (which builds URLs from it).
   Mirrors the unions in shared/api.ts; the value lists live here because
   shared/ may hold types only. */
export const TRANSACTION_SORT_KEYS = [
  'date',
  'customer',
  'description',
  'category',
  'amount',
  'status',
] as const;
export const TRANSACTION_STATUSES = ['paid', 'pending', 'failed', 'refunded'] as const;
export const TRANSACTION_CATEGORIES = [
  'Software',
  'Hardware',
  'Services',
  'Travel',
  'Office',
] as const;
/** Largest page the server will build. */
export const TRANSACTIONS_MAX_PAGE_SIZE = 100;
export const TRANSACTIONS_DEFAULT_PAGE_SIZE = 25;
/** Longest search text the server accepts. */
export const TRANSACTIONS_MAX_SEARCH_LENGTH = 100;

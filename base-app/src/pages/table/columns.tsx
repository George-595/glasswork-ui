import type { Category, Transaction, TransactionFacets, TransactionStatus } from '~/core/api';
import { Badge, type BadgeVariant, Cluster, type Column, Eyebrow, Money } from '~/core/ui';
import { formatDate } from '~/core/utils';
import { CATEGORIES, STATUSES } from './query';

/* The transactions table's vocabulary and its column definitions. The column keys
   are the API's sort keys ('amount', not 'amountMinor'), so a sort in the table
   state is a `sort=` value as it stands, in both modes. */

export { CATEGORIES, SORT_KEYS, STATUSES } from './query';

export const STATUS_LABEL: Record<TransactionStatus, string> = {
  paid: 'Paid',
  pending: 'Pending',
  failed: 'Failed',
  refunded: 'Refunded',
};
export const STATUS_BADGE: Record<TransactionStatus, BadgeVariant> = {
  paid: 'up',
  pending: 'warning',
  failed: 'down',
  refunded: 'neutral',
};

export const isStatus = (v: string): v is TransactionStatus =>
  (STATUSES as readonly string[]).includes(v);
export const isCategory = (v: string): v is Category =>
  (CATEGORIES as readonly string[]).includes(v);

export interface ColumnOptions {
  /** Ids marked as reviewed in this tab (a demo; nothing is saved). */
  reviewed: ReadonlySet<string>;
  /** Server mode: the facet counts the API sent. Browser mode: undefined (the table counts). */
  facets: TransactionFacets | undefined;
  /** Labels the Amount footer honestly: the page's rows, or every filtered row. */
  totalLabel: string;
}

export const sumMinor = (rows: readonly Transaction[]): number =>
  rows.reduce((sum, t) => sum + t.amountMinor, 0);

export function buildColumns({
  reviewed,
  facets,
  totalLabel,
}: ColumnOptions): Column<Transaction>[] {
  return [
    { key: 'customer', header: 'Customer', sortable: true, searchable: true },
    {
      key: 'description',
      header: 'Description',
      sortable: true,
      searchable: true,
      hideable: true,
    },
    {
      key: 'category',
      header: 'Category',
      sortable: true,
      hideable: true,
      facet: true,
      facetOptions: CATEGORIES.map((value) => ({
        value,
        label: value,
        count: facets?.category[value],
      })),
    },
    {
      key: 'date',
      header: 'Date',
      sortable: true,
      hideable: true,
      sortValue: (t) => t.date,
      cell: (t) => formatDate(t.date, 'medium'),
    },
    {
      key: 'amount',
      header: 'Amount',
      align: 'end',
      sortable: true,
      sortValue: (t) => t.amountMinor,
      cell: (t) => <Money minor={t.amountMinor} />,
      csv: (t) => t.amountMinor / 100,
      footer: (rows) => (
        <Cluster gap={2} justify="end" nowrap>
          <Eyebrow as="span">{totalLabel}</Eyebrow>
          <Money minor={sumMinor(rows)} />
        </Cluster>
      ),
    },
    {
      key: 'status',
      header: 'Status',
      sortable: true,
      hideable: true,
      facet: true,
      facetLabel: (v) => (isStatus(v) ? STATUS_LABEL[v] : v),
      facetOptions: STATUSES.map((value) => ({
        value,
        label: STATUS_LABEL[value],
        count: facets?.status[value],
      })),
      cell: (t) => (
        <Cluster gap={1}>
          <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
          {reviewed.has(t.id) && (
            <Badge variant="info" title="Demo only: marked in this tab, nothing is saved">
              Reviewed (demo)
            </Badge>
          )}
        </Cluster>
      ),
    },
  ];
}

/** The CSV adds the id, which the table does not show. */
export const ID_COLUMN: Column<Transaction> = { key: 'id', header: 'ID' };

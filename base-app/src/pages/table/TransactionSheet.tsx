import { askAbout } from '~/core/agent';
import { api, useApiQuery } from '~/core/api';
import {
  Badge,
  Button,
  DetailSection,
  DetailSheet,
  FeedItem,
  FeedList,
  Icon,
  Money,
  Text,
} from '~/core/ui';
import { formatDate } from '~/core/utils';
import { STATUS_BADGE, STATUS_LABEL } from './columns';

/* The detail drawer: one transaction from GET /api/transactions/:id, with the same
   customer's other transactions the endpoint sends. It loads when it opens (the
   query only runs for an id), and its loading and error states live inside the
   sheet (DetailSheet), so a failed fetch never blanks the table behind it. "Ask about this"
   closes it and opens the Ask panel with this transaction as the chat's subject. */

export interface TransactionSheetProps {
  /** The transaction to show; null keeps the sheet closed. */
  id: string | null;
  onClose: () => void;
  /** Open another transaction in the same sheet (a related one). */
  onOpen: (id: string) => void;
  /** Set the table's search to this customer and close. */
  onFilterCustomer: (customer: string) => void;
  reviewed: ReadonlySet<string>;
}

/* While the sheet is closed there is nothing to fetch: the query stays pending, unseen. */
const NEVER = new Promise<never>(() => {});

export function TransactionSheet({
  id,
  onClose,
  onOpen,
  onFilterCustomer,
  reviewed,
}: TransactionSheetProps) {
  const query = useApiQuery(() => (id ? api.transaction(id) : NEVER), id ?? '');
  const data = id && query.status === 'success' ? query.data : null;
  const t = data?.transaction;

  return (
    <DetailSheet
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      title="Transaction details"
      subtitle={id ? `Everything we hold about transaction ${id}.` : 'Transaction details.'}
      what="transaction"
      loading={id !== null && query.status === 'loading'}
      error={id !== null && query.status === 'error' ? query.error : undefined}
      onRetry={query.reload}
      badges={
        t && (
          <>
            <Badge variant={STATUS_BADGE[t.status]}>{STATUS_LABEL[t.status]}</Badge>
            {id && reviewed.has(id) && (
              <Badge variant="info" title="Demo only: marked in this tab, nothing is saved">
                Reviewed (demo)
              </Badge>
            )}
          </>
        )
      }
      summary={
        t && (
          <Text size="title">
            <Money minor={t.amountMinor} currency={t.currency} />
          </Text>
        )
      }
      actions={
        t &&
        id && (
          <>
            <Button variant="outline" onClick={() => onFilterCustomer(t.customer)}>
              Filter table by {t.customer}
            </Button>
            <Button
              variant="outline"
              onClick={() => {
                onClose();
                askAbout({ kind: 'transaction', id, label: `${t.customer}, transaction ${id}` });
              }}
            >
              <Icon name="sparkles" size={16} />
              Ask about this
            </Button>
          </>
        )
      }
    >
      {() =>
        data &&
        t && (
          <>
            <DetailSection
              title="Details"
              items={[
                {
                  term: 'ID',
                  detail: (
                    <Text as="span" size="mono">
                      {t.id}
                    </Text>
                  ),
                },
                { term: 'Customer', detail: t.customer },
                { term: 'Description', detail: t.description },
                { term: 'Category', detail: t.category },
                { term: 'Date', detail: formatDate(t.date, 'long') },
              ]}
            />
            <DetailSection
              title={
                data.relatedCount === 0
                  ? `No other transactions from ${t.customer}`
                  : `Other transactions from ${t.customer}`
              }
              description={
                data.relatedCount === 0
                  ? undefined
                  : data.related.length < data.relatedCount
                    ? `The latest ${data.related.length} of ${data.relatedCount}.`
                    : `${data.relatedCount} in all.`
              }
            >
              {data.relatedCount > 0 && (
                <FeedList aria-label={`Other transactions from ${t.customer}`}>
                  {data.related.map((r) => (
                    <FeedItem
                      key={r.id}
                      title={r.description}
                      meta={`${formatDate(r.date, 'medium')} · ${STATUS_LABEL[r.status]}`}
                      trailing={<Money minor={r.amountMinor} currency={r.currency} />}
                      onClick={() => onOpen(r.id)}
                    />
                  ))}
                </FeedList>
              )}
            </DetailSection>
          </>
        )
      }
    </DetailSheet>
  );
}

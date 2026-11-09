import type { ReactNode } from 'react';
import { type DescriptionItem, DescriptionList } from '../components/description-list';
import { ErrorState } from '../components/error-state';
import { Cluster } from '../components/layout/Cluster';
import { Section, type SectionProps } from '../components/layout/Section';
import { Stack } from '../components/layout/Stack';
import { LoadingRegion } from '../components/loading-region';
import { Sheet, type SheetProps } from '../components/sheet';
import { SkeletonText } from '../components/skeleton';

/* DetailSheet — a record's drawer: a Sheet whose body is a header block (badges / status, a
   summary figure), sections of fields, and its own loading and error states, so a failed fetch
   never blanks the list behind it.

     <DetailSheet open={id !== null} onOpenChange={…} title="Order 1001"
       subtitle="Placed 3 Sept" badges={<Badge>Paid</Badge>} actions={<Button>Refund</Button>}
       loading={q.status === 'loading'} error={q.error} what="order" onRetry={q.reload}>
       {() => (<DetailSection title="Customer" items={[{ term: 'Name', detail: 'Ada' }]} />)}
     </DetailSheet>

   `children` may be a function: it runs only when the data is ready, so it can read `q.data`
   without a null check. `renderLoading` / `renderError` replace the defaults (a skeleton in a
   LoadingRegion; an ErrorState with Retry). Everything else is the Sheet's: a modal with a
   focus trap, Esc to close, focus returned to the opener. */
export interface DetailSheetProps
  extends Omit<SheetProps, 'title' | 'description' | 'footer' | 'children' | 'hideDescription'> {
  title: ReactNode;
  /** The line under the title. Without it, screen readers hear "Details". */
  subtitle?: ReactNode;
  /** Status Badges, beside each other under the title. */
  badges?: ReactNode;
  /** A key figure above the sections (an amount, a score). */
  summary?: ReactNode;
  /** Buttons pinned under the body. */
  actions?: ReactNode;
  loading?: boolean;
  /** A failed load; any truthy value shows the error state. */
  error?: unknown;
  /** What failed to load, e.g. "order". */
  what?: string;
  onRetry?: () => void;
  renderLoading?: () => ReactNode;
  renderError?: (error: unknown) => ReactNode;
  children?: ReactNode | (() => ReactNode);
}

export function DetailSheet({
  title,
  subtitle,
  badges,
  summary,
  actions,
  loading = false,
  error,
  what = 'details',
  onRetry,
  renderLoading,
  renderError,
  children,
  ...sheet
}: DetailSheetProps) {
  const failed = error !== undefined && error !== null && error !== false;
  let body: ReactNode;
  if (failed) {
    body = renderError ? (
      renderError(error)
    ) : (
      <ErrorState what={what} error={error} onRetry={onRetry} />
    );
  } else if (loading) {
    body = renderLoading ? (
      renderLoading()
    ) : (
      <LoadingRegion label={what}>
        <SkeletonText lines={8} />
      </LoadingRegion>
    );
  } else {
    body = (
      <Stack gap={5} className="ui-detail-body">
        {summary && <div className="ui-detail-summary">{summary}</div>}
        {typeof children === 'function' ? children() : children}
      </Stack>
    );
  }

  return (
    <Sheet
      {...sheet}
      title={title}
      description={subtitle ?? 'Details'}
      hideDescription={!subtitle}
      footer={!failed && !loading ? actions : undefined}
    >
      <Stack gap={4}>
        {badges && !failed && (
          <Cluster gap={2} className="ui-detail-badges">
            {badges}
          </Cluster>
        )}
        {body}
      </Stack>
    </Sheet>
  );
}

export interface DetailSectionProps extends Omit<SectionProps, 'level' | 'gap'> {
  /** Fields as term / detail pairs, drawn as a DescriptionList. */
  items?: readonly DescriptionItem[];
  /** 1 or 2 columns for `items` (two collapse to one on a phone). Default 1. */
  columns?: 1 | 2;
}

/** A titled block in a DetailSheet: a heading, then `items` as a DescriptionList and/or children. */
export function DetailSection({ items, columns = 1, children, ...section }: DetailSectionProps) {
  return (
    <Section level={3} titleSize={4} gap={2} {...section}>
      {items && <DescriptionList items={items} columns={columns} />}
      {children}
    </Section>
  );
}

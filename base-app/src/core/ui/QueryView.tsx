import { Generate } from '@apps/ui';
import { type ReactNode, useState } from 'react';
import type { QueryState } from '~/core/api';
import { ErrorState, LoadingRegion } from './Loading';

/* QueryView renders the four states of a useApiQuery so a page does not
   repeat the same switch:
     loading -> the page's skeleton inside a LoadingRegion
     error   -> an ErrorState with Retry
     empty   -> the `empty` node, when `isEmpty(data)` says there is nothing to show
     success -> children(data)
   Pass the whole result of useApiQuery as `query`.
   `generate` draws the loaded content in with the kit's Generate (a drawing of its structure,
   then the content developing in) when it arrives after the loading state; a result that was
   there from the first render just shows. */
export interface QueryViewProps<T> {
  /** The result of useApiQuery (its `reload` becomes the Retry button). */
  query: QueryState<T> & { reload: () => void };
  /** What is being loaded, as a plural noun: "transactions". Used in every message. */
  what: string;
  /** The skeleton shown while loading. It is decorative; the region announces itself. */
  loading: ReactNode;
  /** True when the loaded data has nothing to list. Without it, success always renders children. */
  isEmpty?: (data: T) => boolean;
  /** Shown instead of children when `isEmpty` is true, e.g. an EmptyState. */
  empty?: ReactNode;
  children: (data: T) => ReactNode;
  /** Draw the loaded content in when it arrives. Default false. */
  generate?: boolean;
}

export function QueryView<T>({
  query,
  what,
  loading,
  isEmpty,
  empty,
  children,
  generate = false,
}: QueryViewProps<T>) {
  // whether this view has shown its loading state (state set while rendering, React's pattern
  // for state derived from props), so a result that was there from the start just shows
  const [waited, setWaited] = useState(false);
  if (query.status === 'loading' && !waited) setWaited(true);
  if (query.status === 'loading') return <LoadingRegion label={what}>{loading}</LoadingRegion>;
  if (query.status === 'error') {
    return <ErrorState what={what} error={query.error} onRetry={query.reload} />;
  }
  if (isEmpty?.(query.data) && empty !== undefined) return <>{empty}</>;
  if (generate) {
    return (
      <Generate play={waited} traceSvg render="ascii">
        {children(query.data)}
      </Generate>
    );
  }
  return <>{children(query.data)}</>;
}

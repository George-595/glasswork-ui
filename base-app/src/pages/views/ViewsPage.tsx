import { useState } from 'react';
import { ApiError, api, type SavedView, useApiQuery } from '~/core/api';
import { useEventStream } from '~/core/realtime';
import { Link } from '~/core/router';
import {
  AgentVisualView,
  Button,
  buttonAttrs,
  ChartGrid,
  ChartGridItem,
  ConfirmDialog,
  EmptyState,
  Icon,
  Notice,
  Page,
  Skeleton,
  Stack,
  Text,
} from '~/core/ui';

/* Views: what the person pinned from the assistant. Each view is stored as the show_* input
   that drew it, so the server redraws it from the database every time this page loads (GET
   /api/views): a pinned "revenue by month" is this month's revenue, not a picture of last
   week's. A view that can no longer be drawn says why, and can still be removed.

   Removing goes through the delete_view action, the same one the assistant uses. Pinning in
   another tab (or by the assistant) publishes a `views` event, which reloads the page's list. */
export default function ViewsPage() {
  const query = useApiQuery(() => api.views().then((r) => r.views));
  const [removing, setRemoving] = useState<SavedView | null>(null);
  useEventStream('views', () => query.reload());

  return (
    <Page
      title="Views"
      description="Charts, figures, tables and diagrams pinned from the assistant, drawn fresh from the data each time."
      actions={
        <Link to="/assistant" {...buttonAttrs('outline', 'sm')}>
          <Icon name="sparkles" size={16} />
          Ask the assistant
        </Link>
      }
    >
      {query.status === 'loading' ? (
        <Stack gap={3} aria-busy="true" aria-label="Loading views">
          <Skeleton height={260} />
          <Skeleton height={260} />
        </Stack>
      ) : query.status === 'error' ? (
        <Notice tone="danger" title="Could not load your views">
          <Stack gap={2}>
            <Text size="small">{query.error.message}</Text>
            <Button variant="outline" size="sm" onClick={query.reload}>
              Try again
            </Button>
          </Stack>
        </Notice>
      ) : query.data.length === 0 ? (
        <EmptyState
          icon="pin"
          title="Nothing pinned yet"
          description="Ask the assistant for a chart or a table, then choose Pin to Views. It appears here, kept up to date."
          action={
            <Link to="/assistant" {...buttonAttrs('primary', 'md')}>
              Open the assistant
            </Link>
          }
        />
      ) : (
        <ChartGrid>
          {query.data.map((v) => (
            <ChartGridItem key={v.id} span={v.visual?.kind === 'kpis' ? 'wide' : 'half'}>
              <Stack gap={2}>
                {v.visual ? (
                  <AgentVisualView visual={v.visual} />
                ) : (
                  <Notice tone="warning" title={v.title}>
                    <Text size="small">{v.error ?? 'This view can no longer be drawn.'}</Text>
                  </Notice>
                )}
                <Button
                  variant="ghost"
                  size="sm"
                  aria-label={`Remove view: ${v.title}`}
                  onClick={() => setRemoving(v)}
                >
                  <Icon name="trash" size={16} />
                  Remove
                </Button>
              </Stack>
            </ChartGridItem>
          ))}
        </ChartGrid>
      )}
      <ConfirmDialog
        open={removing !== null}
        onClose={() => setRemoving(null)}
        title="Remove this view?"
        description={
          removing ? `“${removing.title}” leaves your Views. The data is not touched.` : undefined
        }
        confirmLabel="Remove view"
        destructive
        onConfirm={async () => {
          if (!removing) return;
          try {
            await api.runAction('delete_view', { id: removing.id });
          } catch (err) {
            throw new Error(err instanceof ApiError ? err.message : 'Could not remove it.', {
              cause: err,
            });
          }
          query.reload();
        }}
      />
    </Page>
  );
}

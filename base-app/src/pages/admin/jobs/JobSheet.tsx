import type { JobSummary } from '~/core/api';
import { Button, Code, DetailSection, DetailSheet, Stack } from '~/core/ui';
import { formatDateTime } from '~/core/utils';
import { JobStatusBadge, RETRYABLE } from './status';

/* One job, in a drawer: its state, the schedule, and the last error, with Retry for a job that
   failed or died. The payload is never sent to the browser. */
export interface JobSheetProps {
  job: JobSummary | null;
  retrying: boolean;
  onClose: () => void;
  onRetry: (job: JobSummary) => void;
}

export function JobSheet({ job, retrying, onClose, onRetry }: JobSheetProps) {
  return (
    <DetailSheet
      open={job !== null}
      onOpenChange={(open) => !open && onClose()}
      title={job ? job.kind : 'Job'}
      subtitle={job ? `Run at ${formatDateTime(job.runAt)}` : undefined}
      badges={job ? <JobStatusBadge status={job.status} /> : undefined}
      actions={
        job && RETRYABLE.includes(job.status) ? (
          <Button onClick={() => onRetry(job)} aria-disabled={retrying}>
            {retrying ? 'Retrying…' : 'Retry'}
          </Button>
        ) : undefined
      }
    >
      {job && (
        <Stack gap={5}>
          <DetailSection
            title="Job"
            columns={2}
            items={[
              { term: 'ID', detail: <Code>{job.id}</Code> },
              { term: 'Kind', detail: <Code>{job.kind}</Code> },
              { term: 'Attempts', detail: `${job.attempts} of ${job.maxAttempts}` },
              { term: 'Run at', detail: formatDateTime(job.runAt) },
              { term: 'Created', detail: formatDateTime(job.createdAt) },
              { term: 'Updated', detail: formatDateTime(job.updatedAt) },
              ...(job.dedupeKey
                ? [{ term: 'Dedupe key', detail: <Code>{job.dedupeKey}</Code> }]
                : []),
            ]}
          />
          {job.lastError && (
            <DetailSection title="Last error">
              <Code block aria-label={`Last error of job ${job.id}`}>
                {job.lastError}
              </Code>
            </DetailSection>
          )}
        </Stack>
      )}
    </DetailSheet>
  );
}

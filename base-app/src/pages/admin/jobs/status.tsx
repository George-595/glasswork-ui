import type { JobStatus } from '~/core/api';
import { Badge } from '~/core/ui';

/* A job's status as a word first and a tone second (never colour alone). */
export const STATUSES: readonly JobStatus[] = ['queued', 'running', 'succeeded', 'failed', 'dead'];
export const RETRYABLE: readonly JobStatus[] = ['failed', 'dead'];

export const STATUS_LABEL: Record<JobStatus, string> = {
  queued: 'Queued',
  running: 'Running',
  succeeded: 'Succeeded',
  failed: 'Failed',
  dead: 'Dead',
};
const STATUS_TONE = {
  queued: 'info',
  running: 'brand',
  succeeded: 'up',
  failed: 'warning',
  dead: 'down',
} as const;

export function JobStatusBadge({ status }: { status: JobStatus }) {
  return <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

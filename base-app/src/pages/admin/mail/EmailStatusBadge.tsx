import type { EmailStatus } from '~/core/api';
import { Badge } from '~/core/ui';

/* An email's status as a word first and a tone second (never colour alone). */
export const STATUS_LABEL: Record<EmailStatus, string> = {
  queued: 'Queued',
  sent: 'Sent',
  failed: 'Failed',
};
const STATUS_TONE = { queued: 'info', sent: 'up', failed: 'down' } as const;

export function EmailStatusBadge({ status }: { status: EmailStatus }) {
  return <Badge variant={STATUS_TONE[status]}>{STATUS_LABEL[status]}</Badge>;
}

import { api, useApiQuery } from '~/core/api';
import { Code, DetailSection, DetailSheet, LinkedText, Stack, Text } from '~/core/ui';
import { formatDateTime } from '~/core/utils';
import { EmailStatusBadge } from './EmailStatusBadge';

/* One email, in a drawer: who and what, its status (and why, if it failed), then the plain-text
   body with every link clickable. The HTML part is never sent to the browser. */
export function EmailSheet({ id, onClose }: { id: string | null; onClose: () => void }) {
  const q = useApiQuery(() => (id ? api.email(id) : Promise.resolve(null)), id ?? '');
  const email = q.status === 'success' && q.data ? q.data.email : null;
  return (
    <DetailSheet
      open={id !== null}
      onOpenChange={(open) => !open && onClose()}
      title={email ? email.subject : 'Email'}
      subtitle={email ? `To ${email.to} · ${formatDateTime(email.createdAt)}` : undefined}
      badges={email ? <EmailStatusBadge status={email.status} /> : undefined}
      loading={id !== null && q.status === 'loading'}
      error={q.status === 'error' ? q.error : undefined}
      what="the email"
      onRetry={q.reload}
    >
      {email && (
        <Stack gap={5}>
          <DetailSection
            title="Message"
            columns={2}
            items={[
              { term: 'To', detail: email.to },
              { term: 'Template', detail: <Code>{email.template}</Code> },
              { term: 'Queued', detail: formatDateTime(email.createdAt) },
              { term: 'Sent', detail: email.sentAt ? formatDateTime(email.sentAt) : 'Not yet' },
              { term: 'Transport', detail: <Code>{email.provider}</Code> },
              ...(email.providerMessageId
                ? [{ term: 'Provider ID', detail: <Code>{email.providerMessageId}</Code> }]
                : []),
              ...(email.error ? [{ term: 'Error', detail: email.error }] : []),
            ]}
          />
          <DetailSection title="Text body">
            {email.provider === 'log' && (
              <Text size="small" tone="muted">
                The log transport only records the email; it is not delivered. Follow the links
                below to try the flow.
              </Text>
            )}
            <LinkedText text={email.bodyText} label="Email text" />
          </DetailSection>
        </Stack>
      )}
    </DetailSheet>
  );
}

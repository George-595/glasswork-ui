import { MailError, type MailMessage, type MailTransport } from './types.ts';

/* Resend's HTTP API (https://resend.com/docs/api-reference/emails/send-email) over raw
   fetch, like the LLM clients: no SDK. The key goes in the Authorization header only and is
   never logged, stored or put in an error.

   Failure mapping, which the outbox's retry policy relies on:
   - network error, timeout, 429, 5xx  -> MailError retryable
   - any other 4xx (validation, bad key, unverified domain) -> MailError NOT retryable
   - 2xx without an id -> success with a null id */
const ENDPOINT = 'https://api.resend.com/emails';
const DEFAULT_TIMEOUT_MS = 15_000;

export interface ResendOptions {
  apiKey: string;
  fetchImpl?: typeof fetch;
  timeoutMs?: number;
  /** Test seam; the real endpoint by default. */
  endpoint?: string;
}

export function createResendTransport(opts: ResendOptions): MailTransport {
  const fetchImpl = opts.fetchImpl ?? fetch;
  const timeoutMs = opts.timeoutMs ?? DEFAULT_TIMEOUT_MS;
  return {
    name: 'resend',
    async send(message: MailMessage) {
      let response: Response;
      try {
        response = await fetchImpl(opts.endpoint ?? ENDPOINT, {
          method: 'POST',
          headers: {
            authorization: `Bearer ${opts.apiKey}`,
            'content-type': 'application/json',
          },
          body: JSON.stringify({
            from: message.from,
            to: [message.to],
            subject: message.subject,
            text: message.text,
            ...(message.html ? { html: message.html } : {}),
          }),
          signal: AbortSignal.timeout(timeoutMs),
        });
      } catch (err) {
        const name = err instanceof Error ? err.name : '';
        const what = name === 'TimeoutError' || name === 'AbortError' ? 'timed out' : 'failed';
        throw new MailError(`Resend request ${what}`, { retryable: true });
      }
      const text = await response.text().catch(() => '');
      const body = parse(text);
      if (!response.ok) {
        const retryable = response.status === 429 || response.status >= 500;
        // Resend's error `name` (validation_error, ...) is a fixed vocabulary, safe to keep;
        // its free-text `message` can echo the request, so it is not stored.
        const kind = typeof body.name === 'string' ? ` (${body.name.slice(0, 60)})` : '';
        throw new MailError(`Resend answered ${response.status}${kind}`, {
          retryable,
          status: response.status,
        });
      }
      return { providerMessageId: typeof body.id === 'string' ? body.id : null };
    },
  };
}

function parse(text: string): Record<string, unknown> {
  try {
    const v: unknown = JSON.parse(text);
    return typeof v === 'object' && v !== null ? (v as Record<string, unknown>) : {};
  } catch {
    return {};
  }
}

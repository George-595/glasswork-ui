/* The one interface every mail transport implements. A transport sends one finished message;
   it knows nothing about templates, the outbox or retries (those are services/outbox.ts). */
export type MailTransportName = 'log' | 'resend';

export interface MailMessage {
  /** "Name <address>" or a bare address. */
  from: string;
  to: string;
  subject: string;
  text: string;
  html?: string | undefined;
}

export interface MailTransport {
  readonly name: MailTransportName;
  /** Resolves with the provider's id for the message (null if it has none). Throws MailError. */
  send(message: MailMessage): Promise<{ providerMessageId: string | null }>;
}

/* A failed send. `retryable` says whether trying again later could work: a network failure, a
   timeout, a 429 or a 5xx can; a 4xx validation answer (bad address, unverified sender) cannot.
   The message is safe to store and show to an admin: it names the status and the provider's
   error name, never the API key, the request or the recipient. */
export class MailError extends Error {
  readonly retryable: boolean;
  readonly status: number | undefined;

  constructor(message: string, opts: { retryable: boolean; status?: number }) {
    super(message);
    this.name = 'MailError';
    this.retryable = opts.retryable;
    this.status = opts.status;
  }
}

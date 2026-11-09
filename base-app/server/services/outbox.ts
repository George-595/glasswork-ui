import type { EmailDetail, EmailSummary, EmailsResponse } from '../../shared/api.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { MailError, type MailTransport } from '../infra/mail/index.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import type { OutboundEmailRecord } from '../repositories/outbound-emails.ts';
import { ServiceError } from './errors.ts';
import { defineJob, type JobsService, PermanentJobError } from './jobs.ts';
import { type EmailTemplate, renderEmail } from './mail-templates.ts';

export type { EmailTemplate } from './mail-templates.ts';

/* The mail outbox, the only way the app sends email.

   `sendEmail(tx, msg)` renders the template and, in the CALLER'S transaction, inserts an
   `outbound_emails` row (status `queued`) and a `send_email` job. Both commit or neither does:
   a rolled-back invite sends nothing, a committed one cannot lose its email. Nothing is sent
   from the request.

   The `send_email` job then loads the row and sends it through the configured transport:
   - sent: the row becomes `sent` with the provider's message id;
   - a retryable failure (network, timeout, 429, 5xx): the job is retried with backoff, and on
     the last attempt the row becomes `failed`;
   - a permanent failure (a 4xx): the row becomes `failed` at once and the job `failed`; no retry.
   A row that is no longer `queued` is skipped, so a job that runs twice sends once.

   The stored `error` is the transport's safe text (a status and an error name). The HTML body is
   stored but never leaves the server: the admin Mail page shows the plain text.

   Secrets. An invitation or a reset email carries a working link, `#token=<43 characters>` (older ones `?token=`), and
   tokens.ts promises that only the SHA-256 of a token is ever stored. The row has to hold the
   real body until the transport takes it (the job reads it from there), but not a moment after:
   once the message is sent, or has failed for good, the stored text and HTML are rewritten with
   the token masked (`token=[sent]`), so a copy of the database, a backup, a branch or the admin
   Mail page never holds a working link. The Mail page masks too, for a message still queued.
   Passing a link on by hand is the manager's "copy link", which returns it once and keeps it
   nowhere. */

export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  data: Record<string, string>;
}

/** What other services depend on: queue an email inside your transaction. */
export interface Outbox {
  sendEmail(tx: DbExecutor, msg: EmailMessage): Promise<void>;
}

export interface OutboxDeps {
  jobs: JobsService;
  transport: MailTransport;
  /** The From header, e.g. "Base app <no-reply@example.com>". */
  from: string;
  /** APP_BASE_URL, for links in emails. */
  appBaseUrl: string;
  /** The workspace name for the email header; settings.workspaceName. Takes the open transaction. */
  workspaceName: (tx?: DbExecutor) => Promise<string>;
  now?: () => Date;
}

/** What replaces a token in a stored or shown message. */
export const MASKED_TOKEN = '[sent]';
/* A real token is 43 base64url characters; the pattern is looser so a shorter or longer one in
   some future link is masked too. `%` is there for a percent-encoded value. */
const TOKEN_IN_LINK = /([?&#]token=)[A-Za-z0-9_%.~-]{16,}/g;

/** The message with the value of every `token=` link parameter masked. Null stays null. */
export function maskTokenLinks(text: string): string;
export function maskTokenLinks(text: string | null): string | null;
export function maskTokenLinks(text: string | null): string | null {
  return text === null ? null : text.replace(TOKEN_IN_LINK, `$1${MASKED_TOKEN}`);
}

const EMAIL_ADDRESS = /^[^\s@<>,;"]+@[^\s@<>,;"]+\.[^\s@<>,;"]+$/;
export const SEND_EMAIL_KIND = 'send_email';

const toSummary = (e: OutboundEmailRecord): EmailSummary => ({
  id: e.id,
  to: e.toAddress,
  subject: e.subject,
  template: e.template,
  status: e.status,
  provider: e.provider,
  createdAt: e.createdAt,
  sentAt: e.sentAt,
});

const masked = (e: OutboundEmailRecord) => ({
  bodyText: maskTokenLinks(e.bodyText),
  bodyHtml: maskTokenLinks(e.bodyHtml),
});

export function createOutbox(db: DbClient, deps: OutboxDeps) {
  const now = deps.now ?? (() => new Date());
  const repos = createRepositories(db);

  /* The email row keeps only safe text: a transport's MailError message, or a generic line. The
     last one seen per email waits here for `onGiveUp`; an outcome this process never saw (a
     worker that died, a timeout) gets the generic line. */
  const UNEXPECTED = 'Sending failed unexpectedly.';
  const lastSafeError = new Map<string, string>();

  const sendEmailJob = defineJob<{ emailId: string }>({
    kind: SEND_EMAIL_KIND,
    maxAttempts: 6,
    parse: (raw) => {
      const id = (raw as { emailId?: unknown } | null)?.emailId;
      if (typeof id !== 'string' || id === '') throw new Error('emailId is missing');
      return { emailId: id };
    },
    run: async ({ emailId }) => {
      const email = await repos.outboundEmails.byId(emailId);
      if (!email) throw new PermanentJobError('The email row no longer exists.');
      if (email.status === 'sent') return; // a job that runs twice sends once
      if (email.status === 'failed') {
        // its link is masked now: sending it again would send a dead link
        throw new PermanentJobError('This email failed for good; send a new one instead.');
      }
      try {
        const out = await deps.transport.send({
          from: deps.from,
          to: email.toAddress,
          subject: email.subject,
          text: email.bodyText,
          ...(email.bodyHtml ? { html: email.bodyHtml } : {}),
        });
        lastSafeError.delete(email.id);
        await repos.outboundEmails.markSent(email.id, out.providerMessageId, now(), masked(email));
      } catch (err) {
        lastSafeError.set(email.id, err instanceof MailError ? err.message : UNEXPECTED);
        if (err instanceof MailError && !err.retryable) throw new PermanentJobError(err.message);
        throw err;
      }
    },
    /* queued → failed lives here, not in `run`: the queue calls this however it gave up (a 4xx,
       the last retry, a timeout on the last attempt, a worker that kept dying), so no email is
       left queued for ever with a live link in its body. */
    onGiveUp: async ({ emailId }) => {
      const error = lastSafeError.get(emailId) ?? UNEXPECTED;
      lastSafeError.delete(emailId);
      const email = await repos.outboundEmails.byId(emailId);
      if (email?.status !== 'queued') return;
      await repos.outboundEmails.markFailed(email.id, error, masked(email));
    },
  });
  deps.jobs.register(sendEmailJob);

  const outbox: Outbox = {
    async sendEmail(tx, msg) {
      const to = msg.to.trim();
      if (to.length > 254 || !EMAIL_ADDRESS.test(to)) {
        throw new Error('sendEmail: the recipient is not an email address.');
      }
      const rendered = renderEmail(msg.template, msg.data, {
        appName: await deps.workspaceName(tx),
        appBaseUrl: deps.appBaseUrl,
      });
      const id = newId();
      await createRepositories(tx).outboundEmails.insert({
        id,
        toAddress: to,
        subject: rendered.subject,
        template: msg.template,
        bodyText: rendered.text,
        bodyHtml: rendered.html,
        provider: deps.transport.name,
        createdAt: now(),
      });
      await deps.jobs.enqueueJob(tx, sendEmailJob, { emailId: id });
    },
  };

  return {
    ...outbox,
    sendEmailJob,

    // ---- the admin Mail page ----

    async list(
      query: { page?: number; pageSize?: number } = {},
    ): Promise<Omit<EmailsResponse, 'ok'>> {
      const page = query.page ?? 1;
      const pageSize = query.pageSize ?? 25;
      if (!Number.isInteger(page) || page < 1 || page > 100_000) {
        throw new ServiceError(
          'invalid',
          'invalid_page',
          '"page" must be a whole number from 1.',
          'page',
        );
      }
      if (!Number.isInteger(pageSize) || pageSize < 1 || pageSize > 100) {
        throw new ServiceError(
          'invalid',
          'invalid_page_size',
          '"pageSize" must be 1 to 100.',
          'pageSize',
        );
      }
      const [rows, total] = await Promise.all([
        repos.outboundEmails.page({ limit: pageSize, offset: (page - 1) * pageSize }),
        repos.outboundEmails.count(),
      ]);
      return { emails: rows.map(toSummary), total, page, pageSize };
    },

    async get(id: string): Promise<EmailDetail> {
      const e = await repos.outboundEmails.byId(id);
      if (!e) throw new ServiceError('not_found', 'email_not_found', 'No such email.');
      return {
        ...toSummary(e),
        // a message still queued holds its real link: the page never shows it
        bodyText: maskTokenLinks(e.bodyText),
        providerMessageId: e.providerMessageId,
        error: e.error,
      };
    },
  };
}
export type OutboxService = ReturnType<typeof createOutbox>;

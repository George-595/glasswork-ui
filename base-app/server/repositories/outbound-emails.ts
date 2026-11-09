import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for the email outbox: a row is written first, then a job sends it and records the result.
   Nothing here sends mail or decides what to send. */
export type EmailStatus = 'queued' | 'sent' | 'failed';

export interface OutboundEmailRecord {
  id: string;
  toAddress: string;
  subject: string;
  template: string;
  bodyText: string;
  bodyHtml: string | null;
  status: EmailStatus;
  provider: string;
  providerMessageId: string | null;
  error: string | null;
  createdAt: string;
  sentAt: string | null;
}

type EmailRow = {
  id: string;
  to_address: string;
  subject: string;
  template: string;
  body_text: string;
  body_html: string | null;
  status: string;
  provider: string;
  provider_message_id: string | null;
  error: string | null;
  created_at: string;
  sent_at: string | null;
};

const COLUMNS =
  'id, to_address, subject, template, body_text, body_html, status, provider, provider_message_id, error, created_at, sent_at';

const toEmail = (r: EmailRow): OutboundEmailRecord => ({
  id: r.id,
  toAddress: r.to_address,
  subject: r.subject,
  template: r.template,
  bodyText: r.body_text,
  bodyHtml: r.body_html,
  status: r.status as EmailStatus,
  provider: r.provider,
  providerMessageId: r.provider_message_id,
  error: r.error,
  createdAt: r.created_at,
  sentAt: r.sent_at,
});

export function outboundEmailsRepository(db: DbExecutor) {
  return {
    async insert(e: {
      id: string;
      toAddress: string;
      subject: string;
      template: string;
      bodyText: string;
      bodyHtml?: string | null;
      provider: string;
      createdAt: Date;
    }): Promise<void> {
      await db.execute(
        `INSERT INTO outbound_emails
           (id, to_address, subject, template, body_text, body_html, status, provider, created_at)
         VALUES (?, ?, ?, ?, ?, ?, 'queued', ?, ?)`,
        [
          e.id,
          e.toAddress,
          e.subject.slice(0, 300),
          e.template,
          e.bodyText,
          e.bodyHtml ?? null,
          e.provider,
          e.createdAt,
        ],
      );
    },
    async byId(id: string): Promise<OutboundEmailRecord | null> {
      const [row] = await db.query<EmailRow>(
        `SELECT ${COLUMNS} FROM outbound_emails WHERE id = ?`,
        [id],
      );
      return row ? toEmail(row) : null;
    },
    /** Newest first (the admin Mail page). */
    async latest(limit: number): Promise<OutboundEmailRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(limit)));
      const rows = await db.query<EmailRow>(
        `SELECT ${COLUMNS} FROM outbound_emails ORDER BY created_at DESC, id DESC LIMIT ${n}`,
      );
      return rows.map(toEmail);
    },
    /** One page, newest first (the admin Mail page). */
    async page(opts: { limit: number; offset: number }): Promise<OutboundEmailRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(opts.limit)));
      const off = Math.max(0, Math.min(1_000_000, Math.floor(opts.offset)));
      const rows = await db.query<EmailRow>(
        `SELECT ${COLUMNS} FROM outbound_emails ORDER BY created_at DESC, id DESC LIMIT ${n} OFFSET ${off}`,
      );
      return rows.map(toEmail);
    },
    async count(): Promise<number> {
      const [row] = await db.query<{ n: number | string }>(
        'SELECT COUNT(*) AS n FROM outbound_emails',
      );
      return Number(row?.n ?? 0);
    },
    /** Retention: deletes emails created before `before`. */
    async deleteCreatedBefore(before: Date): Promise<number> {
      const r = await db.execute('DELETE FROM outbound_emails WHERE created_at < ?', [before]);
      return r.rowsAffected;
    },
    /* An email is queued → sent | failed, once: both writes only move a row that is still
       queued, so a late or repeated outcome never turns a sent email into a failed one. */
    /** Records the delivery; false when the row was no longer queued. `bodies` replaces the stored text and HTML in the same statement (the
        outbox passes them with the token links masked: a delivered message needs no live secret). */
    async markSent(
      id: string,
      providerMessageId: string | null,
      at: Date,
      bodies?: { bodyText: string; bodyHtml: string | null },
    ): Promise<boolean> {
      const r = await db.execute(
        `UPDATE outbound_emails SET status = 'sent', provider_message_id = ?, error = NULL, sent_at = ?${
          bodies ? ', body_text = ?, body_html = ?' : ''
        } WHERE id = ? AND status = 'queued'`,
        [
          providerMessageId?.slice(0, 200) ?? null,
          at,
          ...(bodies ? [bodies.bodyText, bodies.bodyHtml] : []),
          id,
        ],
      );
      return r.rowsAffected === 1;
    },
    /** Gives up on the email; false when the row was no longer queued. */
    async markFailed(
      id: string,
      error: string,
      bodies?: { bodyText: string; bodyHtml: string | null },
    ): Promise<boolean> {
      const r = await db.execute(
        `UPDATE outbound_emails SET status = 'failed', error = ?${
          bodies ? ', body_text = ?, body_html = ?' : ''
        } WHERE id = ? AND status = 'queued'`,
        [error.slice(0, 4000), ...(bodies ? [bodies.bodyText, bodies.bodyHtml] : []), id],
      );
      return r.rowsAffected === 1;
    },
  };
}
export type OutboundEmailsRepository = ReturnType<typeof outboundEmailsRepository>;

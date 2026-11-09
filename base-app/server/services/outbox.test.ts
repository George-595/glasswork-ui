import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { createDbClient } from '../infra/db/index.ts';
import { migrate } from '../infra/db/migrate.ts';
import type { DbClient } from '../infra/db/types.ts';
import { MailError, type MailMessage, type MailTransport } from '../infra/mail/index.ts';
import { createRepositories } from '../repositories/index.ts';
import { createJobsService, type JobsService } from './jobs.ts';
import { createOutbox, type OutboxService } from './outbox.ts';
import { createSettingsService, type SettingsService } from './settings.ts';

const T0 = new Date('2026-10-12T10:00:00.000Z');
const INVITE = {
  name: 'Priya',
  inviterName: 'Ada',
  link: 'https://app.example.com/accept-invite#token=t1',
  expiresIn: '7 days',
};

let db: DbClient;
let clock: Date;
let jobs: JobsService;
let settings: SettingsService;
let outbox: OutboxService;
let sent: MailMessage[];
let behave: (msg: MailMessage) => Promise<{ providerMessageId: string | null }>;

const advance = (ms: number): void => {
  clock = new Date(clock.getTime() + ms);
};
const transport: MailTransport = {
  name: 'log',
  send: (msg) => {
    sent.push(msg);
    return behave(msg);
  },
};

const emails = () =>
  db.query<{
    id: string;
    status: string;
    error: string | null;
    provider_message_id: string | null;
  }>('SELECT id, status, error, provider_message_id FROM outbound_emails');
const jobRows = () =>
  db.query<{ status: string; attempts: number; last_error: string | null }>(
    'SELECT status, attempts, last_error FROM jobs',
  );
const send = (
  to = 'priya@example.com',
  template: 'invite' = 'invite',
  data: Record<string, string> = INVITE,
) => db.transaction((tx) => outbox.sendEmail(tx, { to, template, data }));
const drain = async () => {
  await jobs.tick();
  await jobs.idle();
};

beforeEach(async () => {
  clock = new Date(T0);
  sent = [];
  behave = async () => ({ providerMessageId: 'msg-1' });
  db = await createDbClient('sqlite::memory:');
  await migrate(db);
  const now = () => clock;
  settings = createSettingsService(db, { now });
  jobs = createJobsService(db, { now, random: () => 0.5 });
  outbox = createOutbox(db, {
    jobs,
    transport,
    from: 'Acme <no-reply@example.com>',
    appBaseUrl: 'https://app.example.com',
    workspaceName: (tx) => settings.workspaceName(tx),
    now,
  });
});
afterEach(async () => {
  await db.close();
});

describe('sendEmail (the transactional outbox)', () => {
  it('writes a queued row and a send_email job together, and sends nothing itself', async () => {
    await send();
    const [row] = await db.query<Record<string, unknown>>('SELECT * FROM outbound_emails');
    expect(row).toMatchObject({
      to_address: 'priya@example.com',
      subject: 'Ada invited you to Base app',
      template: 'invite',
      status: 'queued',
      provider: 'log',
    });
    expect(String(row?.body_text)).toContain(INVITE.link);
    expect(String(row?.body_html)).toContain('<!doctype html>');
    const [job] = await db.query<{ kind: string; payload: string; status: string }>(
      'SELECT * FROM jobs',
    );
    expect(job).toMatchObject({ kind: 'send_email', status: 'queued' });
    expect(JSON.parse(job?.payload ?? '{}')).toEqual({ emailId: row?.id });
    expect(sent).toHaveLength(0);
  });

  it('rolls back with the caller: no row and no job', async () => {
    await expect(
      db.transaction(async (tx) => {
        await outbox.sendEmail(tx, { to: 'priya@example.com', template: 'invite', data: INVITE });
        throw new Error('the invite failed afterwards');
      }),
    ).rejects.toThrow('the invite failed');
    expect(await emails()).toHaveLength(0);
    expect(await jobRows()).toHaveLength(0);
    await drain();
    expect(sent).toHaveLength(0);
  });

  it('a bad recipient or missing data throws before anything is written', async () => {
    await expect(send('not-an-address')).rejects.toThrow(/recipient/);
    await expect(send('a@example.com', 'invite', { name: 'x' })).rejects.toThrow(
      /needs "inviterName"/,
    );
    await expect(send('a@b.co\r\nBcc: x@y.z')).rejects.toThrow(/recipient/);
    expect(await emails()).toHaveLength(0);
    expect(await jobRows()).toHaveLength(0);
  });

  it('uses the workspace name from the settings in the email', async () => {
    await db.execute(
      `INSERT INTO users (id, email, name, role, status, team, created_at, updated_at)
       VALUES ('admin-1', 'ada@example.com', 'Ada', 'admin', 'active', 'Ops', ?, ?)`,
      [T0, T0],
    );
    await settings.update(
      { 'workspace.name': 'Acme HQ' },
      { id: 'admin-1', name: 'Ada', email: 'ada@example.com', role: 'admin' },
      'ip',
    );
    await send();
    const [row] = await db.query<{ subject: string; body_text: string }>(
      'SELECT subject, body_text FROM outbound_emails',
    );
    expect(row?.subject).toBe('Ada invited you to Acme HQ');
    expect(row?.body_text.endsWith('\nAcme HQ')).toBe(true);
  });
});

describe('the send_email job', () => {
  it('sends through the transport and records the provider id', async () => {
    await send();
    await drain();
    expect(sent).toEqual([
      expect.objectContaining({
        from: 'Acme <no-reply@example.com>',
        to: 'priya@example.com',
        subject: 'Ada invited you to Base app',
      }),
    ]);
    expect(sent[0]?.html).toContain('<!doctype html>');
    expect(await emails()).toEqual([
      expect.objectContaining({ status: 'sent', provider_message_id: 'msg-1', error: null }),
    ]);
    const [e] = await db.query<{ sent_at: string }>('SELECT sent_at FROM outbound_emails');
    expect(e?.sent_at).toBe(T0.toISOString());
    expect(await jobRows()).toEqual([expect.objectContaining({ status: 'succeeded' })]);
  });

  it('retries a retryable failure with backoff, then succeeds', async () => {
    let calls = 0;
    behave = async () => {
      calls += 1;
      if (calls === 1) throw new MailError('Resend answered 503', { retryable: true, status: 503 });
      return { providerMessageId: 'msg-2' };
    };
    await send();
    await drain();
    expect((await emails())[0]?.status).toBe('queued'); // not failed: it will be retried
    expect(await jobRows()).toEqual([
      expect.objectContaining({ status: 'queued', attempts: 1, last_error: 'Resend answered 503' }),
    ]);
    advance(60_000);
    await drain();
    expect(calls).toBe(2);
    expect(await emails()).toEqual([
      expect.objectContaining({ status: 'sent', provider_message_id: 'msg-2' }),
    ]);
  });

  it('marks the email failed when the last attempt fails, and the job dead', async () => {
    behave = async () => {
      throw new MailError('Resend request timed out', { retryable: true });
    };
    await send();
    for (let i = 0; i < 6; i++) {
      await drain();
      advance(2 * 60 * 60_000);
    }
    expect(sent).toHaveLength(6);
    expect(await emails()).toEqual([
      expect.objectContaining({ status: 'failed', error: 'Resend request timed out' }),
    ]);
    expect(await jobRows()).toEqual([expect.objectContaining({ status: 'dead', attempts: 6 })]);
  });

  it('does not retry a permanent failure (a 4xx): failed at once, one send only', async () => {
    behave = async () => {
      throw new MailError('Resend answered 422 (validation_error)', {
        retryable: false,
        status: 422,
      });
    };
    await send();
    await drain();
    advance(24 * 60 * 60_000);
    await drain();
    expect(sent).toHaveLength(1);
    expect(await emails()).toEqual([
      expect.objectContaining({
        status: 'failed',
        error: 'Resend answered 422 (validation_error)',
      }),
    ]);
    expect(await jobRows()).toEqual([expect.objectContaining({ status: 'failed', attempts: 1 })]);
  });

  it('an unexpected error keeps its details out of the email row', async () => {
    behave = async () => {
      throw new Error('ECONNRESET to 10.0.0.5 with key re_secret');
    };
    await send();
    for (let i = 0; i < 6; i++) {
      await drain();
      advance(2 * 60 * 60_000);
    }
    const [e] = await emails();
    expect(e).toMatchObject({ status: 'failed', error: 'Sending failed unexpectedly.' });
  });

  it('never sends an email twice, even if its job runs twice', async () => {
    await send();
    await drain();
    // a duplicate job for the same row (a retry after a lost acknowledgement)
    const [row] = await emails();
    await db.transaction((tx) => jobs.enqueue(tx, 'send_email', { emailId: row?.id }));
    await drain();
    expect(sent).toHaveLength(1);
  });

  it('a job for a row that is gone fails permanently', async () => {
    await db.transaction((tx) => jobs.enqueue(tx, 'send_email', { emailId: 'gone' }));
    await drain();
    expect(await jobRows()).toEqual([
      expect.objectContaining({ status: 'failed', last_error: 'The email row no longer exists.' }),
    ]);
  });
});

describe('the admin Mail page data', () => {
  it('lists newest first with paging, and shows one email with its text body only', async () => {
    for (let i = 0; i < 3; i++) {
      advance(1_000);
      await send(`user${i}@example.com`);
    }
    const page1 = await outbox.list({ pageSize: 2 });
    expect(page1).toMatchObject({ total: 3, page: 1, pageSize: 2 });
    expect(page1.emails.map((e) => e.to)).toEqual(['user2@example.com', 'user1@example.com']);
    expect((await outbox.list({ page: 2, pageSize: 2 })).emails.map((e) => e.to)).toEqual([
      'user0@example.com',
    ]);

    const id = page1.emails[0]?.id ?? '';
    const detail = await outbox.get(id);
    expect(detail).toMatchObject({ id, template: 'invite', status: 'queued', error: null });
    expect(detail.bodyText).toContain(INVITE.link);
    expect(detail).not.toHaveProperty('bodyHtml');
    expect(page1.emails[0]).not.toHaveProperty('bodyText');

    await expect(outbox.get('nope')).rejects.toMatchObject({ code: 'email_not_found' });
    await expect(outbox.list({ page: 0 })).rejects.toMatchObject({ code: 'invalid_page' });
    await expect(outbox.list({ pageSize: 500 })).rejects.toMatchObject({
      code: 'invalid_page_size',
    });
  });
});

describe('transports are called with what the row holds', () => {
  it('passes the stored text and html unchanged', async () => {
    const spy = vi.fn<MailTransport['send']>(async () => ({ providerMessageId: null }));
    behave = spy;
    await send();
    await drain();
    const [row] = await db.query<{ body_text: string; body_html: string }>(
      'SELECT body_text, body_html FROM outbound_emails',
    );
    expect(spy).toHaveBeenCalledWith(
      expect.objectContaining({ text: row?.body_text, html: row?.body_html }),
    );
  });
});

describe('a working link is not kept once it has been sent (SEC-03)', () => {
  const TOKEN = 'Zk3-9aQ_vL0mP2xR7sT4uW6yB8cD1eF5gH9iJ-kLmNo';
  const LIVE = {
    ...INVITE,
    link: `https://app.example.com/accept-invite#token=${TOKEN}`,
  };
  const everythingStored = async (): Promise<string> =>
    JSON.stringify(await db.query('SELECT * FROM outbound_emails')) +
    JSON.stringify(await db.query('SELECT * FROM jobs'));

  it('the token is 43 characters, as the real ones are', () => {
    expect(TOKEN).toHaveLength(43);
  });

  it('sends the real link, then leaves no token in the row, the text or the html', async () => {
    await send('priya@example.com', 'invite', LIVE);
    // queued: the job needs the real body, and the job holds only the email id
    expect(await everythingStored()).toContain(TOKEN);
    expect(JSON.stringify(await db.query('SELECT payload FROM jobs'))).not.toContain(TOKEN);
    await drain();
    // the transport was given the working link
    expect(sent[0]?.text).toContain(TOKEN);
    expect(sent[0]?.html).toContain(TOKEN);
    // nothing stored has it, and no 43-character token-looking value is left
    const stored = await everythingStored();
    expect(stored).not.toContain(TOKEN);
    expect(stored).not.toMatch(/token=[A-Za-z0-9_-]{43}/);
    const [row] = await db.query<{ body_text: string; body_html: string; status: string }>(
      'SELECT body_text, body_html, status FROM outbound_emails',
    );
    expect(row?.status).toBe('sent');
    expect(row?.body_text).toContain('/accept-invite#token=[sent]');
    expect(row?.body_html).toContain('token=[sent]');
    // the rest of the message is intact
    expect(row?.body_text).toContain('Priya');
  });

  it('masks a message that failed for good too, and the Mail page never shows a live link', async () => {
    behave = async () => {
      throw new MailError('Provider rejected the message (HTTP 422).', {
        retryable: false,
        status: 422,
      });
    };
    await send('priya@example.com', 'invite', LIVE);
    const [queued] = await db.query<{ id: string }>('SELECT id FROM outbound_emails');
    // still queued: the page masks it
    expect((await outbox.get(queued?.id ?? '')).bodyText).not.toContain(TOKEN);
    expect((await outbox.get(queued?.id ?? '')).bodyText).toContain('token=[sent]');
    await drain();
    expect((await emails())[0]?.status).toBe('failed');
    expect(await everythingStored()).not.toContain(TOKEN);
  });

  it('an email whose worker kept dying ends failed and masked, never queued for ever', async () => {
    await send('priya@example.com', 'invite', LIVE);
    const repo = createRepositories(db).jobs;
    const [job] = await db.query<{ id: string }>('SELECT id FROM jobs');
    for (let i = 0; i < 6; i++) {
      await repo.claim(job?.id ?? '', `dies-${i}`, clock); // claimed, then the process died
      advance(60 * 60_000);
      await repo.releaseStale(new Date(clock.getTime() - 30 * 60_000), clock);
    }
    await drain();
    expect(sent).toHaveLength(0);
    expect((await jobRows())[0]?.status).toBe('dead');
    expect((await emails())[0]).toMatchObject({
      status: 'failed',
      error: 'Sending failed unexpectedly.',
    });
    expect(await everythingStored()).not.toContain(TOKEN);
  });

  it('retrying the job of an email that failed for good does not report a send', async () => {
    behave = async () => {
      throw new MailError('Provider rejected the message (HTTP 422).', {
        retryable: false,
        status: 422,
      });
    };
    await send();
    await drain();
    behave = async () => ({ providerMessageId: 'msg-9' });
    await db.execute("UPDATE jobs SET status = 'queued', attempts = 0");
    await drain();
    expect((await jobRows())[0]?.status).toBe('failed');
    expect((await emails())[0]?.status).toBe('failed');
    expect(sent).toHaveLength(1);
  });

  it('a retry that is still waiting keeps the real body so the retry can send it', async () => {
    let calls = 0;
    behave = async () => {
      calls++;
      if (calls === 1)
        throw new MailError('Provider is down (HTTP 503).', { retryable: true, status: 503 });
      return { providerMessageId: 'msg-2' };
    };
    await send('priya@example.com', 'invite', LIVE);
    await drain();
    expect(await everythingStored()).toContain(TOKEN);
    advance(60_000);
    await drain();
    expect(sent.at(-1)?.text).toContain(TOKEN);
    expect(await everythingStored()).not.toContain(TOKEN);
  });
});

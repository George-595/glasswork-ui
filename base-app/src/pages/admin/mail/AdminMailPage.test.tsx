import { act } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import type { EmailDetail, EmailSummary } from '~/core/api';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import AdminMailPage from './AdminMailPage';

const MAIL = (n: number, over: Partial<EmailSummary> = {}): EmailSummary => ({
  id: `em_${n}`,
  to: `user${n}@example.com`,
  subject: `Subject ${n}`,
  template: 'password_reset',
  status: 'sent',
  provider: 'log',
  createdAt: `2026-10-12T10:0${n}:00.000Z`,
  sentAt: `2026-10-12T10:0${n}:05.000Z`,
  ...over,
});

const LINK = 'https://app.example.com/#/reset-password?token=abc123';
const DETAIL = (e: EmailSummary): EmailDetail => ({
  ...e,
  bodyText: `Hello,\n\nChoose a new password:\n${LINK}\n\n-- Base app`,
  providerMessageId: null,
  error: e.status === 'failed' ? 'Resend answered 422 (validation_error)' : null,
});

const EMAILS = [
  MAIL(3, { status: 'queued', sentAt: null }),
  MAIL(2, { status: 'failed', sentAt: null }),
  MAIL(1),
];

function mail(emails: EmailSummary[] = EMAILS, total = emails.length) {
  return mockApi({
    routes: {
      'GET /api/admin/emails': (req) => ({
        body: {
          ok: true,
          emails,
          total,
          page: Number(req.query.get('page')),
          pageSize: Number(req.query.get('pageSize')),
        },
      }),
      'GET /api/admin/emails/em_1': { body: { ok: true, email: DETAIL(MAIL(1)) } },
      'GET /api/admin/emails/em_2': {
        body: { ok: true, email: DETAIL(EMAILS[1] as EmailSummary) },
      },
    },
  });
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function renderPage(opts: Parameters<typeof render>[1] = {}) {
  view = await render(
    <main>
      <AdminMailPage />
    </main>,
    opts,
  );
  await flush();
}

const rows = () => getAllByRole(document.body, 'row').slice(1);

describe('AdminMailPage', () => {
  it('lists the emails with recipient, subject, template, a status word and the time', async () => {
    const api = mail();
    await renderPage();
    expect(getByRole(document.body, 'heading', 'Mail')).toBeTruthy();
    expect(api.calls).toContain('GET /api/admin/emails');
    const text = rows().map((r) => r.textContent);
    expect(text).toHaveLength(3);
    expect(text[0]).toContain('user3@example.com');
    expect(text[0]).toContain('Subject 3');
    expect(text[0]).toContain('password_reset');
    expect(text[0]).toContain('Queued');
    expect(text[1]).toContain('Failed');
    expect(text[2]).toContain('Sent');
    expect(text[2]).toMatch(/12 Oct 2026/);
  });

  it('asks the server for the page, the size the reader chose, and says how many there are', async () => {
    const api = mail(EMAILS, 60);
    await renderPage();
    const first = api.fetch.mock.calls[0]?.[0];
    expect(String(first)).toContain('/admin/emails?page=1&pageSize=25');
    expect(document.body.textContent).toContain('Showing 1–25 of 60 emails');
    await click(getByRole(document.body, 'button', 'Next'));
    await flush();
    expect(
      api.fetch.mock.calls.map((c) => String(c[0])).some((u) => u.includes('page=2&pageSize=25')),
    ).toBe(true);
  });

  it('opens an email: the text body with its link clickable, and why a failed one failed', async () => {
    mail();
    await renderPage();
    await click(getAllByRole(rows()[2] as HTMLElement, 'button')[0] as HTMLElement);
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.textContent).toContain('To user1@example.com');
    const a = sheet.querySelector(`a[href="${LINK}"]`) as HTMLAnchorElement;
    expect(a).toBeTruthy();
    expect(a.getAttribute('target')).toBe('_blank');
    expect(sheet.textContent).toContain('The log transport only records the email');
    expect(sheet.querySelector('iframe, script')).toBeNull();
  });

  it('shows the error of a failed email in its drawer', async () => {
    mail();
    await renderPage();
    await click(getAllByRole(rows()[1] as HTMLElement, 'button')[0] as HTMLElement);
    await flush();
    expect((document.querySelector('[role="dialog"]') as HTMLElement).textContent).toContain(
      'Resend answered 422 (validation_error)',
    );
  });

  it('has an empty state, and Refresh asks again', async () => {
    const api = mail([], 0);
    await renderPage();
    expect(document.body.textContent).toContain('No emails yet');
    await click(getByRole(document.body, 'button', 'Refresh'));
    await flush();
    expect(api.calls.filter((c) => c === 'GET /api/admin/emails')).toHaveLength(2);
  });

  it('says so when the list cannot be loaded, and offers a retry', async () => {
    mockApi({
      routes: {
        'GET /api/admin/emails': {
          status: 500,
          body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
        },
      },
    });
    await renderPage();
    expect(getByRole(document.body, 'alert')).toBeTruthy();
    expect(getByRole(document.body, 'button', /retry|try again/i)).toBeTruthy();
  });
});

describe('a11y mail', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`list · ${skin} · ${mode}`, async () => {
        mail();
        await renderPage({ skin, mode });
        expect(formatViolations(await runAxe())).toBe('');
      });

      it(`open email · ${skin} · ${mode}`, async () => {
        mail();
        await renderPage({ skin, mode });
        await click(getAllByRole(rows()[2] as HTMLElement, 'button')[0] as HTMLElement);
        await flush();
        await act(async () => {});
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});

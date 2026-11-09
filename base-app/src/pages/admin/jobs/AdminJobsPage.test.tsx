import { afterEach, describe, expect, it } from 'vitest';
import type { JobStatus, JobSummary, JobsResponse } from '~/core/api';
import { Toaster } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getAllByRole, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import AdminJobsPage from './AdminJobsPage';

const JOB = (id: string, status: JobStatus, over: Partial<JobSummary> = {}): JobSummary => ({
  id,
  kind: 'send_email',
  status,
  attempts: status === 'queued' ? 0 : 3,
  maxAttempts: 6,
  runAt: '2026-10-12T10:00:00.000Z',
  lastError: status === 'dead' || status === 'failed' ? 'Resend answered 503' : null,
  dedupeKey: null,
  createdAt: '2026-10-12T09:00:00.000Z',
  updatedAt: '2026-10-12T10:00:00.000Z',
  ...over,
});

const COUNTS = { queued: 1, running: 0, succeeded: 7, failed: 1, dead: 2 };
const JOBS = [
  JOB('j_dead', 'dead'),
  JOB('j_failed', 'failed', { kind: 'prune_jobs', lastError: 'No handler is registered' }),
  JOB('j_queued', 'queued'),
  JOB('j_ok', 'succeeded'),
];

/* A stateful fake: filtering by status and retrying behave as the server's do. */
function jobs() {
  let list = [...JOBS];
  const api = mockApi({
    routes: {
      'GET /api/admin/jobs': (req) => {
        const status = req.query.get('status');
        const rows = status ? list.filter((j) => j.status === status) : list;
        return {
          body: {
            ok: true,
            jobs: rows,
            total: rows.length,
            page: Number(req.query.get('page')),
            pageSize: Number(req.query.get('pageSize')),
            counts: COUNTS,
          } satisfies JobsResponse,
        };
      },
      'POST /api/admin/jobs/j_dead/retry': () => {
        list = list.map((j) =>
          j.id === 'j_dead' ? { ...j, status: 'queued' as const, attempts: 0 } : j,
        );
        return { body: { ok: true, job: list.find((j) => j.id === 'j_dead') } };
      },
      'POST /api/admin/jobs/j_failed/retry': {
        status: 409,
        body: {
          ok: false,
          error: {
            code: 'job_not_retryable',
            message: 'Only a failed or dead job can be retried.',
          },
        },
      },
    },
  });
  return api;
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function renderPage(opts: Parameters<typeof render>[1] = {}) {
  view = await render(
    <main>
      <AdminJobsPage />
      <Toaster />
    </main>,
    opts,
  );
  await flush();
}

const rows = () => getAllByRole(document.body, 'row').slice(1);
const toasts = () =>
  Array.from(document.querySelectorAll('.ui-toast'))
    .map((t) => t.textContent)
    .join(' | ');

describe('AdminJobsPage', () => {
  it('shows the count of every status on top', async () => {
    jobs();
    await renderPage();
    const group = getByRole(document.body, 'group', 'Jobs by status');
    const text = group.textContent ?? '';
    for (const [label, n] of [
      ['Queued', 1],
      ['Running', 0],
      ['Succeeded', 7],
      ['Failed', 1],
      ['Dead', 2],
    ] as const) {
      expect(text).toContain(label);
      expect(text).toContain(String(n));
    }
  });

  it('lists the jobs with kind, a status word, attempts, run time and the last error', async () => {
    jobs();
    await renderPage();
    const text = rows().map((r) => r.textContent ?? '');
    expect(text).toHaveLength(4);
    expect(text[0]).toContain('send_email');
    expect(text[0]).toContain('Dead');
    expect(text[0]).toContain('3 of 6');
    expect(text[0]).toContain('Resend answered 503');
    expect(text[0]).toMatch(/12 Oct 2026/);
    expect(text[2]).toContain('None');
  });

  it('filters by status through the server', async () => {
    const api = jobs();
    await renderPage();
    await click(getByRole(document.body, 'radio', 'Dead'));
    await flush();
    expect(
      api.fetch.mock.calls.map((c) => String(c[0])).some((u) => u.includes('status=dead')),
    ).toBe(true);
    expect(rows().map((r) => r.textContent)).toHaveLength(1);
  });

  it('offers Retry on failed and dead jobs only', async () => {
    jobs();
    await renderPage();
    const menus = (row: HTMLElement) => row.querySelectorAll('button[aria-haspopup="menu"]').length;
    const [dead, failed, queued, ok] = rows();
    expect(menus(dead as HTMLElement)).toBe(1);
    expect(menus(failed as HTMLElement)).toBe(1);
    expect(menus(queued as HTMLElement)).toBe(0);
    expect(menus(ok as HTMLElement)).toBe(0);
  });

  it('retries a dead job from its row menu, says so, and reloads', async () => {
    const api = jobs();
    await renderPage();
    const trigger = (rows()[0] as HTMLElement).querySelector(
      'button[aria-haspopup="menu"]',
    ) as HTMLElement;
    await click(trigger);
    await click(getByRole(document.body, 'menuitem', 'Retry'));
    await flush();
    expect(api.calls).toContain('POST /api/admin/jobs/j_dead/retry');
    expect(toasts()).toContain('Job queued again');
    expect((rows()[0] as HTMLElement).textContent).toContain('Queued');
  });

  it('shows the server’s refusal when a retry is not allowed', async () => {
    jobs();
    await renderPage();
    const trigger = (rows()[1] as HTMLElement).querySelector(
      'button[aria-haspopup="menu"]',
    ) as HTMLElement;
    await click(trigger);
    await click(getByRole(document.body, 'menuitem', 'Retry'));
    await flush();
    expect(toasts()).toContain('Couldn’t retry the job');
    expect(toasts()).toContain('Only a failed or dead job can be retried.');
  });

  it('opens a job: the fields, the last error, and a Retry button for a dead one', async () => {
    jobs();
    await renderPage();
    await click(getAllByRole(rows()[0] as HTMLElement, 'button')[0] as HTMLElement);
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(sheet.textContent).toContain('j_dead');
    expect(sheet.textContent).toContain('Resend answered 503');
    expect(getByRole(sheet, 'button', 'Retry')).toBeTruthy();
    expect(sheet.textContent).not.toContain('payload');
  });

  it('has no Retry in the drawer of a job that is not failed or dead', async () => {
    jobs();
    await renderPage();
    await click(getAllByRole(rows()[3] as HTMLElement, 'button')[0] as HTMLElement);
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    expect(
      Array.from(sheet.querySelectorAll('button')).some((b) => b.textContent === 'Retry'),
    ).toBe(false);
  });

  it('says so when the queue cannot be read', async () => {
    mockApi({
      routes: {
        'GET /api/admin/jobs': {
          status: 500,
          body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
        },
      },
    });
    await renderPage();
    expect(getAllByRole(document.body, 'alert').length).toBeGreaterThan(0);
  });
});

describe('a11y jobs', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`list · ${skin} · ${mode}`, async () => {
        jobs();
        await renderPage({ skin, mode });
        expect(formatViolations(await runAxe())).toBe('');
      });

      it(`open job · ${skin} · ${mode}`, async () => {
        jobs();
        await renderPage({ skin, mode });
        await click(getAllByRole(rows()[0] as HTMLElement, 'button')[0] as HTMLElement);
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});

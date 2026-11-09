import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { AuditEvent } from '~/core/api';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getAllByRole, getByRole } from '~/test/dom';
import { mockApi } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import AuditLogPage from './AuditLogPage';

const NOW = new Date('2026-10-10T12:00:00Z');

function ev(id: string, at: string, over: Partial<AuditEvent> = {}): AuditEvent {
  return {
    id,
    at,
    actor: 'ada@example.com',
    action: 'login',
    target: 'session',
    ip: '192.0.2.1',
    outcome: 'success',
    ...over,
  };
}

/* Today (2), yesterday (1), 5 days ago (1), 20 days ago (1), 70 days ago (1). */
const EVENTS: AuditEvent[] = [
  ev('evt_1', '2026-10-10T09:00:00Z'),
  ev('evt_2', '2026-10-10T08:00:00Z', {
    actor: 'bob@example.com',
    action: 'export',
    target: 'transactions.csv',
  }),
  ev('evt_3', '2026-10-09T15:00:00Z', {
    actor: 'bob@example.com',
    action: 'user.suspend',
    target: 'sam@example.com',
  }),
  ev('evt_4', '2026-10-05T10:00:00Z', { outcome: 'failure' }),
  ev('evt_5', '2026-09-20T10:00:00Z', { action: 'user.invite', target: 'new@example.com' }),
  ev('evt_6', '2026-08-01T10:00:00Z'),
];

const SERVER_ERROR = {
  status: 500,
  body: { ok: false, error: { code: 'internal_error', message: 'Boom' } },
};

function logApi(events: AuditEvent[] = EVENTS) {
  return mockApi({ routes: { 'GET /api/audit-log': { body: { ok: true, events } } } });
}

async function renderPage() {
  await render(
    <main>
      <AuditLogPage />
    </main>,
  );
  await flush();
}

/** Open the date-range picker and take one of its quick ranges ("Clear date range" for all time). */
async function pickRange(name: string) {
  if (name === 'All time') {
    await click(getByRole(document.body, 'button', 'Clear date range'));
    return;
  }
  await click(getByRole(document.body, 'button', 'Date range'));
  await flush();
  await click(getByRole(document.body, 'button', name));
  await flush();
}

const eventRows = () =>
  Array.from(document.querySelectorAll<HTMLElement>('table tbody tr')).filter((r) =>
    r.querySelector('td'),
  );
const status = () => getByRole(document.body, 'status').textContent;

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] });
  vi.setSystemTime(NOW);
});
afterEach(() => {
  vi.useRealTimers();
});

describe('AuditLogPage', () => {
  it('shows a labelled skeleton and busy region while the log loads', async () => {
    mockApi({ delay: true });
    await renderPage();
    expect(getByRole(document.body, 'heading', 'Audit log')).toBeTruthy();
    expect(document.querySelector('section[aria-busy="true"]')).not.toBeNull();
  });

  it('shows an error with Retry, and Retry loads the log again', async () => {
    let calls = 0;
    const api = mockApi({
      routes: {
        'GET /api/audit-log': () => {
          calls += 1;
          return calls === 1 ? SERVER_ERROR : { body: { ok: true, events: [] } };
        },
      },
    });
    await renderPage();
    const alert = getByRole(document.body, 'alert');
    expect(alert.textContent).toContain('Couldn’t load the audit log.');
    await click(getByRole(alert, 'button', 'Retry'));
    await flush();
    expect(api.calls.filter((c) => c === 'GET /api/audit-log')).toHaveLength(2);
    expect(status()).toBe('0 of 0 events shown');
    expect(document.body.textContent).toContain('No events yet');
  });

  it('lists every event in one captioned table, newest first', async () => {
    logApi();
    await renderPage();
    expect(document.querySelectorAll('caption')).toHaveLength(1);
    expect(eventRows().map((r) => r.querySelector('code')?.textContent)).toEqual([
      'login',
      'export',
      'user.suspend',
      'login',
      'user.invite',
      'login',
    ]);
    expect(status()).toBe('6 of 6 events shown');
  });

  it('opens a row in a sheet with its full record, as a list and as JSON', async () => {
    logApi();
    await renderPage();
    await click(getByRole(document.body, 'button', 'Open export by bob@example.com'));
    await flush();
    const sheet = document.querySelector('[role="dialog"]') as HTMLElement;
    const dl = sheet.querySelector('dl') as HTMLElement;
    expect(dl.textContent).toContain('evt_2');
    expect(dl.textContent).toContain('transactions.csv');
    expect(dl.textContent).toContain('192.0.2.1');
    const json = sheet.querySelector('pre[aria-label="Raw event evt_2"] code') as HTMLElement;
    expect(JSON.parse(json.textContent ?? '')).toEqual(EVENTS[1]);
  });

  it('filters by the Today / Last 7 / 30 / 90 days quick ranges and clears to all time', async () => {
    logApi();
    await renderPage();
    await pickRange('Today');
    expect(eventRows()).toHaveLength(2);
    expect(status()).toBe('2 of 6 events shown');
    expect(getByRole(document.body, 'button', 'Date range').textContent).toContain('10 Oct 2026');
    await pickRange('Last 7 days');
    expect(eventRows()).toHaveLength(4);
    await pickRange('Last 30 days');
    expect(eventRows()).toHaveLength(5);
    await pickRange('Last 90 days');
    expect(eventRows()).toHaveLength(6);
    await pickRange('All time');
    expect(eventRows()).toHaveLength(6);
    expect(getByRole(document.body, 'button', 'Date range').textContent).toBe('All time');
  });

  it('searches across actor, action, target and IP', async () => {
    logApi();
    await renderPage();
    await changeValue(getByRole(document.body, 'textbox', 'Search audit events'), 'sam@');
    // the field reports after a short pause
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 300));
    await flush();
    expect(eventRows()).toHaveLength(1);
    expect(eventRows()[0]?.textContent).toContain('user.suspend');
  });

  it('filters by actor with counts, and Clear all brings everything back', async () => {
    logApi();
    await renderPage();
    const trigger = getAllByRole(document.body, 'button', /^Actor/).find((b) =>
      b.hasAttribute('aria-expanded'),
    ) as HTMLElement;
    await click(trigger);
    await flush();
    const boxes = getAllByRole(document.body, 'checkbox');
    const bob = boxes.find((c) =>
      c.closest('label')?.textContent?.startsWith('bob@example.com'),
    ) as HTMLElement;
    expect(bob.closest('label')?.textContent).toContain('2');
    await click(bob);
    await flush();
    expect(eventRows()).toHaveLength(2);
    const chips = document.querySelector('[aria-label="Active filters"]') as HTMLElement;
    expect(chips.textContent).toContain('Actor: bob@example.com');
    await click(getByRole(chips, 'button', 'Clear all'));
    await flush();
    expect(eventRows()).toHaveLength(6);
  });

  it('says so when the filters leave nothing, and offers to clear them', async () => {
    logApi();
    await renderPage();
    // filter to a failure first, then to a day that has none
    const trigger = getAllByRole(document.body, 'button', /^Outcome/).find((b) =>
      b.hasAttribute('aria-expanded'),
    ) as HTMLElement;
    await click(trigger);
    await flush();
    const failure = getAllByRole(document.body, 'checkbox').find((c) =>
      c.closest('label')?.textContent?.startsWith('failure'),
    ) as HTMLElement;
    await click(failure);
    await flush();
    await pickRange('Today');
    expect(document.body.textContent).toContain('No events match these filters');
    await click(getAllByRole(document.body, 'button', 'Clear all').at(-1) as HTMLElement);
    await flush();
    expect(eventRows()).toHaveLength(6);
  });

  it('pages a long log, 25 events at a time', async () => {
    const many = Array.from({ length: 30 }, (_, i) =>
      ev(`evt_${i}`, new Date(NOW.getTime() - i * 3_600_000).toISOString()),
    );
    logApi(many);
    await renderPage();
    expect(eventRows()).toHaveLength(25);
    expect(status()).toBe('30 of 30 events shown');
    await click(getByRole(document.body, 'button', 'Next'));
    expect(eventRows()).toHaveLength(5);
  });

  it('exports the filtered events as CSV', async () => {
    logApi();
    let blob: Blob | undefined;
    URL.createObjectURL = vi.fn<(b: Blob) => string>((b) => {
      blob = b;
      return 'blob:audit';
    });
    URL.revokeObjectURL = vi.fn<(u: string) => void>();
    vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {});
    await renderPage();
    await pickRange('Today');
    await click(getByRole(document.body, 'button', 'Export CSV'));
    const text = await blob?.text();
    const lines = (text ?? '').trim().split('\r\n');
    expect(lines[0]).toBe('When,Actor,Action,Target,IP,Outcome,Event ID');
    expect(lines).toHaveLength(3);
    expect(lines.join('\n')).toContain('transactions.csv');
    expect(lines.join('\n')).not.toContain('sam@example.com');
  });
});

describe('a11y audit log', () => {
  const passes = [
    ['enterprise', 'light'],
    ['enterprise', 'dark'],
    ['glass', 'light'],
    ['glass', 'dark'],
  ] as const;

  for (const [skin, mode] of passes) {
    it(`${skin} · ${mode}`, async () => {
      logApi();
      await render(
        <main>
          <AuditLogPage />
        </main>,
        { skin, mode },
      );
      await flush();
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`with a row open · ${skin} · ${mode}`, async () => {
      logApi();
      await render(
        <main>
          <AuditLogPage />
        </main>,
        { skin, mode },
      );
      await flush();
      await click(getByRole(document.body, 'button', 'Open export by bob@example.com'));
      await flush();
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`with the Actor filter open · ${skin} · ${mode}`, async () => {
      logApi();
      await render(
        <main>
          <AuditLogPage />
        </main>,
        { skin, mode },
      );
      await flush();
      const trigger = getAllByRole(document.body, 'button', /^Actor/).find((b) =>
        b.hasAttribute('aria-expanded'),
      ) as HTMLElement;
      await click(trigger);
      await flush();
      expect(formatViolations(await runAxe())).toBe('');
    });

    it(`while loading · ${skin} · ${mode}`, async () => {
      const api = mockApi({ delay: true });
      await render(
        <main>
          <AuditLogPage />
        </main>,
        { skin, mode },
      );
      await flush();
      expect(formatViolations(await runAxe())).toBe('');
      api.release();
    });
  }
});

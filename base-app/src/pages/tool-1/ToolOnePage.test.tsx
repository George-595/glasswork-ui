import { act } from 'react';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Toaster, toast } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getAllByRole, getByRole, press } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { flush, type Rendered, type RenderOptions, render as renderRaw } from '~/test/render';
import ToolOnePage from './ToolOnePage';

/* The shared setup empties <body> between tests but cannot unmount what React mounted, and
   toasts live in a module-level store: unmount ourselves and let the toasts leave. The app
   mounts the one Toaster (App.tsx); a page rendered alone gets one here. */
const mounted: Rendered[] = [];
async function render(ui: Parameters<typeof renderRaw>[0], opts?: RenderOptions) {
  const r = await renderRaw(
    <>
      {ui}
      <Toaster />
    </>,
    opts,
  );
  mounted.push(r);
  return r;
}
afterEach(async () => {
  toast.dismiss();
  await act(async () => {
    await new Promise((r) => setTimeout(r, 300));
  });
  for (const r of mounted.splice(0)) await r.unmount().catch(() => {});
});

const SCENARIO_KEY = 'app.savings.scenarios';

const field = (name: string) => getByRole(document.body, 'textbox', name) as HTMLInputElement;
const slider = (name: string) => getByRole(document.body, 'slider', name);
const button = (name: string | RegExp) => getByRole(document.body, 'button', name);

function summary(): string {
  return document.querySelector('p[aria-live="polite"]')?.textContent ?? '';
}

/** The summary trails the inputs by 400 ms of quiet; wait it out. */
async function settle(): Promise<void> {
  await act(async () => {
    await new Promise((r) => setTimeout(r, 500));
  });
}

async function saveScenario(name?: string): Promise<void> {
  await click(button('Save scenario'));
  if (name) await changeValue(field('Scenario name'), name);
  await click(button('Save'));
}

const TWO_SCENARIOS = JSON.stringify([
  {
    id: 1,
    name: 'Scenario A',
    raw: {
      initialMinor: '1000',
      monthlyMinor: '100',
      annualRatePct: '4',
      years: '10',
      compounding: 'monthly',
    },
  },
  {
    id: 2,
    name: 'Scenario B',
    raw: {
      initialMinor: '5000',
      monthlyMinor: '300',
      annualRatePct: '6',
      years: '15',
      compounding: 'annual',
    },
  },
]);

describe('ToolOnePage', () => {
  it('updates the summary sentence when an input changes, after a pause', async () => {
    await render(<ToolOnePage />);
    await changeValue(field('Starting amount (£)'), '1000');
    await changeValue(field('Monthly contribution (£)'), '0');
    await changeValue(field('Annual rate (%)'), '12');
    await changeValue(field('Years'), '1');
    // still the first sentence: the live region does not chatter while inputs change
    expect(summary()).toContain('After 10 years');
    await settle();
    expect(summary()).toBe(
      'After 1 year you would have £1,126.83: £1,000.00 contributed and £126.83 interest.',
    );
  });

  it('shows the three key figures, the interest share and the stacked chart', async () => {
    await render(<ToolOnePage />);
    const text = document.body.textContent ?? '';
    for (const label of ['Final balance', 'Total contributed', 'Interest earned']) {
      expect(text).toContain(label);
    }
    expect(getByRole(document.body, 'meter' as never, 'Interest share')).toBeTruthy();
    expect(document.body.textContent).toContain('Contributions and interest by year');
  });

  it('shows an error with aria-invalid and no results when the rate is out of range', async () => {
    await render(<ToolOnePage />);
    const rate = field('Annual rate (%)');
    await changeValue(rate, '30');
    expect(rate.getAttribute('aria-invalid')).toBe('true');
    const errorId = rate.getAttribute('aria-describedby') ?? '';
    expect(document.getElementById(errorId)?.textContent).toContain('from 0 to 25');
    expect(document.body.textContent).toContain('Fix the highlighted fields');
    expect(document.body.textContent).not.toContain('Total contributed');
    expect(document.body.textContent).not.toContain('Year by year');
    expect((button('Save scenario') as HTMLButtonElement).disabled).toBe(true);
    await settle();
    expect(summary()).toBe('Fix the highlighted fields to see the projection.');
  });

  it('keeps each slider and its box in step', async () => {
    await render(<ToolOnePage />);
    const years = slider('Years slider');
    expect(years.getAttribute('aria-valuenow')).toBe('10');
    expect(years.getAttribute('aria-valuetext')).toBe('10 years');

    // slider -> box
    await act(async () => years.focus());
    await press(years, 'ArrowRight');
    expect(field('Years').value).toBe('11');
    await press(years, 'End');
    expect(field('Years').value).toBe('50');

    // box -> slider
    await changeValue(field('Years'), '20');
    expect(years.getAttribute('aria-valuenow')).toBe('20');
    await changeValue(field('Monthly contribution (£)'), '500');
    expect(slider('Monthly contribution slider').getAttribute('aria-valuenow')).toBe('500');
    // text the slider cannot show parks it at its end; the box keeps the text
    await changeValue(field('Starting amount (£)'), '5,000,000');
    expect(slider('Starting amount slider').getAttribute('aria-valuenow')).toBe('100000');
    expect(field('Starting amount (£)').value).toBe('5,000,000');
  });

  it('chooses the compounding with the segmented control', async () => {
    await render(<ToolOnePage />);
    const group = getByRole(document.body, 'radiogroup' as never, 'Compounding');
    const annual = Array.from(group.querySelectorAll<HTMLElement>('button')).find(
      (b) => b.textContent === 'Annual',
    );
    expect(annual).toBeTruthy();
    await click(annual as HTMLElement);
    expect(locationNow()).toContain('comp=annual');
    await settle();
    expect(summary()).toContain('After 10 years');
  });

  it('reproduces a calculation from the URL, and writes edits back to it', async () => {
    setLocation('/tool-1?start=2000&monthly=50&rate=3.5&years=3&comp=annual');
    await render(<ToolOnePage />);
    expect(field('Starting amount (£)').value).toBe('2000');
    expect(field('Monthly contribution (£)').value).toBe('50');
    expect(field('Annual rate (%)').value).toBe('3.5');
    expect(field('Years').value).toBe('3');
    await settle();
    expect(summary()).toContain('After 3 years');

    await changeValue(field('Years'), '5');
    expect(locationNow()).toContain('years=5');
    expect(locationNow()).toContain('start=2000');
  });

  it('puts only what differs from the defaults in the URL, and Reset restores them', async () => {
    await render(<ToolOnePage />);
    expect(locationNow()).not.toContain('years=');
    await changeValue(field('Years'), '7');
    await changeValue(field('Annual rate (%)'), '2');
    expect(locationNow()).toContain('years=7');
    await click(button('Reset'));
    expect(field('Years').value).toBe('10');
    expect(field('Annual rate (%)').value).toBe('5');
    expect(locationNow()).not.toContain('years=');
    expect(locationNow()).not.toContain('rate=');
  });

  it('copies the link and says so in a toast', async () => {
    const writeText = vi.fn<(text: string) => Promise<void>>(() => Promise.resolve());
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    await render(<ToolOnePage />);
    await changeValue(field('Years'), '12');
    await click(button('Copy link'));
    await flush();
    expect(writeText).toHaveBeenCalledWith(expect.stringContaining('years=12'));
    expect(document.body.textContent).toContain('Link copied');
    // the button itself says it too (and a polite status line speaks it)
    expect(button('Copied')).toBeTruthy();
    expect(document.body.textContent).toContain('Copied to clipboard');
  });

  it('says so when the link cannot be copied', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: { writeText: () => Promise.reject(new Error('denied')) },
      configurable: true,
    });
    await render(<ToolOnePage />);
    await click(button('Copy link'));
    await flush();
    expect(document.body.textContent).toContain('Could not copy the link');
  });

  it('saves up to three scenarios, names them, and removes them', async () => {
    await render(<ToolOnePage />);
    expect(document.querySelector('ul[aria-label="Saved scenarios"]')).toBeNull();

    await saveScenario(); // default name
    expect(document.body.textContent).toContain('Scenario A');
    await changeValue(field('Years'), '20');
    await saveScenario('Long haul'); // user-named
    expect(document.body.textContent).toContain('Long haul');
    await changeValue(field('Years'), '30');
    await saveScenario();
    expect(document.body.textContent).toContain('Scenario B');
    expect(document.querySelectorAll('ul[aria-label="Saved scenarios"] > li')).toHaveLength(3);

    // the fourth cannot be saved
    const save = button('Save scenario') as HTMLButtonElement;
    expect(save.disabled).toBe(true);
    expect(
      document.getElementById(save.getAttribute('aria-describedby') ?? '')?.textContent,
    ).toContain('Remove one');

    // they survive a reload
    expect(JSON.parse(localStorage.getItem(SCENARIO_KEY) ?? '[]')).toHaveLength(3);

    await click(button('Remove Long haul'));
    expect(document.querySelector('ul[aria-label="Saved scenarios"]')?.textContent).not.toContain(
      'Long haul',
    );
    expect(document.querySelectorAll('ul[aria-label="Saved scenarios"] > li')).toHaveLength(2);
    expect((button('Save scenario') as HTMLButtonElement).disabled).toBe(false);
  });

  it('loads a saved scenario back into the inputs', async () => {
    localStorage.setItem(SCENARIO_KEY, TWO_SCENARIOS);
    await render(<ToolOnePage />);
    await click(button('Load Scenario B'));
    expect(field('Starting amount (£)').value).toBe('5000');
    expect(field('Years').value).toBe('15');
    expect(locationNow()).toContain('comp=annual');
  });

  it('shows the comparison only from two scenarios', async () => {
    await render(<ToolOnePage />);
    await saveScenario();
    expect(document.body.textContent).not.toContain('Scenario comparison');
    await changeValue(field('Annual rate (%)'), '8');
    await saveScenario();
    expect(document.body.textContent).toContain('Scenario comparison');
    const table = getAllByRole(document.body, 'table').filter((t) =>
      t.querySelector('caption')?.textContent?.includes('Scenario comparison table'),
    );
    expect(table).toHaveLength(1);
    expect(table[0]?.querySelectorAll('tbody tr')).toHaveLength(2);
    await click(button('Remove Scenario B'));
    expect(document.body.textContent).not.toContain('Scenario comparison');
  });

  it('ignores stored scenarios that are not well formed', async () => {
    localStorage.setItem(SCENARIO_KEY, JSON.stringify([{ id: 'x' }, 7, null]));
    await render(<ToolOnePage />);
    expect(document.querySelector('ul[aria-label="Saved scenarios"]')).toBeNull();
  });

  it('has a totals row and exports the table as CSV', async () => {
    const save = vi.fn<(filename: string, csv: string) => void>();
    await render(<ToolOnePage csvSink={{ save }} />);
    const foot = document.querySelector('tfoot');
    expect(foot?.textContent).toContain('Final (year 10)');
    await click(button('Export CSV'));
    expect(save).toHaveBeenCalledTimes(1);
    const [name, csv] = save.mock.calls[0] ?? [];
    expect(name).toBe('savings-projection.csv');
    const lines = (csv ?? '').trim().split(/\r?\n/);
    expect(lines[0]).toBe('Year,Balance,Contributed,Interest');
    expect(lines).toHaveLength(11);
  });
});

describe('a11y Tool 1 page', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['dark', 'light'] as const) {
      it(`${skin} · ${mode}`, async () => {
        await render(<ToolOnePage />, { skin, mode });
        await flush();
        expect(formatViolations(await runAxe())).toBe('');
      });

      it(`${skin} · ${mode} · with two scenarios`, async () => {
        localStorage.setItem(SCENARIO_KEY, TWO_SCENARIOS);
        await render(<ToolOnePage />, { skin, mode });
        await flush();
        expect(document.body.textContent).toContain('Scenario comparison');
        expect(formatViolations(await runAxe())).toBe('');
      });

      it(`${skin} · ${mode} · invalid input`, async () => {
        await render(<ToolOnePage />, { skin, mode });
        await changeValue(field('Years'), '99');
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});

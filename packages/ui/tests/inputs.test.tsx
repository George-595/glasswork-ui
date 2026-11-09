// @vitest-environment jsdom
/* The input components: Calendar, DatePicker, DateRangePicker, Combobox, MultiSelect, TagInput,
   NumberField, RadioGroup, RadioCards, FileDropzone, InlineEdit, CopyButton, HoldToConfirm.
   Behaviour and keyboard for each, then an axe pass over all of them in every skin x mode.
   jsdom has no layout, so colour-contrast is off here (the token gate and the browser pass of
   `npm run check:a11y` hold contrast). */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { clearMaterialMaps } from '../src/glass';
import {
  Calendar,
  Combobox,
  CopyButton,
  DatePicker,
  DateRangePicker,
  type DayRange,
  EMPTY_RANGE,
  FileDropzone,
  FormField,
  fileAccepted,
  formatBytes,
  HoldToConfirm,
  InlineEdit,
  MultiSelect,
  NumberField,
  RadioCards,
  RadioGroup,
  TagInput,
} from '../src/index';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  const g = globalThis as { ResizeObserver?: unknown };
  g.ResizeObserver ??= ResizeObserverStub;
  const proto = Element.prototype as Partial<{
    hasPointerCapture: (id: number) => boolean;
    releasePointerCapture: (id: number) => void;
    setPointerCapture: (id: number) => void;
    scrollIntoView: () => void;
  }>;
  proto.hasPointerCapture ??= () => false;
  proto.releasePointerCapture ??= () => {};
  proto.setPointerCapture ??= () => {};
  proto.scrollIntoView ??= () => {};
});

let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  vi.useRealTimers();
  vi.restoreAllMocks();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}
const $ = <E extends Element = HTMLElement>(sel: string) => document.querySelector(sel) as E;
const $$ = (sel: string) => Array.from(document.querySelectorAll<HTMLElement>(sel));
const active = () => document.activeElement as HTMLElement;
const click = (el: Element) => act(() => (el as HTMLElement).click());
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
  });
}
function keyUp(el: Element, k: string) {
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keyup', { key: k, bubbles: true, cancelable: true }));
  });
}
function type(el: HTMLInputElement, text: string) {
  act(() => {
    el.focus();
    const set = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, 'value')?.set;
    set?.call(el, text);
    el.dispatchEvent(new Event('input', { bubbles: true }));
  });
}
const flush = () =>
  act(async () => {
    await new Promise((r) => setTimeout(r, 0));
  });
const day = (iso: string) => $<HTMLButtonElement>(`button[data-day="${iso}"]`);
const TODAY = '2026-10-12';

describe('Calendar', () => {
  it('draws the month with Intl names, Monday first, today marked, six weeks', () => {
    render(<Calendar today={TODAY} />);
    expect($('[aria-live=polite]').textContent).toBe('October 2026');
    const heads = $$('[role=columnheader] .sr-only').map((h) => h.textContent);
    expect(heads[0]).toBe('Monday');
    expect(heads[6]).toBe('Sunday');
    expect($$('button[data-day]').length).toBe(42);
    expect(day(TODAY).getAttribute('aria-current')).toBe('date');
    expect(day(TODAY).getAttribute('aria-label')).toBe('Monday, 12 October 2026');
    // 1 Oct 2026 is a Thursday, so the grid starts on Monday 28 Sept
    expect(day('2026-09-28')).not.toBeNull();
  });

  it('marks the chosen day on its gridcell and in the selected look', () => {
    render(<Calendar today={TODAY} value="2026-10-20" />);
    const cell = day('2026-10-20').closest('[role=gridcell]');
    expect(cell?.getAttribute('aria-selected')).toBe('true');
    expect(day('2026-10-21').closest('[role=gridcell]')?.getAttribute('aria-selected')).toBe(
      'false',
    );
    expect(day('2026-10-20').className).toContain('bg-selected');
    expect(day('2026-10-20').className).toContain('border-brand');
  });

  it('has one tab stop and moves it with the arrow keys, PageUp/Down, Home and End', () => {
    const picks: string[] = [];
    render(<Calendar today={TODAY} value="2026-10-14" onValueChange={(d) => picks.push(d)} />);
    expect($$('button[data-day][tabindex="0"]').map((b) => b.dataset.day)).toEqual(['2026-10-14']);
    act(() => day('2026-10-14').focus());
    key(active(), 'ArrowRight');
    expect(active().dataset.day).toBe('2026-10-15');
    key(active(), 'ArrowDown');
    expect(active().dataset.day).toBe('2026-10-22');
    key(active(), 'ArrowLeft');
    key(active(), 'ArrowUp');
    expect(active().dataset.day).toBe('2026-10-14');
    key(active(), 'Home'); // Wednesday: Monday is the 12th
    expect(active().dataset.day).toBe('2026-10-12');
    key(active(), 'End');
    expect(active().dataset.day).toBe('2026-10-18');
    key(active(), 'PageDown');
    expect(active().dataset.day).toBe('2026-11-18');
    expect($('[aria-live=polite]').textContent).toBe('November 2026');
    key(active(), 'PageUp', { shiftKey: true });
    expect(active().dataset.day).toBe('2025-11-18');
    // arrows cross a month edge
    key(active(), 'End');
    key(active(), 'ArrowRight');
    expect($('[aria-live=polite]').textContent).toBe('November 2025');
    click(day('2025-11-19'));
    expect(picks).toEqual(['2025-11-19']);
  });

  it('stops at min and max: days are disabled and keys clamp', () => {
    render(<Calendar today={TODAY} value="2026-10-14" min="2026-10-10" max="2026-10-20" />);
    expect(day('2026-10-09').disabled).toBe(true);
    expect(day('2026-10-21').disabled).toBe(true);
    expect(day('2026-10-10').disabled).toBe(false);
    act(() => day('2026-10-14').focus());
    key(active(), 'ArrowDown'); // 21st is out
    expect(active().dataset.day).toBe('2026-10-20');
    expect($<HTMLButtonElement>('button[aria-label="Next month"]').disabled).toBe(true);
    expect($<HTMLButtonElement>('button[aria-label="Previous month"]').disabled).toBe(true);
  });

  it('range mode: start, then end; a click before the start swaps them', () => {
    function Harness() {
      const [r, setR] = useState<DayRange>(EMPTY_RANGE);
      return (
        <>
          <Calendar mode="range" today={TODAY} range={r} onRangeChange={setR} />
          <output>{`${r.from ?? ''}|${r.to ?? ''}`}</output>
        </>
      );
    }
    render(<Harness />);
    click(day('2026-10-10'));
    expect($('output').textContent).toBe('2026-10-10|');
    click(day('2026-10-14'));
    expect($('output').textContent).toBe('2026-10-10|2026-10-14');
    expect(day('2026-10-12').closest('[role=gridcell]')?.getAttribute('aria-selected')).toBe(
      'true',
    );
    expect(day('2026-10-10').getAttribute('aria-label')).toContain('range start');
    expect(day('2026-10-14').getAttribute('aria-label')).toContain('range end');
    expect(day('2026-10-16').closest('[role=gridcell]')?.getAttribute('aria-selected')).toBe(
      'false',
    );
    click(day('2026-10-20'));
    click(day('2026-10-05'));
    expect($('output').textContent).toBe('2026-10-05|2026-10-20');
  });
});

describe('DatePicker', () => {
  function Harness({ presets }: { presets?: boolean }) {
    const [v, setV] = useState<string | null>('2026-10-14');
    return (
      <>
        <FormField label="Due date">
          <DatePicker
            value={v}
            onValueChange={setV}
            today={TODAY}
            clearable
            presets={presets ? [{ label: 'Today', day: (t) => t }] : undefined}
          />
        </FormField>
        <output>{v ?? 'none'}</output>
      </>
    );
  }

  it('shows the value in en-GB, opens on a click with focus on the chosen day, picks and closes', async () => {
    render(<Harness />);
    const trigger = $<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    expect(trigger.textContent).toBe('14 Oct 2026');
    expect(trigger.getAttribute('aria-expanded')).toBe('false');
    // the label names it and the value is its description
    expect(document.querySelector(`label[for="${trigger.id}"]`)?.textContent).toBe('Due date');
    expect(trigger.getAttribute('aria-describedby')).toBeTruthy();
    click(trigger);
    await flush();
    expect(trigger.getAttribute('aria-expanded')).toBe('true');
    expect($('[role=dialog]').getAttribute('aria-label')).toBe('Choose a date');
    expect(active().dataset.day).toBe('2026-10-14');
    click(day('2026-10-20'));
    await flush();
    expect($('output').textContent).toBe('2026-10-20');
    expect($('[role=dialog]')).toBeNull();
    expect(active()).toBe(trigger);
  });

  it('Esc closes and returns focus to the button; Clear empties it; presets pick', async () => {
    render(<Harness presets />);
    const trigger = $<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    click(trigger);
    await flush();
    key(active(), 'Escape');
    await flush();
    expect($('[role=dialog]')).toBeNull();
    expect(active()).toBe(trigger);
    click(trigger);
    await flush();
    click(
      Array.from(document.querySelectorAll('button')).find(
        (b) => b.textContent === 'Today',
      ) as Element,
    );
    await flush();
    expect($('output').textContent).toBe(TODAY);
    click($('button[aria-label="Clear date"]'));
    expect($('output').textContent).toBe('none');
  });
});

describe('DateRangePicker', () => {
  function Harness() {
    const [r, setR] = useState<DayRange>(EMPTY_RANGE);
    return (
      <>
        <FormField label="Period">
          <DateRangePicker value={r} onValueChange={setR} today={TODAY} clearable />
        </FormField>
        <output>{`${r.from ?? ''}|${r.to ?? ''}`}</output>
      </>
    );
  }
  it('offers Last 7 / 30 / 90 days and applies one', async () => {
    render(<Harness />);
    const trigger = $<HTMLButtonElement>('button[aria-haspopup="dialog"]');
    expect(trigger.textContent).toBe('Select a date range');
    click(trigger);
    await flush();
    const names = $$('[aria-label="Quick ranges"] button').map((b) => b.textContent);
    expect(names).toEqual(['Last 7 days', 'Last 30 days', 'Last 90 days']);
    click($$('[aria-label="Quick ranges"] button')[0] as HTMLElement);
    await flush();
    expect($('output').textContent).toBe('2026-10-06|2026-10-12');
    expect(trigger.textContent).toBe('6 Oct 2026 – 12 Oct 2026');
    expect($('[role=dialog]')).toBeNull();
  });
  it('picks two days on the calendar and closes on the second', async () => {
    render(<Harness />);
    click($<HTMLButtonElement>('button[aria-haspopup="dialog"]'));
    await flush();
    click(day('2026-10-05'));
    expect($('[role=dialog]')).not.toBeNull();
    expect($('[role=status]').textContent).toContain('Pick the end day');
    click(day('2026-10-09'));
    await flush();
    expect($('output').textContent).toBe('2026-10-05|2026-10-09');
    expect($('[role=dialog]')).toBeNull();
    click($('button[aria-label="Clear date range"]'));
    expect($('output').textContent).toBe('|');
  });
});

const TEAMS = [
  { value: 'eng', label: 'Engineering', description: 'Platform and apps' },
  { value: 'ops', label: 'Operations' },
  { value: 'fin', label: 'Finance', disabled: true },
  { value: 'des', label: 'Design' },
];

describe('Combobox', () => {
  function Harness() {
    const [v, setV] = useState<string | null>(null);
    return (
      <>
        <FormField label="Team">
          <Combobox options={TEAMS} value={v} onValueChange={setV} clearable />
        </FormField>
        <output>{v ?? 'none'}</output>
      </>
    );
  }
  it('is the ARIA combobox: filters as you type, arrows move, Enter picks', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    expect(box.getAttribute('aria-autocomplete')).toBe('list');
    expect(document.querySelector(`label[for="${box.id}"]`)?.textContent).toBe('Team');
    type(box, 'e');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const list = $(`#${CSS.escape(box.getAttribute('aria-controls') as string)}`);
    expect(list.getAttribute('role')).toBe('listbox');
    // "e" is in Engineering, Operations (op-e-rations), Finance, Design
    expect($$('[role=option]').map((o) => o.textContent)).toEqual([
      'EngineeringPlatform and apps',
      'Operations',
      'Finance',
      'Design',
    ]);
    type(box, 'des');
    expect($$('[role=option]').length).toBe(1);
    expect(box.getAttribute('aria-activedescendant')).toBe($$('[role=option]')[0]?.id);
    key(box, 'Enter');
    expect($('output').textContent).toBe('des');
    expect(box.value).toBe('Design');
    expect(box.getAttribute('aria-expanded')).toBe('false');
  });
  it('skips disabled options, wraps, and Esc closes and restores the text', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    act(() => box.focus());
    key(box, 'ArrowDown'); // opens
    expect(box.getAttribute('aria-expanded')).toBe('true');
    const options = $$('[role=option]');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    key(box, 'ArrowDown');
    key(box, 'ArrowDown'); // Finance is disabled
    expect(box.getAttribute('aria-activedescendant')).toBe(options[3]?.id);
    key(box, 'ArrowDown'); // wraps
    expect(box.getAttribute('aria-activedescendant')).toBe(options[0]?.id);
    key(box, 'ArrowUp');
    expect(box.getAttribute('aria-activedescendant')).toBe(options[3]?.id);
    key(box, 'Escape');
    expect(box.getAttribute('aria-expanded')).toBe('false');
    type(box, 'zzz');
    expect($('[role=status]').textContent).toBe('No matches');
    key(box, 'Escape');
    expect(box.value).toBe('');
  });
  it('picks with the pointer, shows a check and clears', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    click($('button[aria-label="Show options"]'));
    click($$('[role=option]')[1] as HTMLElement);
    expect($('output').textContent).toBe('ops');
    click($('button[aria-label="Show options"]'));
    expect($$('[role=option]')[1]?.getAttribute('aria-selected')).toBe('true');
    expect(box.value).toBe('Operations');
    click($('button[aria-label="Clear selection"]'));
    expect($('output').textContent).toBe('none');
  });
});

describe('MultiSelect', () => {
  function Harness() {
    const [v, setV] = useState<string[]>(['eng']);
    return (
      <>
        <FormField label="Teams">
          <MultiSelect options={TEAMS} value={v} onValueChange={setV} />
        </FormField>
        <output>{v.join(',')}</output>
      </>
    );
  }
  it('shows chips, toggles options and keeps the list open', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    expect($$('.ui-chip').map((c) => c.textContent)).toEqual(['Engineering']);
    act(() => box.focus());
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect($('[role=listbox]').getAttribute('aria-multiselectable')).toBe('true');
    click($$('[role=option]')[3] as HTMLElement); // Design
    expect($('output').textContent).toBe('eng,des');
    expect(box.getAttribute('aria-expanded')).toBe('true');
    expect($('[role=status]:last-of-type').textContent).toBe('Added Design');
    click($$('[role=option]')[0] as HTMLElement); // untick Engineering
    expect($('output').textContent).toBe('des');
  });
  it('removes a chip with its button or Backspace in the empty box', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    act(() => box.focus());
    click($$('[role=option]')[1] as HTMLElement);
    expect($('output').textContent).toBe('eng,ops');
    key(box, 'Backspace');
    expect($('output').textContent).toBe('eng');
    click($('button[aria-label="Remove Engineering"]'));
    expect($('output').textContent).toBe('');
    expect($$('.ui-chip').length).toBe(0);
  });
  it('Enter picks the active option from the keyboard', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input[role=combobox]');
    type(box, 'oper');
    key(box, 'Enter');
    expect($('output').textContent).toBe('eng,ops');
    expect(box.value).toBe('');
  });
});

describe('TagInput', () => {
  function Harness({ validate }: { validate?: (t: string) => string | null }) {
    const [v, setV] = useState<string[]>(['alpha']);
    return (
      <>
        <FormField label="Tags">
          <TagInput value={v} onValueChange={setV} validate={validate} max={4} />
        </FormField>
        <output>{v.join(',')}</output>
      </>
    );
  }
  it('adds on Enter and comma, refuses duplicates, removes by Backspace and button', () => {
    render(<Harness />);
    const box = $<HTMLInputElement>('input');
    type(box, 'beta');
    key(box, 'Enter');
    expect($('output').textContent).toBe('alpha,beta');
    expect(box.value).toBe('');
    type(box, 'gamma');
    key(box, ',');
    expect($('output').textContent).toBe('alpha,beta,gamma');
    type(box, 'ALPHA');
    key(box, 'Enter');
    expect($('output').textContent).toBe('alpha,beta,gamma');
    expect($('[role=alert]').textContent).toContain('already added');
    type(box, '');
    key(box, 'Backspace');
    expect($('output').textContent).toBe('alpha,beta');
    click($('button[aria-label="Remove alpha"]'));
    expect($('output').textContent).toBe('beta');
    expect($('[role=status]').textContent).toBe('Removed alpha');
  });
  it('splits a paste, validates, and stops at max', () => {
    render(<Harness validate={(t) => (t.length < 3 ? `${t} is too short` : null)} />);
    const box = $<HTMLInputElement>('input');
    act(() => {
      const ev = new Event('paste', { bubbles: true, cancelable: true });
      Object.assign(ev, { clipboardData: { getData: () => 'one, two\nxx,three,four' } });
      box.dispatchEvent(ev);
    });
    // alpha + one, two, three (max 4); "xx" is too short and "four" is over the limit
    expect($('output').textContent).toBe('alpha,one,two,three');
    expect($('[role=alert]').textContent).toContain('xx is too short');
    expect($('[role=alert]').textContent).toContain('No more than 4');
  });
});

describe('NumberField', () => {
  function Harness(props: Partial<React.ComponentProps<typeof NumberField>>) {
    const [v, setV] = useState<number | null>(props.value ?? 10);
    return (
      <>
        <FormField label="Amount">
          <NumberField {...props} value={v} onValueChange={setV} />
        </FormField>
        <output>{v === null ? 'null' : String(v)}</output>
      </>
    );
  }
  const box = () => $<HTMLInputElement>('input[role=spinbutton]');
  it('is a spinbutton with the locale format and aria values', () => {
    render(<Harness value={1234.5} min={0} max={5000} step={0.5} />);
    expect(box().value).toBe('1,234.5');
    expect(box().getAttribute('aria-valuenow')).toBe('1234.5');
    expect(box().getAttribute('aria-valuemin')).toBe('0');
    expect(box().getAttribute('aria-valuemax')).toBe('5000');
    expect(box().getAttribute('aria-valuetext')).toBe('1,234.5');
    expect(document.querySelector(`label[for="${box().id}"]`)?.textContent).toBe('Amount');
  });
  it('Up/Down step, PageUp/Down take ten, Home/End jump, all clamped; float-safe', () => {
    render(<Harness value={0.1} min={0} max={1} step={0.1} />);
    key(box(), 'ArrowUp');
    expect($('output').textContent).toBe('0.2');
    key(box(), 'ArrowUp');
    expect($('output').textContent).toBe('0.3'); // not 0.30000000000000004
    key(box(), 'PageUp');
    expect($('output').textContent).toBe('1');
    key(box(), 'ArrowUp');
    expect($('output').textContent).toBe('1');
    key(box(), 'Home');
    expect($('output').textContent).toBe('0');
    key(box(), 'ArrowDown');
    expect($('output').textContent).toBe('0');
    key(box(), 'End');
    expect($('output').textContent).toBe('1');
  });
  it('parses typed text with group separators, applies it live and tidies on blur', () => {
    render(<Harness value={5} min={0} max={10000} />);
    type(box(), '1,234');
    expect($('output').textContent).toBe('1234');
    type(box(), '99999'); // out of range: not applied yet
    expect($('output').textContent).toBe('1234');
    act(() => box().blur());
    expect($('output').textContent).toBe('10000');
    expect(box().value).toBe('10,000');
    type(box(), '');
    expect($('output').textContent).toBe('null');
  });
  it('stepper buttons work, go aria-disabled at a limit and stay out of the tab order', () => {
    render(<Harness value={9} min={0} max={10} />);
    const inc = $<HTMLButtonElement>('button[aria-label="Increase"]');
    const dec = $<HTMLButtonElement>('button[aria-label="Decrease"]');
    expect(inc.tabIndex).toBe(-1);
    click(inc);
    expect($('output').textContent).toBe('10');
    expect(inc.getAttribute('aria-disabled')).toBe('true');
    click(inc);
    expect($('output').textContent).toBe('10');
    click(dec);
    expect($('output').textContent).toBe('9');
  });
  it('formats currency and percent', () => {
    render(
      <Harness
        value={0.075}
        step={0.005}
        formatOptions={{ style: 'percent', maximumFractionDigits: 1 }}
      />,
    );
    expect(box().value).toBe('7.5%');
    type(box(), '10%');
    expect($('output').textContent).toBe('0.1');
  });
});

describe('RadioGroup and RadioCards', () => {
  const ROLES = [
    { value: 'viewer', label: 'Viewer', description: 'Read only' },
    { value: 'editor', label: 'Editor', description: 'Can change things' },
    { value: 'admin', label: 'Admin', disabled: true },
  ];
  it('RadioGroup: native radios in a named radiogroup, one value', () => {
    function Harness() {
      const [v, setV] = useState<string | null>('viewer');
      return (
        <>
          <RadioGroup legend="Role" options={ROLES} value={v} onValueChange={setV} />
          <output>{v}</output>
        </>
      );
    }
    render(<Harness />);
    const group = $('[role=radiogroup]');
    expect(group.tagName).toBe('FIELDSET');
    expect(group.querySelector('legend')?.textContent).toBe('Role');
    const radios = $$('input[type=radio]') as HTMLInputElement[];
    expect(radios.map((r) => r.checked)).toEqual([true, false, false]);
    expect(new Set(radios.map((r) => r.name)).size).toBe(1);
    expect(radios[2]?.disabled).toBe(true);
    click(radios[1] as HTMLElement);
    expect($('output').textContent).toBe('editor');
  });
  it('RadioCards: cards show title and description; the chosen one is selected; error is wired', () => {
    render(
      <RadioCards
        legend="Role"
        options={ROLES}
        value="editor"
        onValueChange={() => {}}
        error="Pick a role."
        required
      />,
    );
    const cards = $$('.ui-radio-card');
    expect(cards.length).toBe(3);
    expect(cards[1]?.className).toContain('bg-selected');
    expect(cards[1]?.className).toContain('border-brand');
    expect(cards[0]?.className).not.toContain('bg-selected');
    expect(cards[1]?.textContent).toContain('Can change things');
    const group = $('[role=radiogroup]');
    expect(group.getAttribute('aria-invalid')).toBe('true');
    expect(group.getAttribute('aria-required')).toBe('true');
    expect(
      document.getElementById(group.getAttribute('aria-describedby') as string)?.textContent,
    ).toBe('Pick a role.');
  });
});

describe('FileDropzone', () => {
  const file = (name: string, size = 100, type = 'text/plain') => {
    const f = new File(['x'], name, { type });
    Object.defineProperty(f, 'size', { value: size });
    return f;
  };
  function Harness(props: Partial<React.ComponentProps<typeof FileDropzone>>) {
    const [files, setFiles] = useState<File[]>([]);
    return <FileDropzone files={files} onFilesChange={setFiles} {...props} />;
  }
  function drop(zone: Element, files: File[]) {
    act(() => {
      const ev = new Event('drop', { bubbles: true, cancelable: true });
      Object.assign(ev, { dataTransfer: { files } });
      zone.dispatchEvent(ev);
    });
  }
  it('is a labelled native file input in a drop zone; dropping adds files to the list', () => {
    render(<Harness hint="PDF or CSV, up to 2 MB" accept=".pdf,.csv" />);
    const input = $<HTMLInputElement>('input[type=file]');
    expect(input.closest('label')?.textContent).toContain('Drop files here or browse');
    expect(input.getAttribute('accept')).toBe('.pdf,.csv');
    const zone = input.closest('[role=presentation]') as Element;
    const label = input.closest('label') as Element;
    act(() => zone.dispatchEvent(new Event('dragover', { bubbles: true, cancelable: true })));
    expect(label.getAttribute('data-dragging')).toBe('true');
    drop(zone, [file('a.pdf', 1500)]);
    expect(label.hasAttribute('data-dragging')).toBe(false);
    expect($$('ul[aria-label="Chosen files"] li').map((l) => l.textContent)).toEqual([
      'a.pdf1.5 KB',
    ]);
    click($('button[aria-label="Remove a.pdf"]'));
    expect($('ul[aria-label="Chosen files"]')).toBeNull();
  });
  it('refuses by type, size and count, naming each file and why', () => {
    const onReject = vi.fn<(r: unknown[]) => void>();
    render(<Harness accept=".pdf" maxSize={1000} maxFiles={2} onReject={onReject} />);
    const zone = $('input[type=file]').closest('[role=presentation]') as Element;
    drop(zone, [file('a.pdf'), file('b.exe'), file('c.pdf', 5000), file('d.pdf'), file('e.pdf')]);
    expect($$('ul[aria-label="Chosen files"] li').length).toBe(2);
    const alert = $('[role=alert]').textContent ?? '';
    expect(alert).toContain('b.exe is not an accepted file type');
    expect(alert).toContain('c.pdf is too large (the limit is 1 KB)');
    expect(alert).toContain('e.pdf would go over the limit of 2 files');
    expect(onReject).toHaveBeenCalledOnce();
  });
  it('browsing goes through the same checks; single mode replaces', () => {
    render(<Harness multiple={false} />);
    const input = $<HTMLInputElement>('input[type=file]');
    const pick = (f: File[]) =>
      act(() => {
        Object.defineProperty(input, 'files', { value: f, configurable: true });
        input.dispatchEvent(new Event('change', { bubbles: true }));
      });
    pick([file('one.txt')]);
    pick([file('two.txt')]);
    expect($$('ul[aria-label="Chosen files"] li').map((l) => l.textContent?.slice(0, 7))).toEqual([
      'two.txt',
    ]);
  });
  it('helpers', () => {
    expect(fileAccepted({ name: 'x.PDF', type: '' }, '.pdf')).toBe(true);
    expect(fileAccepted({ name: 'x.png', type: 'image/png' }, 'image/*')).toBe(true);
    expect(fileAccepted({ name: 'x.png', type: 'image/png' }, 'text/csv,.pdf')).toBe(false);
    expect(fileAccepted({ name: 'x', type: '' }, undefined)).toBe(true);
    expect(formatBytes(999)).toBe('999 B');
    expect(formatBytes(2_500_000)).toBe('2.5 MB');
  });
});

describe('InlineEdit', () => {
  function Harness({ validate }: { validate?: (v: string) => string | null }) {
    const [v, setV] = useState('Q4 plan');
    return (
      <>
        <InlineEdit label="Plan name" value={v} onValueChange={setV} validate={validate} />
        <output>{v}</output>
      </>
    );
  }
  const btn = () => $<HTMLButtonElement>('button[aria-label^="Edit Plan name"]');
  it('click swaps in a focused, selected text box; Enter saves and returns focus', async () => {
    render(<Harness />);
    expect(btn().getAttribute('aria-label')).toBe('Edit Plan name: Q4 plan');
    click(btn());
    const box = $<HTMLInputElement>('input');
    expect(active()).toBe(box);
    expect(box.getAttribute('aria-label')).toBe('Plan name');
    type(box, 'Q1 plan');
    key(box, 'Enter');
    await flush();
    expect($('output').textContent).toBe('Q1 plan');
    expect($('input')).toBeNull();
    expect(active()).toBe(btn());
    expect($('[role=status]').textContent).toBe('Plan name saved');
  });
  it('Esc cancels and keeps the old value; blur saves', async () => {
    render(<Harness />);
    click(btn());
    type($('input'), 'Changed');
    key($('input'), 'Escape');
    await flush();
    expect($('output').textContent).toBe('Q4 plan');
    expect(active()).toBe(btn());
    expect($('[role=status]').textContent).toBe('Edit cancelled');
    click(btn());
    type($('input'), 'Blurred');
    act(() => $<HTMLInputElement>('input').blur());
    expect($('output').textContent).toBe('Blurred');
  });
  it('a refused value keeps the box and says why', () => {
    render(<Harness validate={(v) => (v === '' ? 'Enter a name.' : null)} />);
    click(btn());
    type($('input'), '');
    key($('input'), 'Enter');
    expect($('input')).not.toBeNull();
    expect($('[role=alert]').textContent).toBe('Enter a name.');
    expect($('input').getAttribute('aria-invalid')).toBe('true');
    expect($('output').textContent).toBe('Q4 plan');
  });
});

describe('CopyButton', () => {
  it('copies, swaps its label and announces, then resets', async () => {
    vi.useFakeTimers();
    const writeText = vi.fn<(t: string) => Promise<void>>().mockResolvedValue(undefined);
    Object.defineProperty(navigator, 'clipboard', { value: { writeText }, configurable: true });
    const onCopy = vi.fn<(t: string) => void>();
    render(<CopyButton text="sk-123" label="Copy API key" onCopy={onCopy} />);
    const btn = $<HTMLButtonElement>('button');
    expect(btn.textContent).toBe('Copy API key');
    await act(async () => {
      btn.click();
      await Promise.resolve();
    });
    expect(writeText).toHaveBeenCalledWith('sk-123');
    expect(onCopy).toHaveBeenCalledWith('sk-123');
    expect(btn.textContent).toBe('Copied');
    expect($('[role=status]').textContent).toBe('Copied to clipboard');
    act(() => {
      vi.advanceTimersByTime(2100);
    });
    expect(btn.textContent).toBe('Copy API key');
    expect($('[role=status]').textContent).toBe('');
  });
  it('reports a failure and keeps an icon-only button named', async () => {
    Object.defineProperty(navigator, 'clipboard', {
      value: {
        writeText: vi.fn<(t: string) => Promise<void>>().mockRejectedValue(new Error('no')),
      },
      configurable: true,
    });
    document.execCommand = vi.fn<() => boolean>().mockReturnValue(false);
    const onError = vi.fn<() => void>();
    render(<CopyButton text={() => 'x'} label="Copy link" iconOnly onError={onError} />);
    const btn = $<HTMLButtonElement>('button');
    expect(btn.getAttribute('aria-label')).toBe('Copy link');
    await act(async () => {
      btn.click();
      await new Promise((r) => setTimeout(r, 0));
    });
    expect($('[role=status]').textContent).toBe("Couldn't copy");
    expect(onError).toHaveBeenCalledOnce();
    expect(btn.getAttribute('aria-label')).toBe('Copy link');
  });
});

describe('HoldToConfirm', () => {
  const pointer = (el: Element, type: string) =>
    act(() => {
      el.dispatchEvent(new Event(type, { bubbles: true, cancelable: true }));
    });
  it('commits only after the hold; letting go early does nothing', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn<() => void>();
    render(<HoldToConfirm label="Hold to delete user" onConfirm={onConfirm} duration={1000} />);
    const btn = $<HTMLButtonElement>('button');
    expect(btn.textContent).toBe('Hold to delete user');
    expect(btn.getAttribute('aria-describedby')).toBeTruthy();
    pointer(btn, 'pointerdown');
    expect(btn.getAttribute('data-state')).toBe('holding');
    expect(btn.textContent).toBe('Keep holding…');
    act(() => {
      vi.advanceTimersByTime(600);
    });
    pointer(btn, 'pointerup');
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(onConfirm).not.toHaveBeenCalled();
    expect(btn.getAttribute('data-state')).toBe('idle');
    // a stray pointer tap does not arm it either
    pointer(btn, 'pointerdown');
    pointer(btn, 'pointerup');
    expect(btn.textContent).toBe('Hold to delete user');
    pointer(btn, 'pointerdown');
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(btn.textContent).toBe('Done');
    expect($('[role=status]').textContent).toBe('Done');
  });
  it('keyboard: hold Space, or press twice (the first arms it)', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn<() => void>();
    render(<HoldToConfirm label="Hold to delete" onConfirm={onConfirm} duration={1000} />);
    const btn = $<HTMLButtonElement>('button');
    key(btn, ' ');
    key(btn, ' ', { repeat: true });
    act(() => {
      vi.advanceTimersByTime(1000);
    });
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('keyboard tap arms, the second tap confirms, and the armed state times out', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn<() => void>();
    render(<HoldToConfirm label="Hold to delete" onConfirm={onConfirm} duration={1000} />);
    const btn = $<HTMLButtonElement>('button');
    key(btn, 'Enter');
    keyUp(btn, 'Enter');
    expect(btn.textContent).toBe('Press again to confirm');
    expect($('[role=status]').textContent).toBe('Press again to confirm');
    act(() => {
      vi.advanceTimersByTime(4100);
    });
    expect(btn.textContent).toBe('Hold to delete');
    key(btn, 'Enter');
    keyUp(btn, 'Enter');
    key(btn, 'Enter');
    keyUp(btn, 'Enter');
    expect(onConfirm).toHaveBeenCalledOnce();
  });
  it('a screen reader click (no key or pointer) arms then confirms; controlled reset works', () => {
    vi.useFakeTimers();
    const onConfirm = vi.fn<() => void>();
    function Harness() {
      const [done, setDone] = useState(false);
      return (
        <>
          <HoldToConfirm
            label="Hold to remove"
            onConfirm={() => {
              onConfirm();
              setDone(true);
            }}
            confirmed={done}
          />
          <button type="button" onClick={() => setDone(false)}>
            reset
          </button>
        </>
      );
    }
    render(<Harness />);
    const btn = $<HTMLButtonElement>('button');
    click(btn);
    click(btn);
    expect(onConfirm).toHaveBeenCalledOnce();
    expect(btn.textContent).toBe('Done');
    click($$('button')[1] as Element);
    expect(btn.textContent).toBe('Hold to remove');
  });
});

function Everything() {
  const [d, setD] = useState<string | null>('2026-10-14');
  const [r, setR] = useState<DayRange>({ from: '2026-10-06', to: '2026-10-12' });
  const [c, setC] = useState<string | null>('ops');
  const [m, setM] = useState<string[]>(['eng']);
  const [t, setT] = useState<string[]>(['alpha']);
  const [n, setN] = useState<number | null>(12);
  const [rg, setRg] = useState<string | null>('viewer');
  const [files, setFiles] = useState<File[]>([new File(['x'], 'report.pdf')]);
  const [v, setV] = useState('Q4 plan');
  const roles = [
    { value: 'viewer', label: 'Viewer', description: 'Read only' },
    { value: 'editor', label: 'Editor', description: 'Can change things' },
  ];
  return (
    <main>
      <h1>Inputs</h1>
      <FormField label="Date">
        <DatePicker value={d} onValueChange={setD} today={TODAY} clearable />
      </FormField>
      <FormField label="Period">
        <DateRangePicker value={r} onValueChange={setR} today={TODAY} clearable />
      </FormField>
      <Calendar today={TODAY} value="2026-10-14" />
      <Calendar mode="range" today={TODAY} range={r} label="Range calendar" />
      <FormField label="Team">
        <Combobox options={TEAMS} value={c} onValueChange={setC} clearable />
      </FormField>
      <FormField label="Teams">
        <MultiSelect options={TEAMS} value={m} onValueChange={setM} />
      </FormField>
      <FormField label="Tags" error="Too many">
        <TagInput value={t} onValueChange={setT} />
      </FormField>
      <FormField label="Amount">
        <NumberField value={n} onValueChange={setN} min={0} max={100} suffix="yrs" />
      </FormField>
      <RadioGroup legend="Plain role" options={roles} value={rg} onValueChange={setRg} />
      <RadioCards legend="Card role" options={roles} value={rg} onValueChange={setRg} />
      <FormField label="Attachments">
        <FileDropzone files={files} onFilesChange={setFiles} hint="PDF up to 2 MB" />
      </FormField>
      <InlineEdit label="Plan name" value={v} onValueChange={setV} />
      <CopyButton text="x" label="Copy token" />
      <CopyButton text="x" label="Copy link" iconOnly />
      <HoldToConfirm label="Hold to delete" onConfirm={() => {}} />
    </main>
  );
}

describe('axe: every input, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(<Everything />);
        const results = await axe.run(document.body, {
          runOnly: {
            type: 'tag',
            values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'],
          },
          rules: { 'color-contrast': { enabled: false } },
          resultTypes: ['violations'],
        });
        const report = results.violations
          .map(
            (x) =>
              `${x.id}: ${x.help}\n${x.nodes.map((nd) => `  ${nd.target.join(' ')}`).join('\n')}`,
          )
          .join('\n');
        expect(report).toBe('');
      });
    }
  }
  it('open: the date picker, the range picker and a listbox', async () => {
    render(<Everything />);
    for (const t of $$('button[aria-haspopup="dialog"]')) {
      click(t);
      await flush();
      const results = await axe.run(document.body, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
        rules: { 'color-contrast': { enabled: false } },
        resultTypes: ['violations'],
      });
      expect(results.violations.map((x) => x.id)).toEqual([]);
      key(active(), 'Escape');
      await flush();
    }
    const box = $<HTMLInputElement>('input[role=combobox]');
    act(() => box.focus());
    key(box, 'ArrowDown');
    const results = await axe.run(document.body, {
      runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag22aa'] },
      rules: { 'color-contrast': { enabled: false } },
      resultTypes: ['violations'],
    });
    expect(results.violations.map((x) => x.id)).toEqual([]);
  });
});

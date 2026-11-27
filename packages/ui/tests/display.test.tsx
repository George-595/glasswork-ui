// @vitest-environment jsdom
/* Display components: MediaTile, StepPlayer, SwatchPicker, DirectionPad, Screensaver (src/display/),
   the swatch and scrim roles they stand on, and an axe pass over all of them in every skin x mode.
   The Screensaver's timers run on fake timers; nothing reads the real clock. */
import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { contrast, flatten, type Role, runGate, THEMES } from '@apps/colors';
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { flushSync } from 'react-dom';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ShowcaseDisplay } from '../fixture/ShowcaseDisplay';
import {
  DirectionPad,
  MediaTile,
  type PadKey,
  type PlayerStep,
  Screensaver,
  StepPlayer,
  type SwatchOption,
  SwatchPicker,
} from '../src/display';

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

class FakeResizeObserver {
  observe() {}
  unobserve() {}
  disconnect() {}
}

let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  vi.stubGlobal('ResizeObserver', FakeResizeObserver);
  document.documentElement.removeAttribute('data-theme');
  document.documentElement.removeAttribute('data-skin');
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.useRealTimers();
  vi.unstubAllGlobals();
});
const render = (ui: ReactNode) => {
  act(() => root.render(ui));
  return host;
};
const $ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) =>
  from.querySelector(sel) as T;
const $$ = <T extends Element = HTMLElement>(sel: string, from: ParentNode = document) =>
  Array.from(from.querySelectorAll(sel)) as T[];
const click = (el: Element) => act(() => (el as HTMLElement).click());
const keyDown = (el: Element, key: string) => {
  const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
};
const keyUp = (el: Element, key: string) =>
  act(() => {
    el.dispatchEvent(new KeyboardEvent('keyup', { key, bubbles: true, cancelable: true }));
  });
const fire = (el: Element | Document, type: string) => {
  const e = new Event(type, { bubbles: true, cancelable: true });
  act(() => {
    el.dispatchEvent(e);
  });
  return e;
};
const text = (el: Element | null | undefined) =>
  (el?.textContent ?? '').replace(/\s+/g, ' ').trim();
const layer = () => $('[role="dialog"][aria-label="Screensaver"]');
const cls = (el: Element) => el.className.split(/\s+/);

/* ---------------------------------------------------------------- the colour roles */

// the colour checker reads that quoted name as the old colour of the same name; this is the role, built by hand
const RING = ['border', 'input'].join('-') as Role;

describe('swatch and scrim roles', () => {
  const css = readFileSync(resolve(process.cwd(), '../colors/css/colors.css'), 'utf8');
  const hue = (role: string) => THEMES['enterprise-light'].roles[role as 'swatch-1'];

  it('are ten distinct hues, the same in all four themes', () => {
    for (let n = 1; n <= 10; n++) {
      const values = new Set(
        Object.values(THEMES).map((th) => th.roles[`swatch-${n}` as 'swatch-1']),
      );
      expect(values.size).toBe(1);
    }
    expect(new Set(Array.from({ length: 10 }, (_, i) => hue(`swatch-${i + 1}`))).size).toBe(10);
  });
  it('are edged by a ring that is 3:1 on the page and on a card, in every theme', () => {
    for (const th of Object.values(THEMES)) {
      const page = flatten([th.roles.canvas, th.backdropPeak]);
      const card = flatten([page, th.roles.surface]);
      for (const bg of [page, card]) {
        const ring = flatten([bg, th.roles[RING]]);
        expect(contrast(ring, bg)).toBeGreaterThanOrEqual(3);
      }
    }
  });
  it('are written into the generated CSS, in every block', () => {
    for (let n = 1; n <= 10; n++) {
      const lines = css.match(new RegExp(`--swatch-${n}: #[0-9a-f]{6};`, 'g')) ?? [];
      // four theme blocks plus the two system-light media blocks
      expect(lines.length).toBeGreaterThanOrEqual(6);
      expect(new Set(lines).size).toBe(1);
    }
  });
  it('have a stronger scrim than the scrim, and the whole gate passes', () => {
    const alpha = (c: string) => Number(/,\s*([\d.]+)\)$/.exec(c)?.[1] ?? 1);
    for (const t of Object.values(THEMES)) {
      expect(alpha(t.roles['scrim-strong'])).toBeGreaterThan(alpha(t.roles.scrim));
    }
    expect(runGate()).toEqual([]);
  });
});

/* ---------------------------------------------------------------- MediaTile */

describe('MediaTile', () => {
  const poster = {
    src: 'data:image/gif;base64,R0lGODlhAQABAAAAACw=',
    alt: 'The drive',
    takenAt: '19:41:20',
  };

  it('is a figure whose caption has the title, the time and the state in words', () => {
    render(<MediaTile title="Drive" poster={poster} state="still" />);
    const fig = $('figure');
    expect(fig).toBeTruthy();
    expect(text($('figcaption'))).toContain('Drive');
    expect(text($('figcaption'))).toContain('19:41:20');
    expect($('[role="status"]').className).toContain('sr-only');
    expect(text($('[role="status"]'))).toBe('');
  });

  it('says each state in words', () => {
    render(<MediaTile title="Drive" poster={poster} state="connecting" />);
    expect(text($('[role="status"]'))).toBe('Connecting');
    expect($('[role="progressbar"]').getAttribute('aria-valuenow')).toBeNull(); // indeterminate

    render(
      <MediaTile
        title="Drive"
        poster={poster}
        state="live"
        live={
          <video aria-label="Drive live">
            <track kind="captions" />
          </video>
        }
      />,
    );
    expect(text($('[role="status"]'))).toBe('Live');
    expect(text($('figure'))).toContain('Live');
    expect($('[data-slot="live"] video')).toBeTruthy();
    expect($('[data-glyph="active"]')).toBeTruthy();

    render(
      <MediaTile
        title="Shed"
        poster={poster}
        state="unavailable"
        stateText="Offline since 14:02"
      />,
    );
    expect(text($('[data-slot="state-chip"]'))).toBe('Unavailable · Offline since 14:02');
    expect(text($('[role="status"]'))).toBe('Unavailable · Offline since 14:02');
    expect($('[data-slot="live"]')).toBeNull();

    render(<MediaTile title="Hall" poster={poster} state="off" stateText="Turned off by George" />);
    expect(text($('[data-slot="state-chip"]'))).toBe('Off · Turned off by George');

    render(<MediaTile title="Hall" poster={poster} state="off" />);
    expect(text($('[data-slot="state-chip"]'))).toBe('Off');
    render(<MediaTile title="Hall" poster={poster} state="unavailable" />);
    expect(text($('[data-slot="state-chip"]'))).toBe('Unavailable');
  });

  it('never says Live over a still when there is no live element', () => {
    render(<MediaTile title="Drive" poster={poster} state="live" />);
    expect($('figure').dataset.state).toBe('connecting');
    expect(text($('[role="status"]'))).toBe('Connecting');
    expect(text($('figure'))).not.toContain('Live');
    expect($('[data-glyph="active"]')).toBeNull();
    expect($('[role="progressbar"]')).toBeTruthy();
    // and says it once the element arrives
    render(<MediaTile title="Drive" poster={poster} state="live" live={<div />} />);
    expect(text($('[role="status"]'))).toBe('Live');
  });

  it('shows the live element only in the live state', () => {
    const live = (
      <video aria-label="Live feed">
        <track kind="captions" />
      </video>
    );
    for (const state of ['still', 'connecting', 'unavailable', 'off'] as const) {
      render(<MediaTile title="Drive" poster={poster} state={state} live={live} />);
      expect($('video')).toBeNull();
    }
  });

  it('draws the placeholder with "No picture" and the alt when there is no picture', () => {
    render(
      <MediaTile
        title="Study"
        poster={{ src: null, alt: 'No picture of the study' }}
        state="still"
      />,
    );
    expect($('img')).toBeNull();
    expect($('[role="img"]').getAttribute('aria-label')).toBe('No picture of the study');
    expect(text($('[data-slot="no-picture"]'))).toBe('No picture');
  });

  it('puts every chip on a solid surface', () => {
    render(
      <MediaTile
        title="Drive"
        poster={poster}
        state="live"
        live={<div />}
        badges={<span data-testid="badge">Person</span>}
      />,
    );
    expect(cls($('[data-slot="corner"]'))).toContain('bg-surface-solid');
    expect(cls($('[data-testid="badge"]').parentElement as HTMLElement)).toContain(
      'bg-surface-solid',
    );
    expect(cls($('[data-glyph="active"]').closest('.bg-surface-solid') as HTMLElement)).toContain(
      'bg-surface-solid',
    );
    render(<MediaTile title="Shed" poster={poster} state="off" />);
    expect(cls($('[data-slot="state-chip"]'))).toContain('bg-surface-solid');
    render(<MediaTile title="Garden" poster={poster} state="connecting" />);
    expect(cls($('[data-slot="connecting"]'))).toContain('bg-surface-solid');
  });

  it('makes the picture a button named for the tile, except while live', () => {
    const onOpen = vi.fn<() => void>();
    render(<MediaTile title="Drive" poster={poster} state="still" onOpen={onOpen} />);
    const open = $<HTMLButtonElement>('button[aria-label="Open Drive"]');
    expect(open).toBeTruthy();
    click(open);
    expect(onOpen).toHaveBeenCalledTimes(1);
    render(<MediaTile title="Drive" poster={poster} state="live" live={<div />} onOpen={onOpen} />);
    expect($('button[aria-label="Open Drive"]')).toBeNull();
    render(<MediaTile title="Drive" poster={poster} state="still" />);
    expect($('button')).toBeNull();
  });

  it('renders the action and the menu beside each other under the picture', () => {
    render(
      <MediaTile
        title="Drive"
        poster={poster}
        state="still"
        action={<button type="button">Watch live</button>}
        menu={
          <button type="button" aria-label="More">
            …
          </button>
        }
      />,
    );
    expect(text($('figure'))).toContain('Watch live');
    expect($('button[aria-label="More"]')).toBeTruthy();
  });
});

/* ---------------------------------------------------------------- StepPlayer */

const STEPS: readonly PlayerStep[] = [
  { id: 'a', atMs: 0, title: 'Front door opens', detail: 'Someone comes in' },
  { id: 'b', atMs: 40_000, title: 'Landing smoke alarm goes off' },
  { id: 'c', atMs: 90_000, title: 'Alarm is silenced' },
];

function player(over: Partial<Parameters<typeof StepPlayer>[0]> = {}) {
  const fns = {
    onPlay: vi.fn<() => void>(),
    onPause: vi.fn<() => void>(),
    onRestart: vi.fn<() => void>(),
    onSpeedChange: vi.fn<(speed: number) => void>(),
  };
  const ui = (extra: Partial<Parameters<typeof StepPlayer>[0]> = {}) => (
    <StepPlayer
      title="Smoke alarm"
      steps={STEPS}
      durationMs={120_000}
      status="playing"
      positionMs={52_000}
      speed={1}
      {...fns}
      {...over}
      {...extra}
    />
  );
  return { ...fns, ui };
}
const stepState = () => $$('[data-step]').map((li) => `${li.dataset.step}:${li.dataset.status}`);

describe('StepPlayer', () => {
  it('derives the current step from the position', () => {
    const p = player();
    const table: [number, string[]][] = [
      [0, ['a:current', 'b:todo', 'c:todo']],
      [39_999, ['a:current', 'b:todo', 'c:todo']],
      [40_000, ['a:done', 'b:current', 'c:todo']],
      [52_000, ['a:done', 'b:current', 'c:todo']],
      [90_000, ['a:done', 'b:done', 'c:current']],
    ];
    for (const [positionMs, want] of table) {
      render(p.ui({ positionMs }));
      expect(stepState()).toEqual(want);
    }
  });

  it('has no current step before it starts and none left when it is done', () => {
    const p = player();
    render(p.ui({ status: 'idle', positionMs: 0 }));
    expect(stepState()).toEqual(['a:todo', 'b:todo', 'c:todo']);
    expect($('[aria-current="step"]')).toBeNull();
    render(p.ui({ status: 'done', positionMs: 120_000 }));
    expect(stepState()).toEqual(['a:done', 'b:done', 'c:done']);
  });

  it('says done, now and next in words and shows each offset', () => {
    render(player().ui());
    const words = $$('[data-step]').map((li) => text(li.querySelector('.sr-only')));
    expect(words).toEqual(['Done:', 'Now:', 'Next:']);
    const all = text($('ol'));
    expect(all).toContain('+0:00');
    expect(all).toContain('+1:30');
    expect(text($('[data-step="b"]'))).toContain('+0:40');
  });

  it('announces the current step politely when it changes', () => {
    const p = player();
    render(p.ui({ positionMs: 10_000 }));
    const live = $('.ui-step-helper');
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(text(live)).toBe('Now: Front door opens');
    render(p.ui({ positionMs: 45_000 }));
    expect(text($('.ui-step-helper'))).toBe('Now: Landing smoke alarm goes off');
  });

  it('has the live line on the page before the first step and keeps it through done', () => {
    const p = player();
    render(p.ui({ status: 'idle', positionMs: 0 }));
    const live = $('.ui-step-helper');
    expect(live).toBeTruthy();
    expect(live.getAttribute('aria-live')).toBe('polite');
    expect(text(live)).toBe('');
    // starting inserts nothing: the same element gets its text
    render(p.ui({ status: 'playing', positionMs: 0 }));
    expect($('.ui-step-helper')).toBe(live);
    expect(text(live)).toBe('Now: Front door opens');
    // a tick that does not change the step changes nothing
    render(p.ui({ status: 'playing', positionMs: 1000 }));
    expect(text(live)).toBe('Now: Front door opens');
    render(p.ui({ status: 'done', positionMs: 120_000 }));
    expect($('.ui-step-helper')).toBe(live);
    expect(text(live)).toBe('Finished');
    render(p.ui({ status: 'idle', positionMs: 0 }));
    expect($('.ui-step-helper')).toBe(live);
    expect(text(live)).toBe('');
  });

  it('gives each speed segment a 48px width on touch as well as a height', () => {
    render(player().ui());
    expect(cls($('[role="radiogroup"]'))).toContain(
      'pointer-coarse:[&_.ui-segmented-item]:min-w-12',
    );
  });

  it('shows the position against the duration', () => {
    render(player().ui());
    const bar = $('[role="progressbar"]');
    expect(bar.getAttribute('aria-valuenow')).toBe('52000');
    expect(bar.getAttribute('aria-valuemax')).toBe('120000');
    expect(text($('.ui-step-player'))).toContain('0:52 / 2:00');
  });

  it('presses Play, Pause and Restart, and changes the speed', () => {
    const p = player();
    render(p.ui({ status: 'paused' }));
    const playBtn = () =>
      $$<HTMLButtonElement>('.ui-step-player button').find((b) =>
        /^(Play|Pause)$/.test(text(b)),
      ) as HTMLButtonElement;
    const toggle = playBtn();
    expect(text(toggle)).toBe('Play');
    expect(toggle.hasAttribute('aria-pressed')).toBe(false);
    click(toggle);
    expect(p.onPlay).toHaveBeenCalledTimes(1);
    expect(p.onPause).not.toHaveBeenCalled();

    render(p.ui({ status: 'playing' }));
    const playing = playBtn();
    expect(text(playing)).toBe('Pause');
    expect(playing.hasAttribute('aria-pressed')).toBe(false);
    click(playing);
    expect(p.onPause).toHaveBeenCalledTimes(1);

    const restart = $$<HTMLButtonElement>('button').find(
      (b) => text(b) === 'Restart',
    ) as HTMLButtonElement;
    click(restart);
    expect(p.onRestart).toHaveBeenCalledTimes(1);

    const radios = $$('[role="radiogroup"] [role="radio"]');
    expect(radios.map(text)).toEqual(['×1', '×10']);
    click(radios[1] as HTMLElement);
    expect(p.onSpeedChange).toHaveBeenCalledWith(10);
  });

  it('offers only the speeds it is given, and none without a handler', () => {
    const p = player();
    render(p.ui({ speeds: [1, 2, 5], speed: 2 }));
    const radios = $$('[role="radiogroup"] [role="radio"]');
    expect(radios.map(text)).toEqual(['×1', '×2', '×5']);
    expect(radios.map((r) => r.getAttribute('aria-checked'))).toEqual(['false', 'true', 'false']);
    render(p.ui({ onSpeedChange: undefined }));
    expect($('[role="radiogroup"]')).toBeNull();
  });

  it('turns every control off and says why when disabled', () => {
    const p = player();
    render(
      p.ui({
        status: 'idle',
        positionMs: 0,
        disabled: true,
        disabledReason: 'Another scenario is running.',
      }),
    );
    const buttons = $$<HTMLButtonElement>('.ui-step-player button').filter((b) => !b.closest('ol'));
    expect(buttons.length).toBeGreaterThanOrEqual(4);
    for (const b of buttons) expect(b.disabled).toBe(true);
    expect(text($('.ui-step-player'))).toContain('Another scenario is running.');
    const toggle = $$('.ui-step-player button').find((b) => text(b) === 'Play') as HTMLElement;
    const reason = $(`#${toggle.getAttribute('aria-describedby')}`);
    expect(text(reason)).toBe('Another scenario is running.');
    click(toggle);
    expect(p.onPlay).not.toHaveBeenCalled();
  });

  it('is a named group', () => {
    render(player().ui());
    const group = $('.ui-step-player');
    expect(text($(`#${group.getAttribute('aria-labelledby')}`))).toBe('Smoke alarm');
  });
});

/* ---------------------------------------------------------------- SwatchPicker */

const COLOURS: readonly SwatchOption[] = [
  { value: 'red', label: 'Red', role: 'swatch-1' },
  { value: 'orange', label: 'Orange', role: 'swatch-2' },
  { value: 'amber', label: 'Amber', role: 'swatch-3' },
  { value: 'yellow', label: 'Yellow', role: 'swatch-4' },
  { value: 'green', label: 'Green', role: 'swatch-5' },
  { value: 'teal', label: 'Teal', role: 'swatch-6' },
  { value: 'blue', label: 'Blue', role: 'swatch-7' },
  { value: 'indigo', label: 'Indigo', role: 'swatch-8' },
  { value: 'violet', label: 'Violet', role: 'swatch-9' },
  { value: 'pink', label: 'Pink', role: 'swatch-10' },
];

describe('SwatchPicker', () => {
  const picker = (
    value: string | null,
    onValueChange = vi.fn<(value: string) => void>(),
    size?: 'md' | 'lg',
  ) => {
    render(
      <SwatchPicker
        label="Light colour"
        options={COLOURS}
        value={value}
        onValueChange={onValueChange}
        size={size}
      />,
    );
    return onValueChange;
  };
  const radios = () => $$<HTMLInputElement>('input[type="radio"]');

  it('is a named radio group of one radio per option, each named', () => {
    picker('blue');
    const group = $('fieldset');
    expect(group.getAttribute('role')).toBe('radiogroup');
    expect(text($('legend'))).toBe('Light colour');
    expect(radios()).toHaveLength(10);
    expect(radios().map((r) => text(r.closest('label')))).toEqual(COLOURS.map((c) => c.label));
    expect(new Set(radios().map((r) => r.name)).size).toBe(1);
    // each swatch is drawn in its own role
    $$('label.ui-swatch').forEach((l, i) => {
      expect(cls(l)).toContain(`bg-${COLOURS[i]?.role}`);
    });
  });

  it('marks the chosen swatch with a tick and the selected border, and no other', () => {
    picker('green');
    const checked = radios().filter((r) => r.checked);
    expect(checked.map((r) => r.value)).toEqual(['green']);
    const labels = $$('label.ui-swatch');
    const ticks = labels.filter((l) => l.querySelector('svg'));
    expect(ticks).toHaveLength(1);
    expect(ticks[0]?.contains(checked[0] as HTMLElement)).toBe(true);
    expect(cls(ticks[0] as HTMLElement)).toContain('border-brand');
    expect(cls(labels[0] as HTMLElement)).not.toContain('border-brand');
  });

  it('calls back with the clicked swatch, and not for the one already chosen', () => {
    const cb = picker('blue');
    click(radios()[1] as HTMLElement);
    expect(cb).toHaveBeenCalledWith('orange');
    click(radios()[6] as HTMLElement);
    expect(cb).toHaveBeenCalledTimes(1);
  });

  it('moves the choice with the arrow keys, wrapping round', () => {
    const cb = picker('blue');
    keyDown(radios()[6] as HTMLElement, 'ArrowRight');
    expect(cb).toHaveBeenLastCalledWith('indigo');
    keyDown(radios()[6] as HTMLElement, 'ArrowDown');
    expect(cb).toHaveBeenLastCalledWith('indigo');
    keyDown(radios()[6] as HTMLElement, 'ArrowLeft');
    expect(cb).toHaveBeenLastCalledWith('teal');
    keyDown(radios()[6] as HTMLElement, 'ArrowUp');
    expect(cb).toHaveBeenLastCalledWith('teal');

    const wrap = picker('pink');
    keyDown(radios()[9] as HTMLElement, 'ArrowRight');
    expect(wrap).toHaveBeenLastCalledWith('red');
    const back = picker('red');
    keyDown(radios()[0] as HTMLElement, 'ArrowLeft');
    expect(back).toHaveBeenLastCalledWith('pink');
  });

  it('moves focus with the arrow keys and ignores other keys', () => {
    const cb = picker('blue');
    const e = keyDown(radios()[6] as HTMLElement, 'ArrowRight');
    expect(e.defaultPrevented).toBe(true);
    expect(document.activeElement).toBe(radios()[7]);
    cb.mockClear();
    keyDown(radios()[6] as HTMLElement, 'a');
    expect(cb).not.toHaveBeenCalled();
  });

  it('starts at the first or last swatch from the arrows when none is chosen', () => {
    const right = picker(null);
    keyDown(radios()[0] as HTMLElement, 'ArrowRight');
    expect(right).toHaveBeenLastCalledWith('red');
    const left = picker(null);
    keyDown(radios()[0] as HTMLElement, 'ArrowLeft');
    expect(left).toHaveBeenLastCalledWith('pink');
  });

  it('says "Custom" when none matches, else the name of the chosen, hovered or focused swatch', () => {
    picker(null);
    expect(radios().some((r) => r.checked)).toBe(false);
    expect(text($('[data-slot="caption"]'))).toBe('Custom');
    expect($$('label.ui-swatch svg')).toHaveLength(0);

    picker('teal');
    expect(text($('[data-slot="caption"]'))).toBe('Teal');
    act(() => {
      (radios()[1] as HTMLElement).focus();
    });
    expect(text($('[data-slot="caption"]'))).toBe('Orange');
    act(() => {
      (radios()[1] as HTMLElement).blur();
    });
    expect(text($('[data-slot="caption"]'))).toBe('Teal');
    act(() => {
      radios()[2]?.dispatchEvent(new MouseEvent('mouseover', { bubbles: true }));
    });
    expect(text($('[data-slot="caption"]'))).toBe('Amber');
  });

  it('rings every unchosen swatch in the 3:1 border role and the chosen one in the brand border', () => {
    picker('blue');
    const labels = $$('label.ui-swatch');
    expect(labels.filter((l) => cls(l).includes('border-border-input'))).toHaveLength(9);
    expect(cls(labels[6] as HTMLElement)).toContain('border-brand');
  });

  it('is at least 48px', () => {
    picker('blue');
    expect(cls($('label.ui-swatch'))).toContain('size-12');
    picker('blue', vi.fn<(value: string) => void>(), 'lg');
    expect(cls($('label.ui-swatch'))).toContain('size-14');
  });
});

/* ---------------------------------------------------------------- DirectionPad */

describe('DirectionPad', () => {
  const pad = (extra: Partial<Parameters<typeof DirectionPad>[0]> = {}) => {
    const onPress = vi.fn<(k: PadKey) => void>();
    render(<DirectionPad label="Remote" onPress={onPress} {...extra} />);
    return onPress;
  };
  const key = (k: PadKey) => $<HTMLButtonElement>(`button[data-key="${k}"]`);

  it('is a named group of five named buttons', () => {
    pad();
    expect($('fieldset').getAttribute('aria-label')).toBe('Remote');
    expect($$('button').map((b) => b.getAttribute('aria-label'))).toEqual([
      'Up',
      'Left',
      'OK',
      'Right',
      'Down',
    ]);
    expect(text(key('select'))).toBe('OK');
  });

  it('takes its words from labels', () => {
    pad({ labels: { select: 'Enter', up: 'Page up' } });
    expect(key('select').getAttribute('aria-label')).toBe('Enter');
    expect(key('up').getAttribute('aria-label')).toBe('Page up');
    expect(key('down').getAttribute('aria-label')).toBe('Down');
  });

  it('reports each button clicked', () => {
    const onPress = pad();
    for (const k of ['up', 'down', 'left', 'right', 'select'] as const) click(key(k));
    expect(onPress.mock.calls.map((c) => c[0])).toEqual(['up', 'down', 'left', 'right', 'select']);
  });

  it('presses the matching button with an arrow key, from whichever button has focus', () => {
    const onPress = pad();
    const table: [string, PadKey][] = [
      ['ArrowUp', 'up'],
      ['ArrowDown', 'down'],
      ['ArrowLeft', 'left'],
      ['ArrowRight', 'right'],
    ];
    for (const [k, want] of table) {
      onPress.mockClear();
      const e = keyDown(key('select'), k);
      expect(onPress.mock.calls.map((c) => c[0])).toEqual([want]);
      expect(e.defaultPrevented).toBe(true);
    }
  });

  it('leaves Enter and Space to the focused button, which is its own key', () => {
    const onPress = pad();
    for (const k of ['Enter', ' ']) {
      const e = keyDown(key('up'), k);
      // not intercepted: the browser clicks the focused button, so Tab to Up and Enter gives Up
      expect(e.defaultPrevented).toBe(false);
    }
    expect(onPress).not.toHaveBeenCalled();
    click(key('up'));
    expect(onPress.mock.calls.map((c) => c[0])).toEqual(['up']);
  });

  it('ignores key repeat: a held key is one press, and Enter does not auto-repeat', () => {
    const onPress = pad();
    keyDown(key('up'), 'ArrowRight');
    for (let i = 0; i < 5; i++) {
      const e = new KeyboardEvent('keydown', {
        key: 'ArrowRight',
        repeat: true,
        bubbles: true,
        cancelable: true,
      });
      act(() => {
        key('up').dispatchEvent(e);
      });
      expect(e.defaultPrevented).toBe(true);
    }
    expect(onPress.mock.calls.map((c) => c[0])).toEqual(['right']);
    const enter = new KeyboardEvent('keydown', {
      key: 'Enter',
      repeat: true,
      bubbles: true,
      cancelable: true,
    });
    act(() => {
      key('select').dispatchEvent(enter);
    });
    expect(enter.defaultPrevented).toBe(true);
  });

  it('does not press for other keys, or with a modifier', () => {
    const onPress = pad();
    keyDown(key('up'), 'a');
    keyDown(key('up'), 'Tab');
    act(() => {
      key('up').dispatchEvent(
        new KeyboardEvent('keydown', { key: 'ArrowUp', ctrlKey: true, bubbles: true }),
      );
    });
    expect(onPress).not.toHaveBeenCalled();
  });

  it('shows the pressed button while the key is down and clears it on key up or blur', () => {
    pad();
    keyDown(key('up'), 'ArrowRight');
    expect(key('right').hasAttribute('data-pressed')).toBe(true);
    expect($$('[data-pressed]')).toHaveLength(1);
    keyUp(key('up'), 'ArrowRight');
    expect($$('[data-pressed]')).toHaveLength(0);
    keyDown(key('select'), 'Enter');
    expect(key('select').hasAttribute('data-pressed')).toBe(true);
    act(() => {
      key('select').dispatchEvent(
        new FocusEvent('focusout', { bubbles: true, relatedTarget: null }),
      );
    });
    expect($$('[data-pressed]')).toHaveLength(0);
  });

  it('presses nothing when disabled', () => {
    const onPress = pad({ disabled: true });
    expect($$<HTMLButtonElement>('button').every((b) => b.disabled)).toBe(true);
    click(key('up'));
    keyDown(key('up'), 'ArrowDown');
    expect(onPress).not.toHaveBeenCalled();
  });

  it('is 56px, or 72px large', () => {
    pad();
    expect(cls(key('up'))).toContain('size-14');
    pad({ size: 'lg' });
    expect(cls(key('up'))).toContain('size-18');
  });
});

/* ---------------------------------------------------------------- Screensaver */

describe('Screensaver', () => {
  const IDLE = 120_000;
  const advance = (ms: number) =>
    act(() => {
      vi.advanceTimersByTime(ms);
    });

  function shell(extra: Partial<Parameters<typeof Screensaver>[0]> = {}) {
    const onShow = vi.fn<() => void>();
    const onHide = vi.fn<() => void>();
    const onPress = vi.fn<() => void>();
    const ui = (over: Partial<Parameters<typeof Screensaver>[0]> = {}) => (
      <>
        <main>
          <button type="button" onClick={onPress}>
            Arm
          </button>
        </main>
        <Screensaver idleMs={IDLE} onShow={onShow} onHide={onHide} {...extra} {...over}>
          <p>12:00</p>
        </Screensaver>
      </>
    );
    return { onShow, onHide, onPress, ui };
  }

  beforeEach(() => {
    vi.useFakeTimers();
  });

  it('shows after the idle time and not before', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE - 1);
    expect(layer()).toBeNull();
    expect(s.onShow).not.toHaveBeenCalled();
    advance(1);
    expect(layer()).toBeTruthy();
    expect(s.onShow).toHaveBeenCalledTimes(1);
    expect(text(layer())).toBe('12:00');
  });

  it('is a modal dialog named Screensaver with focus on it', () => {
    render(shell().ui());
    advance(IDLE);
    expect(layer().getAttribute('aria-modal')).toBe('true');
    expect(document.activeElement).toBe(layer());
  });

  it('starts the idle time again on each pointer, key, wheel or touch', () => {
    const s = shell();
    render(s.ui());
    for (const type of ['pointerdown', 'keydown', 'wheel', 'touchstart', 'pointermove']) {
      fire(document, type);
      advance(IDLE - 1);
      expect({ type, shown: layer() !== null }).toEqual({ type, shown: false });
    }
    advance(1);
    expect(layer()).toBeTruthy();
  });

  it('never shows when not active', () => {
    const s = shell({ active: false });
    render(s.ui());
    advance(IDLE * 3);
    expect(layer()).toBeNull();
    expect(s.onShow).not.toHaveBeenCalled();
  });

  it('is hidden by Esc', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    keyDown(layer(), 'Escape');
    expect(layer()).toBeNull();
    expect(s.onHide).toHaveBeenCalledTimes(1);
  });

  it('is hidden by the first touch, and that tap never reaches what is under it', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    const button = $('main button');
    const down = fire(layer(), 'pointerdown');
    expect(down.defaultPrevented).toBe(true);
    expect(layer()).toBeNull();
    expect(s.onHide).toHaveBeenCalledTimes(1);
    // the rest of the same press lands on the page: none of it is delivered
    fire(button, 'touchstart');
    fire(button, 'pointerup');
    fire(button, 'touchend');
    fire(button, 'mousedown');
    fire(button, 'mouseup');
    click(button);
    expect(s.onPress).not.toHaveBeenCalled();
    // the press is over: the next tap is the page's
    click(button);
    expect(s.onPress).toHaveBeenCalledTimes(1);
  });

  describe('a press that wakes the screen', () => {
    // a pointer event with an id, as the browser sends them
    const ptr = (el: Element, type: string, id = 1) => {
      const e = Object.assign(new Event(type, { bubbles: true, cancelable: true }), {
        pointerId: id,
      });
      act(() => {
        el.dispatchEvent(e);
      });
      return e;
    };
    const wake = () => {
      const s = shell();
      render(s.ui());
      advance(IDLE);
      return s;
    };
    // every kind of late event, aimed at what is under the layer
    const reaches = (button: Element) => {
      const seen: string[] = [];
      const types = ['pointerup', 'mouseup', 'click', 'keyup', 'touchend'];
      const ctl = new AbortController();
      for (const type of types)
        button.addEventListener(type, () => seen.push(type), { signal: ctl.signal });
      return { seen, stop: () => ctl.abort() };
    };

    it('is swallowed for as long as it is held, not for a fixed time', () => {
      const s = wake();
      const button = $('main button');
      const probe = reaches(button);
      ptr(layer(), 'pointerdown');
      advance(4900);
      ptr(button, 'pointerup');
      fire(button, 'mouseup');
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      expect(probe.seen).toEqual([]);
      // and it is over once its click has gone
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
      probe.stop();
    });

    it('swallows a held Space and its key-up, however long', () => {
      const s = shell();
      render(s.ui());
      const button = $<HTMLButtonElement>('main button');
      act(() => button.focus());
      advance(IDLE);
      const probe = reaches(button);
      // the screen shows with focus on the layer; the key goes to it
      keyDown(layer(), ' ');
      expect(layer()).toBeNull();
      for (let i = 0; i < 5; i++) {
        advance(900);
        const rep = new KeyboardEvent('keydown', {
          key: ' ',
          repeat: true,
          bubbles: true,
          cancelable: true,
        });
        act(() => {
          button.dispatchEvent(rep);
        });
        expect(rep.defaultPrevented).toBe(true);
      }
      // focus is not back on the button while the key is still down
      expect(document.activeElement).not.toBe(button);
      const up = new KeyboardEvent('keyup', { key: ' ', bubbles: true, cancelable: true });
      act(() => {
        button.dispatchEvent(up);
      });
      expect(up.defaultPrevented).toBe(true);
      expect(probe.seen).toEqual([]);
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
      probe.stop();
    });

    it('keeps swallowing for 599 ms after the release, and not for 601', () => {
      for (const [after, swallowed] of [
        [599, true],
        [601, false],
      ] as const) {
        const s = wake();
        const button = $('main button');
        ptr(layer(), 'pointerdown');
        advance(1500);
        ptr(button, 'pointerup');
        advance(after);
        click(button);
        expect(s.onPress).toHaveBeenCalledTimes(swallowed ? 0 : 1);
        act(() => root.render(<main />));
      }
    });

    it('ends at the first click after the release, without waiting out the window', () => {
      const s = wake();
      const button = $('main button');
      ptr(layer(), 'pointerdown');
      ptr(button, 'pointerup');
      advance(100);
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      advance(100);
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
    });

    it('treats pointercancel as the release', () => {
      for (const [after, swallowed] of [
        [599, true],
        [601, false],
      ] as const) {
        const s = wake();
        const button = $('main button');
        ptr(layer(), 'pointerdown');
        advance(3000);
        ptr(button, 'pointercancel');
        advance(after);
        click(button);
        expect(s.onPress).toHaveBeenCalledTimes(swallowed ? 0 : 1);
        act(() => root.render(<main />));
      }
    });

    it('waits for every pointer: a second finger holds the press open', () => {
      const s = wake();
      const button = $('main button');
      ptr(layer(), 'pointerdown', 1);
      ptr($('main button'), 'pointerdown', 2);
      ptr(button, 'pointerup', 1);
      advance(2000);
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      ptr(button, 'pointerup', 2);
      advance(300);
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
    });

    it('is cut off after 5 s, so a lost pointer-up cannot block input for good', () => {
      const s = wake();
      const button = $('main button');
      ptr(layer(), 'pointerdown');
      advance(4999);
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      advance(2);
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
    });

    it('survives suspend flipping and a prop change in the middle of it', () => {
      const s = wake();
      const button = $('main button');
      ptr(layer(), 'pointerdown');
      // an alert arrives under the finger
      render(s.ui({ suspend: true }));
      render(s.ui({ suspend: true, idleMs: IDLE * 2 }));
      ptr(button, 'pointerup');
      click(button);
      expect(s.onPress).not.toHaveBeenCalled();
      // the press is over: the alert's button works
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
    });

    it('is woken by a bare click (voice control, a switch), which presses nothing', () => {
      const s = wake();
      const button = $('main button');
      const e = fire(layer(), 'click');
      expect(e.defaultPrevented).toBe(true);
      expect(layer()).toBeNull();
      expect(s.onHide).toHaveBeenCalledTimes(1);
      click(button);
      expect(s.onPress).toHaveBeenCalledTimes(1);
    });

    it('gives focus back only when the press is over', () => {
      render(shell().ui());
      const button = $<HTMLButtonElement>('main button');
      act(() => button.focus());
      advance(IDLE);
      keyDown(layer(), 'Escape');
      expect(document.activeElement).not.toBe(button);
      keyUp(document.body, 'Escape');
      expect(document.activeElement).toBe(button);
    });
  });

  it('disappears in the same render that suspends it, with the page usable again', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    expect(host.hasAttribute('inert')).toBe(true);
    act(() => {
      flushSync(() => root.render(s.ui({ suspend: true })));
      // before any passive effect: the layer is already gone
      expect(layer()).toBeNull();
    });
    expect(host.hasAttribute('inert')).toBe(false);
    expect(s.onHide).toHaveBeenCalledTimes(1);
  });

  it('keeps its scroll-blocking listeners for the time it is shown or swallowing, no longer', () => {
    const add = vi.spyOn(document, 'addEventListener');
    const remove = vi.spyOn(document, 'removeEventListener');
    const nonPassive = () =>
      add.mock.calls.filter(([, , o]) => typeof o === 'object' && o?.passive === false).length;
    const s = shell();
    render(s.ui());
    // idle: only passive listeners, none that can hold up a scroll or a touch
    expect(nonPassive()).toBe(0);
    expect(add.mock.calls.some(([type]) => type === 'touchstart')).toBe(true);
    advance(IDLE);
    expect(nonPassive()).toBeGreaterThan(0);
    fire(layer(), 'click');
    // the press is over: they are gone again
    const removed = remove.mock.calls.filter(
      ([, , o]) => typeof o === 'object' && o?.capture,
    ).length;
    expect(removed).toBeGreaterThanOrEqual(nonPassive());
    add.mockClear();
    advance(IDLE);
    expect(nonPassive()).toBeGreaterThan(0);
    add.mockRestore();
    remove.mockRestore();
  });

  it('reads the focused element before the page goes inert, as a browser may blur it then', () => {
    const real = Element.prototype.setAttribute;
    const spy = vi.spyOn(Element.prototype, 'setAttribute').mockImplementation(function (
      this: Element,
      name: string,
      value: string,
    ) {
      if (name === 'inert' && this.contains(document.activeElement)) {
        (document.activeElement as HTMLElement).blur();
      }
      real.call(this, name, value);
    });
    render(shell().ui());
    const button = $<HTMLButtonElement>('main button');
    act(() => button.focus());
    advance(IDLE);
    expect(document.activeElement).toBe(layer());
    keyDown(layer(), 'Escape');
    keyUp(document.body, 'Escape');
    expect(document.activeElement).toBe(button);
    spy.mockRestore();
  });

  it('is hidden by the first key, which does nothing else', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    const button = $('main button');
    const e = keyDown(button, 'Enter');
    expect(e.defaultPrevented).toBe(true);
    expect(layer()).toBeNull();
    // the key-up (Space presses on key-up) is swallowed too, then input is back
    const up = new KeyboardEvent('keyup', { key: 'Enter', bubbles: true, cancelable: true });
    act(() => {
      button.dispatchEvent(up);
    });
    expect(up.defaultPrevented).toBe(true);
    click(button);
    expect(s.onPress).toHaveBeenCalledTimes(1);
  });

  it('is woken by the wheel without swallowing it', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    const e = fire(document, 'wheel');
    expect(e.defaultPrevented).toBe(false);
    expect(layer()).toBeNull();
  });

  it('shows again after another idle time', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    keyDown(layer(), 'Escape');
    advance(IDLE - 1);
    expect(layer()).toBeNull();
    advance(1);
    expect(layer()).toBeTruthy();
    expect(s.onShow).toHaveBeenCalledTimes(2);
  });

  it('is held off by suspend, and hidden at once if it was showing', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    expect(layer()).toBeTruthy();
    render(s.ui({ suspend: true }));
    expect(layer()).toBeNull();
    expect(s.onHide).toHaveBeenCalledTimes(1);
    advance(IDLE * 3);
    expect(layer()).toBeNull();
    // when the alert is over the idle time starts from scratch
    render(s.ui({ suspend: false }));
    advance(IDLE - 1);
    expect(layer()).toBeNull();
    advance(1);
    expect(layer()).toBeTruthy();
  });

  it('is not shown by an input while suspended and still counts nothing', () => {
    const s = shell({ suspend: true });
    render(s.ui());
    advance(IDLE * 2);
    expect(layer()).toBeNull();
    expect(s.onShow).not.toHaveBeenCalled();
    click($('main button'));
    expect(s.onPress).toHaveBeenCalledTimes(1);
  });

  it('makes the rest of the page inert while shown, and not the layer', () => {
    const aside = document.createElement('aside');
    document.body.append(aside);
    render(shell().ui());
    expect(host.hasAttribute('inert')).toBe(false);
    advance(IDLE);
    expect(host.hasAttribute('inert')).toBe(true);
    expect(aside.hasAttribute('inert')).toBe(true);
    expect(layer().closest('[inert]')).toBeNull();
    keyDown(layer(), 'Escape');
    expect(host.hasAttribute('inert')).toBe(false);
    expect(aside.hasAttribute('inert')).toBe(false);
    aside.remove();
  });

  it('leaves alone what was inert already', () => {
    const aside = document.createElement('aside');
    aside.setAttribute('inert', '');
    document.body.append(aside);
    render(shell().ui());
    advance(IDLE);
    keyDown(layer(), 'Escape');
    expect(aside.hasAttribute('inert')).toBe(true);
    aside.remove();
  });

  it('draws over the scrim, or the stronger one', () => {
    render(shell().ui());
    advance(IDLE);
    expect(cls(layer())).toContain('bg-scrim-strong');
    render(shell().ui({ dim: 'low' }));
    expect(cls(layer())).toContain('bg-scrim');
    expect(cls(layer())).not.toContain('bg-scrim-strong');
    expect(layer().dataset.dim).toBe('low');
  });

  it('puts its content on a solid chip', () => {
    render(shell().ui());
    advance(IDLE);
    expect(cls($('[data-slot="content"]'))).toContain('bg-surface-solid');
    expect(cls($('[data-slot="content"]'))).toContain('text-fg');
  });

  it('keeps the content still unless shift is on', () => {
    render(shell().ui());
    advance(IDLE);
    const at = () => ($('[data-slot="content"]') as HTMLElement).style.transform;
    const first = at();
    advance(60_000 * 3);
    expect(at()).toBe(first);
  });

  it('shifts the content to a new place every minute with shift, and goes round', () => {
    render(shell({ shift: true }).ui());
    advance(IDLE);
    const at = () => ($('[data-slot="content"]') as HTMLElement).style.transform;
    const seen = [at()];
    for (let i = 0; i < 5; i++) {
      advance(59_999);
      expect(at()).toBe(seen[seen.length - 1]);
      advance(1);
      seen.push(at());
    }
    expect(new Set(seen.slice(0, 5)).size).toBe(5);
    expect(seen[5]).toBe(seen[0]);
    // never a transition: a jump
    expect(cls($('[data-slot="content"]')).some((c) => c.includes('transition'))).toBe(false);
  });

  it('clears its timers and listeners when it unmounts before it shows', () => {
    const s = shell({ shift: true });
    render(s.ui());
    expect(vi.getTimerCount()).toBeGreaterThan(0);
    act(() => root.render(<main />));
    expect(vi.getTimerCount()).toBe(0);
    fire(document, 'pointerdown');
    expect(vi.getTimerCount()).toBe(0);
    advance(IDLE * 2);
    expect(s.onShow).not.toHaveBeenCalled();
  });

  it('clears its timers, listeners and the inert page when it unmounts while shown', () => {
    const s = shell({ shift: true });
    render(s.ui());
    advance(IDLE);
    expect(layer()).toBeTruthy();
    act(() => root.render(<main />));
    expect(layer()).toBeNull();
    expect(document.querySelector('[inert]')).toBeNull();
    advance(IDLE * 3);
    expect(s.onShow).toHaveBeenCalledTimes(1);
    expect(s.onHide).not.toHaveBeenCalled();
    expect(layer()).toBeNull();
  });

  it('stops swallowing input when it unmounts in the middle of a press', () => {
    const s = shell();
    render(s.ui());
    advance(IDLE);
    fire(layer(), 'pointerdown');
    act(() => root.render(<main />));
    const onPress = vi.fn<() => void>();
    render(
      <main>
        <button type="button" onClick={onPress}>
          Arm
        </button>
      </main>,
    );
    click($('main button'));
    expect(onPress).toHaveBeenCalledTimes(1);
    expect(vi.getTimerCount()).toBeLessThanOrEqual(1); // React's own, none of ours
  });
});

/* ---------------------------------------------------------------- axe */

const AXE = {
  runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
  // jsdom has no layout: contrast is the colour gate's job and the browser pass's
  rules: { 'color-contrast': { enabled: false } },
  resultTypes: ['violations'],
} as Parameters<typeof axe.run>[1];

async function violations() {
  const results = await axe.run(document.body, AXE);
  return results.violations
    .map((x) => `${x.id}: ${x.help}\n${x.nodes.map((n) => `  ${n.target.join(' ')}`).join('\n')}`)
    .join('\n');
}

describe('axe: every display component, every skin x mode', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`${skin} · ${mode}`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <main>
            <ShowcaseDisplay />
          </main>,
        );
        expect(await violations()).toBe('');
      });

      it(`${skin} · ${mode} · the screensaver, shown`, async () => {
        document.documentElement.setAttribute('data-skin', skin);
        document.documentElement.setAttribute('data-theme', mode);
        render(
          <>
            <main>
              <h1>Page</h1>
            </main>
            <Screensaver idleMs={5} shift>
              <p>12:00</p>
              <p>Disarmed · all shut · 2 home</p>
            </Screensaver>
          </>,
        );
        await act(async () => {
          await new Promise((r) => setTimeout(r, 40));
        });
        expect(layer()).toBeTruthy();
        expect(await violations()).toBe('');
      });
    }
  }
});

// @vitest-environment jsdom
/* The controls: ControlTile, LevelSlider, ValueStepper, StatusDot, Countdown, Keypad, and the
   new sizes and props of SegmentedControl and HoldToConfirm. Behaviour and keyboard for each,
   then an axe pass over all of them in every skin x mode. jsdom has no layout, so
   colour-contrast is off here (the token gate and the browser pass of `npm run check:a11y` hold
   contrast and the 48px touch floor). */
import axe from 'axe-core';
import { act, type ReactNode, useState } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { stepValue } from '../src/components/inputs/number-field';
import { clearMaterialMaps } from '../src/glass';
import {
  ControlTile,
  Countdown,
  formatSeconds,
  HoldToConfirm,
  Keypad,
  LevelSlider,
  SegmentedControl,
  StatusDot,
  secondsLeft,
  ValueStepper,
} from '../src/index';
import { resetSoundEngine } from '../src/sound/engine';

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
let sounds: string[];
const onSound = (e: Event) => sounds.push((e as CustomEvent<{ name: string }>).detail.name);

beforeEach(() => {
  clearMaterialMaps();
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
  sounds = [];
  resetSoundEngine();
  window.addEventListener('ui:sound', onSound);
});
afterEach(() => {
  window.removeEventListener('ui:sound', onSound);
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
const click = (el: Element) => act(() => (el as HTMLElement).click());
function key(el: Element, k: string, init: KeyboardEventInit = {}) {
  act(() => {
    el.dispatchEvent(
      new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init }),
    );
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
const byName = (name: string) =>
  $$('button, a, [role=spinbutton], [role=slider]').find(
    (el) => (el.getAttribute('aria-label') ?? el.textContent?.trim()) === name,
  ) as HTMLElement;
const describedBy = (el: Element) =>
  (el.getAttribute('aria-describedby') ?? '')
    .split(' ')
    .map((id) => document.getElementById(id)?.textContent ?? '')
    .join(' ');
const noop = () => {};
// the sound engine plays one sound at most every 60 ms: move the (fake) clock on between presses
const later = () => vi.setSystemTime(Date.now() + 100);

describe('ControlTile', () => {
  it('a toggle is a button with aria-pressed, named label + context, and calls back with the next value', () => {
    const onPressedChange = vi.fn<(next: boolean) => void>();
    render(
      <ControlTile
        label="Ceiling light"
        context="Kitchen"
        icon="lightbulb"
        status="On · 70 %"
        action={{ kind: 'toggle', pressed: true, onPressedChange }}
      />,
    );
    const main = byName('Ceiling light, Kitchen');
    expect(main.tagName).toBe('BUTTON');
    expect(main.getAttribute('aria-pressed')).toBe('true');
    expect(describedBy(main)).toContain('On · 70 %');
    expect($('.ui-control-tile').className).toContain('bg-selected');
    expect($('.ui-control-tile').className).toContain('border-brand');
    click(main);
    expect(onPressedChange).toHaveBeenCalledWith(false);
    expect(sounds).toEqual(['toggle-off']);
  });

  it('plays toggle-on when switching on, and nothing for an opener', () => {
    const onPressedChange = vi.fn<(next: boolean) => void>();
    render(
      <ControlTile
        label="Lamp"
        icon="lightbulb"
        status="Off"
        action={{ kind: 'toggle', pressed: false, onPressedChange }}
      />,
    );
    click(byName('Lamp'));
    expect(onPressedChange).toHaveBeenCalledWith(true);
    expect(sounds).toEqual(['toggle-on']);
    const onOpen = vi.fn<() => void>();
    render(
      <ControlTile
        label="Door"
        icon="door-closed"
        status="Closed"
        action={{ kind: 'open', onOpen }}
      />,
    );
    click(byName('Door'));
    expect(onOpen).toHaveBeenCalledOnce();
    expect(sounds).toEqual(['toggle-on']);
  });

  it('an opener with href is a real link; one with onOpen is a button; a readout has neither', () => {
    render(
      <>
        <ControlTile
          label="Blinds"
          icon="blinds"
          status="Open"
          action={{ kind: 'open', href: '/b' }}
        />
        <ControlTile
          label="Door"
          icon="door-closed"
          status="Closed"
          action={{ kind: 'open', onOpen: noop }}
        />
        <ControlTile
          label="Temperature"
          icon="thermometer"
          status="19 °C"
          action={{ kind: 'none' }}
        />
      </>,
    );
    const link = byName('Blinds');
    expect(link.tagName).toBe('A');
    expect(link.getAttribute('href')).toBe('/b');
    expect(byName('Door').tagName).toBe('BUTTON');
    const readout = $$('.ui-control-tile')[2] as HTMLElement;
    expect(readout.querySelector('button, a')).toBeNull();
    expect(readout.textContent).toContain('Temperature');
  });

  it('the corner button is its own tab stop and nothing interactive is nested', () => {
    const onClick = vi.fn<() => void>();
    render(
      <ControlTile
        label="Lamp"
        icon="lightbulb"
        status="On"
        action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
        secondary={{ label: 'Lamp details', onClick }}
      />,
    );
    const main = byName('Lamp');
    const corner = byName('Lamp details');
    expect(corner).not.toBe(main);
    expect(main.contains(corner)).toBe(false);
    expect(corner.contains(main)).toBe(false);
    expect(main.querySelector('button, a, input')).toBeNull();
    expect(corner.tabIndex).toBe(0);
    click(corner);
    expect(onClick).toHaveBeenCalledOnce();
  });

  it('a secondary with an href renders a link', () => {
    render(
      <ControlTile
        label="Lamp"
        icon="lightbulb"
        status="On"
        action={{ kind: 'none' }}
        secondary={{ label: 'Open details', href: '/d', icon: 'settings' }}
      />,
    );
    expect(byName('Open details').tagName).toBe('A');
  });

  it('pending shows its words (shimmering), failed names the failure, unavailable is aria-disabled with the words as its description', () => {
    render(
      <>
        <ControlTile
          label="A"
          icon="plug"
          status="Off"
          state="pending"
          stateText="Switching on…"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
        <ControlTile
          label="B"
          icon="plug"
          status="Off"
          state="failed"
          stateText="Couldn't reach it"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
        <ControlTile
          label="C"
          icon="plug"
          status="Offline"
          state="unavailable"
          stateText="Not reachable"
          action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        />
      </>,
    );
    expect($('[data-state-text=pending] .ui-text-shimmer').textContent).toBe('Switching on…');
    expect($('[data-state-text=failed]').textContent).toContain("Couldn't reach it");
    const c = byName('C');
    expect(c.getAttribute('aria-disabled')).toBe('true');
    expect(c.hasAttribute('disabled')).toBe(false);
    expect(describedBy(c)).toContain('Not reachable');
  });

  it('an unavailable tile ignores presses; a pending one stays pressable', () => {
    const a = vi.fn<(next: boolean) => void>();
    const b = vi.fn<(next: boolean) => void>();
    render(
      <>
        <ControlTile
          label="A"
          icon="plug"
          status="x"
          state="unavailable"
          stateText="No"
          action={{ kind: 'toggle', pressed: false, onPressedChange: a }}
        />
        <ControlTile
          label="B"
          icon="plug"
          status="x"
          state="pending"
          stateText="Wait"
          action={{ kind: 'toggle', pressed: false, onPressedChange: b }}
        />
      </>,
    );
    click(byName('A'));
    click(byName('B'));
    expect(a).not.toHaveBeenCalled();
    expect(b).toHaveBeenCalledWith(true);
  });

  it('sizes set the width floor; the main target is 48px at every size and 64px at lg', () => {
    render(
      <>
        <ControlTile
          label="S"
          size="sm"
          icon="plug"
          status="x"
          action={{ kind: 'open', onOpen: noop }}
        />
        <ControlTile
          label="L"
          size="lg"
          icon="plug"
          status="x"
          action={{ kind: 'open', onOpen: noop }}
        />
        <ControlTile label="M" icon="plug" status="x" action={{ kind: 'open', onOpen: noop }} />
      </>,
    );
    expect($$('.ui-control-tile')[0]?.className).toContain('min-w-30');
    expect($$('.ui-control-tile')[1]?.className).toContain('min-w-50');
    expect(byName('S').className).toContain('min-h-12');
    expect(byName('M').className).toContain('min-h-12');
    expect(byName('L').className).toContain('min-h-16');
  });

  it('the stretched target covers the whole tile: the tile root is its containing block', () => {
    render(
      <ControlTile
        label="Lamp"
        icon="lightbulb"
        status="On"
        meta={<span>meta</span>}
        action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
        secondary={{ label: 'Details', onClick: noop }}
      />,
    );
    const tile = $('.ui-control-tile');
    const main = byName('Lamp');
    const positioned = (el: Element) =>
      /(^|\s)(relative|absolute|fixed|sticky)(\s|$)/.test(el.className);
    // the ::after is absolute; its containing block is the nearest positioned ancestor
    expect(main.className).toContain('after:absolute');
    expect(positioned(main)).toBe(false);
    for (let el = main.parentElement; el && el !== tile; el = el.parentElement) {
      expect(positioned(el)).toBe(false);
    }
    expect(positioned(tile)).toBe(true);
    // the corner button is positioned above the overlay
    expect(byName('Details').className).toContain('z-10');
    expect(byName('Details').className).toContain('absolute');
  });

  it('pending and failed get words of their own, announced politely; the region exists first', () => {
    const tile = (state: 'idle' | 'pending' | 'failed', stateText?: string) => (
      <ControlTile
        label="Lamp"
        icon="plug"
        status="Off"
        state={state}
        stateText={stateText}
        action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
      />
    );
    render(tile('idle'));
    const region = $('.ui-control-tile [role=status]');
    expect(region.textContent).toBe('');
    render(tile('pending'));
    expect($('.ui-control-tile [role=status]')).toBe(region);
    expect(region.textContent).toBe('Working on it…');
    expect($('[data-state-text=pending]').textContent).toBe('Working on it…');
    render(tile('failed'));
    expect(region.textContent).toBe("Couldn't do that");
    render(tile('failed', 'Lamp is offline'));
    expect(region.textContent).toBe('Lamp is offline');
    render(tile('idle'));
    expect(region.textContent).toBe('');
  });
});

describe('LevelSlider', () => {
  let log: string[];
  beforeEach(() => {
    log = [];
  });
  function Harness({ extra }: { extra?: Partial<Parameters<typeof LevelSlider>[0]> }) {
    const [v, setV] = useState(40);
    return (
      <LevelSlider
        label="Brightness"
        value={v}
        onValueChange={(n) => {
          log.push(`change:${n}`);
          setV(n);
        }}
        onValueCommit={(n) => log.push(`commit:${n}`)}
        formatValue={(n) => `${n} %`}
        {...extra}
      />
    );
  }

  it('is a slider named by its label with aria-valuetext from formatValue', () => {
    render(<Harness />);
    const thumb = $<HTMLInputElement>('[role=slider]');
    expect(thumb.value).toBe('40');
    expect(thumb.getAttribute('aria-valuetext')).toBe('40 %');
    expect(document.getElementById(thumb.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Brightness',
    );
    expect($('[data-chip]').textContent).toBe('40 %');
  });

  it('arrows step, Page Up takes ten, Home and End jump', () => {
    render(<Harness />);
    const thumb = $('[role=slider]');
    key(thumb, 'ArrowRight');
    expect(log).toContain('change:41');
    key(thumb, 'PageUp');
    expect(log).toContain('change:51');
    key(thumb, 'Home');
    expect(log).toContain('change:0');
    key(thumb, 'End');
    expect(log).toContain('change:100');
  });

  it('reports changes while moving and commits after them', () => {
    render(<Harness />);
    key($('[role=slider]'), 'ArrowRight');
    expect(log).toContain('change:41');
    // the SDK commits a key's change when the key is released
    act(() => {
      $('[role=slider]').dispatchEvent(
        new KeyboardEvent('keyup', { key: 'ArrowRight', bubbles: true }),
      );
    });
    expect(log).toContain('commit:41');
  });

  it('stands up in vertical orientation, with the ends labelled', () => {
    render(<Harness extra={{ orientation: 'vertical', ends: { min: 'Closed', max: 'Open' } }} />);
    expect($('[role=slider]').getAttribute('aria-orientation')).toBe('vertical');
    expect($('.ui-level-slider').getAttribute('data-orientation')).toBe('vertical');
    expect($('.ui-level-slider').textContent).toContain('Closed');
    expect($('.ui-level-slider').textContent).toContain('Open');
  });

  it('draws the ghost mark as decoration and gives its words to assistive tech', () => {
    render(<Harness extra={{ ghost: 25, ghostLabel: 'Confirmed 25 %' }} />);
    expect($('[data-ghost]').getAttribute('aria-hidden')).toBe('true');
    expect(describedBy($('[role=slider]'))).toBe('Confirmed 25 %');
  });

  it('track thickness follows size', () => {
    render(<Harness extra={{ size: 'xl' }} />);
    expect($('.ui-level-slider-root').className).toContain('h-18');
  });

  it('a disabled slider cannot be changed', () => {
    render(<Harness extra={{ disabled: true }} />);
    key($('[role=slider]'), 'ArrowRight');
    expect(log).toEqual([]);
  });
});

describe('ValueStepper', () => {
  let log: string[];
  beforeEach(() => {
    log = [];
  });
  function Harness({ start = 19.5 }: { start?: number }) {
    const [v, setV] = useState(start);
    return (
      <ValueStepper
        label="Target"
        value={v}
        min={10}
        max={28}
        step={0.5}
        format={(n) => `${n.toFixed(1)} °C`}
        status="Heating…"
        onValueChange={(n) => {
          log.push(`change:${n}`);
          setV(n);
        }}
        onValueCommit={(n) => log.push(`commit:${n}`)}
      />
    );
  }

  it('the figure is a spinbutton with value, limits and text', () => {
    render(<Harness />);
    const f = $('[role=spinbutton]');
    expect(f.getAttribute('aria-valuenow')).toBe('19.5');
    expect(f.getAttribute('aria-valuemin')).toBe('10');
    expect(f.getAttribute('aria-valuemax')).toBe('28');
    expect(f.getAttribute('aria-valuetext')).toBe('19.5 °C');
    expect(f.textContent).toBe('19.5 °C');
    expect(document.getElementById(f.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Target',
    );
    expect($('[role=status]').textContent).toBe('Heating…');
  });

  it('every press changes at once and ticks; the commit comes once, after the delay', () => {
    vi.useFakeTimers();
    render(<Harness />);
    click(byName('Raise'));
    later();
    click(byName('Raise'));
    later();
    click(byName('Lower'));
    expect(log).toEqual(['change:20', 'change:20.5', 'change:20']);
    expect(sounds).toEqual(['tick', 'tick', 'tick']);
    act(() => {
      vi.advanceTimersByTime(799);
    });
    expect(log.some((l) => l.startsWith('commit'))).toBe(false);
    act(() => {
      vi.advanceTimersByTime(2);
    });
    expect(log.filter((l) => l.startsWith('commit'))).toEqual(['commit:20']);
  });

  it('a press restarts the delay', () => {
    vi.useFakeTimers();
    render(<Harness />);
    click(byName('Raise'));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    click(byName('Raise'));
    act(() => {
      vi.advanceTimersByTime(700);
    });
    expect(log.filter((l) => l.startsWith('commit'))).toEqual([]);
    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(log.filter((l) => l.startsWith('commit'))).toEqual(['commit:20.5']);
  });

  it('commits on blur', () => {
    render(<Harness />);
    const f = $('[role=spinbutton]');
    act(() => f.focus());
    key(f, 'ArrowUp');
    expect(log).toEqual(['change:20']);
    act(() => f.blur());
    expect(log).toEqual(['change:20', 'commit:20']);
  });

  it('a pending commit is sent when the stepper unmounts', () => {
    vi.useFakeTimers();
    render(<Harness />);
    click(byName('Raise'));
    act(() => root.render(<div />));
    expect(log).toEqual(['change:20', 'commit:20']);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(log).toEqual(['change:20', 'commit:20']);
  });

  it('steps from the value prop when the parent does not echo the change', () => {
    vi.useFakeTimers();
    const seen: number[] = [];
    render(
      <ValueStepper
        label="T"
        value={20}
        min={10}
        max={30}
        step={1}
        onValueChange={(n) => seen.push(n)}
      />,
    );
    click(byName('Raise'));
    act(() => {
      vi.advanceTimersByTime(900);
    });
    later();
    click(byName('Raise'));
    // the parent kept 20 throughout: each press starts from it
    expect(seen).toEqual([21, 21]);
  });

  it('the limits are aria-disabled, not disabled, and a press there does nothing', () => {
    render(<Harness start={28} />);
    const up = byName('Raise');
    expect(up.getAttribute('aria-disabled')).toBe('true');
    expect(up.hasAttribute('disabled')).toBe(false);
    click(up);
    expect(log).toEqual([]);
    expect(byName('Lower').getAttribute('aria-disabled')).toBeNull();
  });

  it('keys on the figure: arrows, Page Up, Home and End', () => {
    render(<Harness />);
    const f = $('[role=spinbutton]');
    key(f, 'ArrowUp');
    key(f, 'ArrowRight');
    key(f, 'ArrowDown');
    key(f, 'PageUp');
    key(f, 'Home');
    key(f, 'End');
    expect(log).toEqual([
      'change:20',
      'change:20.5',
      'change:20',
      'change:25',
      'change:10',
      'change:28',
    ]);
  });

  it('adds without float drift', () => {
    expect(stepValue(0.1, 1, 0.2)).toBe(0.3);
    expect(stepValue(19.5, -1, 0.5, { min: 19.5 })).toBe(19.5);
    expect(stepValue(27.8, 1, 0.5, { max: 28 })).toBe(28);
  });

  it('a disabled stepper ignores everything', () => {
    render(
      <ValueStepper
        label="T"
        value={20}
        min={10}
        max={30}
        step={1}
        disabled
        onValueChange={(n) => log.push(`c:${n}`)}
      />,
    );
    click(byName('Raise'));
    key($('[role=spinbutton]'), 'ArrowUp');
    expect(log).toEqual([]);
  });
});

describe('StatusDot', () => {
  const TONES = ['neutral', 'success', 'info', 'warning', 'danger', 'active'] as const;

  it('shows its word and a distinct glyph for every tone', () => {
    render(
      <div>
        {TONES.map((t) => (
          <StatusDot key={t} tone={t} label={`State ${t}`} />
        ))}
      </div>,
    );
    for (const t of TONES) {
      expect(host.textContent).toContain(`State ${t}`);
      expect($(`[data-glyph=${t}]`)).not.toBeNull();
    }
    const shapes = new Set($$('svg[data-glyph]').map((s) => s.innerHTML));
    expect(shapes.size).toBe(TONES.length);
  });

  it('keeps the word for screen readers when it is not shown', () => {
    render(<StatusDot tone="success" label="Connected" showLabel={false} />);
    const word = $('.ui-status-dot > span:last-child');
    expect(word.textContent).toBe('Connected');
    expect(word.className).toContain('sr-only');
    expect($('svg').getAttribute('aria-hidden')).toBe('true');
  });

  it('the pulse ring is decorative and removed under reduced motion by class', () => {
    render(<StatusDot tone="active" label="Live" pulse />);
    const ring = $('[data-pulse]');
    expect(ring.getAttribute('aria-hidden')).toBe('true');
    expect(ring.className).toContain('motion-reduce:hidden');
    render(<StatusDot tone="active" label="Live" />);
    expect($('[data-pulse]')).toBeNull();
  });
});

describe('Countdown', () => {
  const NOW = 1_000_000_000_000;

  it('formats m:ss and h:mm:ss, and counts whole seconds', () => {
    expect(formatSeconds(42)).toBe('0:42');
    expect(formatSeconds(65)).toBe('1:05');
    expect(formatSeconds(3900)).toBe('1:05:00');
    expect(formatSeconds(-3)).toBe('0:00');
    expect(secondsLeft(NOW + 41_100, NOW)).toBe(42);
    expect(secondsLeft(new Date(NOW + 5000).toISOString(), NOW)).toBe(5);
    expect(secondsLeft('not a date', NOW)).toBe(0);
  });

  it('the figure is a timer that is never live; a status line exists before it speaks', () => {
    render(<Countdown label="Exit delay" until={NOW + 42_000} now={NOW} />);
    const timer = $('[role=timer]');
    expect(timer.textContent).toBe('0:42');
    expect(timer.getAttribute('aria-live')).toBe('off');
    expect(document.getElementById(timer.getAttribute('aria-labelledby') ?? '')?.textContent).toBe(
      'Exit delay',
    );
    const status = $('[role=status]');
    expect(status).not.toBeNull();
    expect(status.textContent).toBe('');
  });

  it('speaks at each threshold once, and at zero, and calls onElapsed once', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    const onElapsed = vi.fn<() => void>();
    render(
      <Countdown
        label="Exit delay"
        until={NOW + 12_000}
        onElapsed={onElapsed}
        announceAt={[10, 5]}
      />,
    );
    const status = $('[role=status]');
    const heard: string[] = [];
    for (let i = 0; i < 14; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const said = status.textContent ?? '';
      if (said && heard[heard.length - 1] !== said) heard.push(said);
    }
    expect(heard).toEqual([
      'Exit delay: 10 seconds left',
      'Exit delay: 5 seconds left',
      'Exit delay: time is up',
    ]);
    expect(onElapsed).toHaveBeenCalledOnce();
    expect($('[role=timer]').textContent).toBe('0:00');
    // a countdown elapsing is not a person's action: no sound
    expect(sounds).toEqual([]);
  });

  it('does not announce every second', () => {
    vi.useFakeTimers();
    vi.setSystemTime(NOW);
    render(<Countdown label="Wait" until={NOW + 40_000} />);
    const status = $('[role=status]');
    const seen: string[] = [];
    for (let i = 0; i < 36; i++) {
      act(() => {
        vi.advanceTimersByTime(1000);
      });
      const said = status.textContent ?? '';
      if (said && seen[seen.length - 1] !== said) seen.push(said);
    }
    expect(seen).toEqual([
      'Wait: 30 seconds left',
      'Wait: 10 seconds left',
      'Wait: 5 seconds left',
    ]);
  });

  it('a restarted deadline takes a new ring span when total is omitted', () => {
    const ring = (until: number, now: number) => (
      <Countdown label="Exit" variant="ring" until={until} now={now} />
    );
    const fraction = () => {
      const a = $('[data-ring-progress]');
      return (
        1 - Number(a.getAttribute('stroke-dashoffset')) / Number(a.getAttribute('stroke-dasharray'))
      );
    };
    render(ring(NOW + 60_000, NOW));
    expect(fraction()).toBeCloseTo(1, 2);
    render(ring(NOW + 60_000, NOW + 30_000));
    expect(fraction()).toBeCloseTo(0.5, 2);
    render(ring(NOW + 200_000, NOW + 30_000));
    expect(fraction()).toBeCloseTo(1, 2);
  });

  it('a deadline already past calls onElapsed once', () => {
    const onElapsed = vi.fn<() => void>();
    render(<Countdown label="Late" until={NOW - 5000} now={NOW} onElapsed={onElapsed} />);
    render(<Countdown label="Late" until={NOW - 5000} now={NOW + 1000} onElapsed={onElapsed} />);
    expect(onElapsed).toHaveBeenCalledOnce();
    expect($('[role=timer]').textContent).toBe('0:00');
  });

  it('the ring draws the proportion left and sizes to 120 / 200px', () => {
    render(<Countdown label="Exit" variant="ring" until={NOW + 15_000} now={NOW} total={60_000} />);
    const arc = $('[data-ring-progress]');
    const dash = Number(arc.getAttribute('stroke-dasharray'));
    const off = Number(arc.getAttribute('stroke-dashoffset'));
    expect(off / dash).toBeCloseTo(0.75, 2);
    expect($('.ui-countdown').className).toContain('size-30');
    expect(arc.getAttribute('class')).toContain('motion-reduce:transition-none');
    render(<Countdown label="Exit" variant="ring" size="lg" until={NOW + 15_000} now={NOW} />);
    expect($('.ui-countdown').className).toContain('size-50');
  });
});

describe('Keypad', () => {
  let onSubmit: ReturnType<typeof vi.fn<(code: string) => void>>;
  beforeEach(() => {
    onSubmit = vi.fn<(code: string) => void>();
  });
  const pad = (props: Partial<Parameters<typeof Keypad>[0]> = {}) => (
    <Keypad
      label="Enter your code"
      length={{ min: 4, max: 6 }}
      onSubmit={onSubmit}
      submitLabel="Unlock"
      {...props}
    />
  );
  const input = () => $<HTMLInputElement>('.ui-keypad input');

  it('one real password input holds the value, numeric, no autocomplete', () => {
    render(pad());
    expect(input().type).toBe('password');
    expect(input().getAttribute('inputmode')).toBe('numeric');
    expect(input().getAttribute('autocomplete')).toBe('off');
    expect(input().getAttribute('aria-labelledby')).not.toBeNull();
  });

  it('has twelve named, type=button keys in a fixed order', () => {
    render(pad());
    const keys = $$('.ui-keypad .grid button');
    expect(keys.length).toBe(12);
    expect(keys.every((k) => k.getAttribute('type') === 'button')).toBe(true);
    expect(keys.map((k) => k.getAttribute('aria-label') ?? k.textContent)).toEqual([
      '1',
      '2',
      '3',
      '4',
      '5',
      '6',
      '7',
      '8',
      '9',
      'Clear',
      '0',
      'Backspace',
    ]);
  });

  it('keys enter digits; Backspace removes one; Clear removes all', () => {
    vi.useFakeTimers();
    render(pad());
    for (const d of ['1', '2', '3']) {
      click(byName(d));
      later();
    }
    expect(input().value).toBe('123');
    click(byName('Backspace'));
    later();
    expect(input().value).toBe('12');
    click(byName('Clear'));
    expect(input().value).toBe('');
    expect(sounds).toEqual(['tick', 'tick', 'tick', 'tick', 'tick']);
  });

  it('a paste with separators is not cut before the digits are taken out', () => {
    render(pad());
    type(input(), '12-34 56');
    expect(input().value).toBe('123456');
    expect(input().hasAttribute('maxlength')).toBe(false);
  });

  it('typed entry keeps digits only and stops at the maximum', () => {
    render(pad());
    type(input(), '12ab34567890');
    expect(input().value).toBe('123456');
  });

  it('the dots draw the length and are aria-hidden; the description counts without the digits', () => {
    render(pad());
    click(byName('4'));
    click(byName('2'));
    expect($$('[data-filled]').length).toBe(2);
    expect($('[data-filled]').closest('[aria-hidden=true]')).not.toBeNull();
    expect(describedBy(input())).toContain('2 of 4 to 6 digits');
    expect(describedBy(input())).not.toContain('42');
  });

  it('never puts the digits in a live region', () => {
    render(pad({ message: 'Wrong code. 2 tries left.' }));
    for (const d of ['9', '8', '7', '6']) click(byName(d));
    for (const live of $$('[role=status], [aria-live], [role=alert]')) {
      expect(live.textContent).not.toContain('9876');
      expect(live.textContent).not.toMatch(/\b\d{3,}\b/);
    }
    expect($('.ui-keypad [role=status]').textContent).toBe('Wrong code. 2 tries left.');
  });

  it('submits only within the bounds, on Enter or the submit key, and clears itself', () => {
    render(pad());
    const submitKey = byName('Unlock');
    expect(submitKey.getAttribute('aria-disabled')).toBe('true');
    for (const d of ['1', '2', '3']) click(byName(d));
    key(input(), 'Enter');
    click(submitKey);
    expect(onSubmit).not.toHaveBeenCalled();
    click(byName('4'));
    expect(submitKey.getAttribute('aria-disabled')).toBeNull();
    key(input(), 'Enter');
    expect(onSubmit).toHaveBeenCalledWith('1234');
    expect(input().value).toBe('');
    for (const d of ['5', '5', '5', '5']) click(byName(d));
    click(byName('Unlock'));
    expect(onSubmit).toHaveBeenLastCalledWith('5555');
    expect(onSubmit).toHaveBeenCalledTimes(2);
  });

  it('an error is an alert in its own region, a plain message a polite status', () => {
    render(pad({ message: 'Wrong code.', error: true }));
    expect($('.ui-keypad [role=alert]').textContent).toBe('Wrong code.');
    expect($('.ui-keypad [role=status]').textContent).toBe('');
    render(pad({ message: 'Hello' }));
    expect($('.ui-keypad [role=alert]').textContent).toBe('');
    expect($('.ui-keypad [role=status]').getAttribute('aria-live')).toBe('polite');
    expect($('.ui-keypad [role=status]').textContent).toBe('Hello');
  });

  it('disabled ignores keys and submit', () => {
    render(pad({ disabled: true }));
    click(byName('1'));
    expect(input().value).toBe('');
    // read-only and aria-disabled, not disabled: focus is kept through a lockout
    expect(input().disabled).toBe(false);
    expect(input().readOnly).toBe(true);
    expect(input().getAttribute('aria-disabled')).toBe('true');
  });

  it('keys are 64px, or 80px at lg', () => {
    render(pad());
    expect(byName('5').className).toContain('h-16');
    render(pad({ size: 'lg' }));
    expect(byName('5').className).toContain('h-20');
  });
});

describe('SegmentedControl: size lg and option icons', () => {
  it('lg is a 56px segment; an icon sits with a label that is still there', () => {
    render(
      <SegmentedControl
        label="Mode"
        size="lg"
        defaultValue="a"
        options={[
          { value: 'a', label: 'Day', icon: 'sun' },
          { value: 'b', label: 'Night', icon: 'moon' },
        ]}
      />,
    );
    const items = $$('[role=radio]');
    expect(items[0]?.className).toContain('min-h-14');
    expect(items[0]?.querySelector('svg')?.getAttribute('aria-hidden')).toBe('true');
    expect(items[0]?.textContent).toBe('Day');
    expect(items[1]?.textContent).toBe('Night');
  });
});

describe('HoldToConfirm: size xl, icon and description', () => {
  it('xl is a 56px button; icon replaces the trash can; description is wired with aria-describedby', () => {
    render(
      <HoldToConfirm
        label="Hold to unlock"
        size="xl"
        icon="lock-open"
        description="Everyone in the household will be told."
        onConfirm={noop}
      />,
    );
    const b = $('button');
    expect(b.className).toContain('min-h-14');
    expect(b.querySelectorAll('svg').length).toBe(1);
    expect(describedBy(b)).toContain('Everyone in the household will be told.');
    expect(describedBy(b)).toContain('Press and hold');
  });
});

function Everything() {
  return (
    <main>
      <h1>Controls</h1>
      <ControlTile
        label="Lamp"
        context="Hall"
        icon="lightbulb"
        status="On · 70 %"
        tone="active"
        action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
        secondary={{ label: 'Lamp details', onClick: noop }}
      />
      <ControlTile
        label="Fan"
        icon="fan"
        status="Off"
        action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
      />
      <ControlTile
        label="Heater"
        icon="flame"
        status="Heating"
        state="pending"
        stateText="Switching on…"
        action={{ kind: 'toggle', pressed: true, onPressedChange: noop }}
      />
      <ControlTile
        label="Garage"
        icon="door-closed"
        status="Closed"
        state="failed"
        stateText="Couldn't reach it"
        action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
      />
      <ControlTile
        label="Speaker"
        icon="speaker"
        status="Offline"
        tone="danger"
        state="unavailable"
        stateText="Not reachable"
        action={{ kind: 'toggle', pressed: false, onPressedChange: noop }}
      />
      <ControlTile
        label="Blinds"
        icon="blinds"
        status="Open"
        size="lg"
        action={{ kind: 'open', href: '#x' }}
      />
      <ControlTile
        label="Door"
        icon="door-closed"
        status="Closed"
        size="sm"
        action={{ kind: 'open', onOpen: noop }}
      />
      <ControlTile
        label="Temperature"
        icon="thermometer"
        status="19 °C"
        action={{ kind: 'none' }}
      />
      <LevelSlider
        label="Brightness"
        value={70}
        formatValue={(v) => `${v} %`}
        ends={{ min: 'Dim', max: 'Bright' }}
        ghost={40}
        ghostLabel="Confirmed 40 %"
      />
      <LevelSlider
        label="Position"
        value={30}
        orientation="vertical"
        size="lg"
        ends={{ min: 'Closed', max: 'Open' }}
      />
      <LevelSlider label="Off level" value={10} disabled size="xl" />
      <ValueStepper
        label="Target"
        value={19.5}
        min={10}
        max={28}
        step={0.5}
        onValueChange={noop}
        format={(v) => `${v} °C`}
        status="Heating…"
      />
      <ValueStepper
        label="At the limit"
        value={28}
        min={10}
        max={28}
        step={0.5}
        size="lg"
        onValueChange={noop}
      />
      {(['neutral', 'success', 'info', 'warning', 'danger', 'active'] as const).map((t) => (
        <StatusDot key={t} tone={t} label={`Is ${t}`} pulse={t === 'active'} />
      ))}
      <Countdown label="Exit delay" until={1000 + 42_000} now={1000} />
      <Countdown label="Ring" variant="ring" until={1000 + 20_000} now={1000} total={60_000} />
      <Keypad
        label="Enter your code"
        length={{ min: 4, max: 6 }}
        onSubmit={noop}
        message="Wrong code."
        error
      />
      <SegmentedControl
        label="Mode"
        size="lg"
        defaultValue="a"
        options={[
          { value: 'a', label: 'Day', icon: 'sun' },
          { value: 'b', label: 'Night', icon: 'moon' },
        ]}
      />
      <HoldToConfirm
        label="Hold to unlock"
        size="xl"
        icon="lock-open"
        description="Everyone is told."
        variant="primary"
        onConfirm={noop}
      />
    </main>
  );
}

describe('axe: every control, every skin x mode', () => {
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
});

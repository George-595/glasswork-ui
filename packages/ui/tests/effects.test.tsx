// @vitest-environment jsdom
/* The kit's effects: what "motion never costs access" promises (ENGINEERING.md §5). jsdom has
   no WebGL, so the backdrop scene is replaced by a counting stub; what is under test is the
   component around it. */
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { renderToStaticMarkup } from 'react-dom/server';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { AnimatedBackground, PointerLight, RollingNumber } from '../src/effects';
import { planReels } from '../src/effects/RollingNumber';

/* jsdom cannot resolve a role's var() to numbers (a browser does): stand in for the role
   resolver. `roles.readable = false` is the "role not defined" case. */
const roles = vi.hoisted(() => ({ readable: true }));
vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  const pick = () => (roles.readable ? ([0.2, 0.3, 0.4] as const) : null);
  return {
    ...actual,
    resolveCssColor: pick,
    resolveCssColors: (values: readonly string[]) =>
      roles.readable ? values.map(() => [0.2, 0.3, 0.4] as const) : null,
  };
});

const scene = vi.hoisted(() => ({
  mounts: 0,
  live: 0,
  frames: 0,
}));

vi.mock('../src/effects/backgrounds/tide', () => ({
  mount: (container: HTMLElement) => {
    scene.mounts += 1;
    scene.live += 1;
    const canvas = document.createElement('canvas');
    container.append(canvas);
    return {
      render: () => {
        scene.frames += 1;
      },
      resize: () => {},
      setColors: () => {},
      destroy: () => {
        scene.live -= 1;
        canvas.remove();
      },
    };
  },
}));

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

let reducedMotion = false;
let host: HTMLDivElement;
let root: Root;

beforeEach(() => {
  reducedMotion = false;
  scene.mounts = 0;
  scene.live = 0;
  scene.frames = 0;
  vi.stubGlobal('matchMedia', (query: string) => ({
    matches: query.includes('reduced-motion') ? reducedMotion : false,
    media: query,
    addEventListener: () => {},
    removeEventListener: () => {},
  }));
  // jsdom has no canvas backend: report "no context", as a browser without one would
  vi.spyOn(HTMLCanvasElement.prototype, 'getContext').mockReturnValue(null);
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function render(node: ReactNode) {
  act(() => root.render(node));
  return host;
}

/** Let the lazy mount run: first-paint frame, timeout, dynamic import. */
async function settle() {
  for (let i = 0; i < 5; i += 1) {
    await act(async () => {
      await new Promise((r) => setTimeout(r, 20));
    });
  }
}

describe('AnimatedBackground', () => {
  it('is decorative and renders an empty div on the server', () => {
    const html = renderToStaticMarkup(<AnimatedBackground />);
    expect(html).toBe('<div aria-hidden="true" class="ui-fx-bg" data-variant="tide"></div>');
  });

  it('lazily mounts one scene after first paint, and animates it', async () => {
    const el = render(<AnimatedBackground />);
    expect(scene.mounts).toBe(0);
    await settle();
    expect(scene.mounts).toBe(1);
    const bg = el.querySelector('.ui-fx-bg');
    expect(bg?.getAttribute('aria-hidden')).toBe('true');
    expect(bg?.hasAttribute('data-live')).toBe(true);
    expect(scene.frames).toBeGreaterThan(0);
  });

  it('allows one WebGL instance per page: a second renders nothing', async () => {
    const el = render(
      <>
        <AnimatedBackground />
        <AnimatedBackground />
      </>,
    );
    await settle();
    expect(el.querySelectorAll('.ui-fx-bg')).toHaveLength(1);
    expect(scene.mounts).toBe(1);
    expect(scene.live).toBe(1);
  });

  it('releases the context on unmount so a later page can take it', async () => {
    render(<AnimatedBackground />);
    await settle();
    act(() => root.render(null));
    expect(scene.live).toBe(0);
    render(<AnimatedBackground />);
    await settle();
    expect(scene.mounts).toBe(2);
    expect(scene.live).toBe(1);
  });

  it('under reduced motion keeps the static gradient and starts no scene', async () => {
    reducedMotion = true;
    const el = render(<AnimatedBackground />);
    await settle();
    expect(scene.mounts).toBe(0);
    expect(el.querySelector('canvas')).toBeNull();
    expect(el.querySelector('.ui-fx-bg')?.hasAttribute('data-live')).toBe(false);
  });

  it('pauses while the tab is hidden', async () => {
    render(<AnimatedBackground />);
    await settle();
    const hidden = vi.spyOn(document, 'hidden', 'get').mockReturnValue(true);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    const before = scene.frames;
    await settle();
    expect(scene.frames).toBe(before);
    hidden.mockReturnValue(false);
    act(() => {
      document.dispatchEvent(new Event('visibilitychange'));
    });
    await settle();
    expect(scene.frames).toBeGreaterThan(before);
    hidden.mockRestore();
  });
});

/** The text assistive tech reads: every text node outside aria-hidden subtrees. */
function readableText(node: Node): string {
  if (node.nodeType === Node.TEXT_NODE) return node.textContent ?? '';
  if (node instanceof Element && node.getAttribute('aria-hidden') === 'true') return '';
  return Array.from(node.childNodes, readableText).join('');
}

/** A pointer event as a browser sends it; jsdom may lack PointerEvent, so a MouseEvent stands in. */
function pointer(type: string, pointerType: string, target: Element) {
  const Ctor = (globalThis.PointerEvent ?? MouseEvent) as typeof MouseEvent;
  const event = new Ctor(type, { bubbles: true, clientX: 12, clientY: 8 });
  Object.defineProperty(event, 'pointerType', { value: pointerType });
  act(() => {
    target.dispatchEvent(event);
  });
}

describe('RollingNumber', () => {
  const gbp = new Intl.NumberFormat('en-GB', { style: 'currency', currency: 'GBP' });
  const format = (v: number) => gbp.format(v);

  it('announces only the final value; the reels are hidden', async () => {
    const el = render(<RollingNumber id="r" to={12500.5} format={format} />);
    const figure = el.querySelector('#r') as HTMLElement;
    expect(figure.querySelector('.ui-roll-figure')?.getAttribute('aria-hidden')).toBe('true');
    expect(figure.querySelector('[aria-live]')).toBeNull();
    expect(readableText(figure)).toBe('£12,500.50');
    await settle();
    expect(readableText(figure)).toBe('£12,500.50');
  });

  it('winds the reels back, then rolls them to the figure', async () => {
    const el = render(<RollingNumber id="r" to={1000} />);
    expect(el.querySelector('#r')?.getAttribute('data-phase')).toBe('wound');
    await settle();
    expect(el.querySelector('#r')?.getAttribute('data-phase')).toBe('rolling');
    // one reel per digit, separators are not reels
    expect(el.querySelectorAll('#r .ui-roll-reel')).toHaveLength(4);
    expect(el.querySelectorAll('#r .ui-roll-sep')).toHaveLength(1);
  });

  it('lines the reels up from the right and lands each on its digit', () => {
    const reels = planReels('0', '12,840').filter((c) => c.reel);
    expect(reels.map((c) => c.end % 10)).toEqual([1, 2, 8, 4, 0]);
    expect(reels.map((c) => c.start)).toEqual([0, 0, 0, 0, 0]);
    // only the units place existed in "0": the four higher places arrive
    expect(reels.map((c) => c.arrives)).toEqual([true, true, true, true, false]);
    // every reel rolls forward and stays on its strip
    expect(reels.every((c) => c.end > c.start && c.end < 20)).toBe(true);
    // a roll on from 1,000 to 1,250: the thousands reel already shows 1 and stays put
    const on = planReels('1,000', '1,250').filter((c) => c.reel);
    expect(on.map((c) => c.start)).toEqual([1, 0, 0, 0]);
    expect(on.map((c) => c.end)).toEqual([1, 2, 5, 10]);
  });

  it('shows the plain figure at once under reduced motion, or when asked', () => {
    reducedMotion = true;
    const el = render(<RollingNumber id="r" to={42.5} format={format} />);
    expect(el.querySelector('#r .ui-roll-figure')).toBeNull();
    expect(el.querySelector('#r')?.textContent).toBe('£42.50');
    act(() => root.render(null));
    reducedMotion = false;
    const still = render(<RollingNumber id="s" to={7} animate={false} />);
    expect(still.querySelector('#s .ui-roll-figure')).toBeNull();
    expect(still.querySelector('#s')?.textContent).toBe('7');
  });
});

describe('PointerLight', () => {
  it('keeps its children focusable and adds only hidden layers', () => {
    const el = render(
      <PointerLight id="pl">
        <button type="button">Open</button>
      </PointerLight>,
    );
    const host = el.querySelector('#pl') as HTMLElement;
    expect(host.hasAttribute('tabindex')).toBe(false);
    expect(host.hasAttribute('aria-hidden')).toBe(false);
    const layers = host.querySelectorAll('.ui-pl-glow, .ui-pl-rim');
    expect(layers).toHaveLength(2);
    for (const layer of layers) expect(layer.getAttribute('aria-hidden')).toBe('true');
    const button = host.querySelector('button') as HTMLButtonElement;
    button.focus();
    expect(document.activeElement).toBe(button);
  });

  it('a mouse lights it and starts one sheen; a touch does not', () => {
    const el = render(<PointerLight id="pl">Card</PointerLight>);
    const host = el.querySelector('#pl') as HTMLElement;
    pointer('pointerover', 'touch', host);
    expect(host.hasAttribute('data-lit')).toBe(false);
    expect(host.querySelector('.ui-pl-sheen')).toBeNull();
    pointer('pointerout', 'touch', host);
    pointer('pointerover', 'mouse', host);
    expect(host.hasAttribute('data-lit')).toBe(true);
    expect(host.querySelectorAll('.ui-pl-sheen')).toHaveLength(1);
    pointer('pointerout', 'mouse', host);
    expect(host.hasAttribute('data-lit')).toBe(false);
  });

  it('does nothing under reduced motion', () => {
    reducedMotion = true;
    const el = render(<PointerLight id="pl">Card</PointerLight>);
    const host = el.querySelector('#pl') as HTMLElement;
    expect(host.getAttribute('data-motion')).toBe('off');
    pointer('pointerover', 'mouse', host);
    expect(host.hasAttribute('data-lit')).toBe(false);
    expect(host.querySelector('.ui-pl-glow, .ui-pl-rim, .ui-pl-sheen')).toBeNull();
  });

  it('draws the card surface when asked', () => {
    const el = render(
      <PointerLight id="pl" surface>
        Card
      </PointerLight>,
    );
    expect(el.querySelector('#pl')?.classList.contains('ui-card')).toBe(true);
  });
});

describe('server rendering', () => {
  it('renderToStaticMarkup works for every component and shows static content', () => {
    const cases: Array<[string, ReactNode, string]> = [
      ['AnimatedBackground', <AnimatedBackground key="a" variant="hive" />, ''],
      ['RollingNumber', <RollingNumber key="b" to={1234} />, '1,234'],
      ['PointerLight', <PointerLight key="c">Card</PointerLight>, 'Card'],
    ];
    // the server renders the static form: the text, the reels settled, no canvas
    const seen = cases.map(([name, node, text]) => {
      const html = renderToStaticMarkup(node);
      return {
        name,
        hasText: html.includes(text),
        rolling: html.includes('data-phase="rolling"') || html.includes('data-phase="wound"'),
        canvas: html.includes('<canvas'),
      };
    });
    expect(seen).toEqual(
      cases.map(([name]) => ({ name, hasText: true, rolling: false, canvas: false })),
    );
  });
});

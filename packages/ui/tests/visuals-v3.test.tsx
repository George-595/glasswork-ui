// @vitest-environment jsdom
/* Visuals on roles (charts, effects, shaders, glass refraction, shell, nav, theme toggle):
   every colour a role, none written by hand. Three kinds of check:
   - the chart series are the eight chart roles, and the rest of the drawing code names roles;
   - a scan of every file in the visuals' folders for the patterns George banned (hex, rgb(),
     hsl(), oklch(), oklab(), color-mix(), the old pre-role names, colour-carrying arbitrary
     values);
   - the shader palette is read from the shader-* roles, and the new roles exist in all four
     themes;
   plus axe over the shell, nav, toggle and charts in the four skin x mode passes. */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join, relative } from 'node:path';
import { cssVar, EFFECTS, ROLES, THEMES } from '@apps/colors';
import axe from 'axe-core';
import { act, type ReactNode } from 'react';
import { createRoot, type Root } from 'react-dom/client';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  CHART_THEME,
  COMPARISON_DASH,
  DASHES,
  GRID,
  PAINT,
  PATTERN_COUNT,
  SERIES_VARS,
  seriesColor,
  seriesDash,
} from '../src/charts/ChartFrame';
import { markerPath, strokedMarker } from '../src/charts/markers';
import {
  AppShell,
  BarChart,
  DonutChart,
  LineChart,
  SectionNav,
  Sidebar,
  SkinSelect,
  ThemeToggle,
  Topbar,
} from '../src/index';

const probed = vi.hoisted(() => ({ asked: [] as string[] }));
vi.mock('../src/effects/cssColor', async (importActual) => {
  const actual = await importActual<typeof import('../src/effects/cssColor')>();
  return {
    ...actual,
    resolveCssColor: (value: string) => {
      probed.asked.push(value);
      return [0.2, 0.3, 0.4] as const;
    },
  };
});

(globalThis as { IS_REACT_ACT_ENVIRONMENT?: boolean }).IS_REACT_ACT_ENVIRONMENT = true;

describe('charts: eight series, all roles', () => {
  it('SERIES_VARS is chart-1..chart-8 through cssVar', () => {
    expect(SERIES_VARS).toEqual(
      [1, 2, 3, 4, 5, 6, 7, 8].map((n) => cssVar(`chart-${n}` as `chart-${1 | 2}`)),
    );
    expect(seriesColor(7)).toBe('var(--chart-8)');
    expect(seriesColor(8)).toBe('var(--chart-1)'); // wraps after eight
  });

  it('every series also differs by dash, marker and pattern (not colour alone)', () => {
    expect(DASHES).toHaveLength(8);
    expect(new Set(DASHES).size).toBe(8);
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => seriesDash(i) ?? 'solid')).size).toBe(8);
    expect(COMPARISON_DASH).not.toBe(seriesDash(1));
    expect(new Set([0, 1, 2, 3, 4, 5, 6, 7].map((i) => markerPath(i, 0, 0))).size).toBe(8);
    expect([4, 6].every(strokedMarker)).toBe(true);
    expect(PATTERN_COUNT).toBe(8);
  });

  it('grid, axis, ring, gap and up/down are roles', () => {
    expect(CHART_THEME.grid).toBe('var(--border-subtle)');
    expect(GRID.stroke).toBe('var(--border-subtle)');
    expect(CHART_THEME.focusRing).toMatchObject({ fill: 'var(--surface-solid)' });
    expect(CHART_THEME.palette).toBe(SERIES_VARS);
    expect(PAINT).toMatchObject({
      gap: 'var(--surface-solid)',
      up: 'var(--up)',
      down: 'var(--down)',
      label: 'var(--fg-muted)',
    });
  });
});

describe('the new roles exist in all four themes', () => {
  const added = [
    'backdrop-1',
    'backdrop-2',
    'backdrop-3',
    'shader-bg',
    'shader-a',
    'shader-b',
    'shader-c',
    'shader-scrim',
  ] as const;
  it('backdrops, the shader palette and the scrim are roles; the lens colours are effects', () => {
    for (const r of added) expect(ROLES).toContain(r);
    expect(EFFECTS).toContain('lens-light');
    expect(EFFECTS).toContain('lens-shade');
    for (const theme of Object.values(THEMES)) {
      for (const r of added) expect(theme.roles[r]).toBeTruthy();
      expect(theme.roles['shader-bg']).toBe(theme.roles.canvas);
      // the scrim is the page colour at an alpha, never opaque
      expect(theme.roles['shader-scrim']).toMatch(/^rgba\(/);
    }
  });
});

describe('the shader palette is read from roles', () => {
  it('asks for shader-bg, shader-a, shader-b and shader-c, nothing else', async () => {
    const { resolvePalette } = await import('../src/effects/shaders/palette');
    probed.asked.length = 0;
    const host = document.createElement('div');
    const p = resolvePalette(host);
    expect(probed.asked).toEqual([
      'var(--shader-bg)',
      'var(--shader-a)',
      'var(--shader-b)',
      'var(--shader-c)',
    ]);
    expect(p?.a).toMatch(/^#[0-9a-f]{6}$/);
  });

  it('has no mixing code left', async () => {
    const mod = await import('../src/effects/shaders/palette');
    expect(Object.keys(mod).sort()).toEqual(
      ['intensityOpacity', 'luminance', 'resolvePalette', 'toHex'].sort(),
    );
  });
});

/* ---- the scan -------------------------------------------------------------------------- */
const SRC = join(__dirname, '..', 'src');
const OWNED = [
  'charts',
  'effects',
  'glass',
  'shell',
  'nav',
  'theme',
  'styles/effects.css',
  'styles/liquid-glass.css',
];

function files(path: string): string[] {
  if (statSync(path).isFile()) return [path];
  return readdirSync(path).flatMap((f) => files(join(path, f)));
}

/** Source without comments (prose may name rgb() or hex when explaining the rule). */
function code(file: string): string {
  const text = readFileSync(file, 'utf8');
  const noBlock = text.replace(/\/\*[\s\S]*?\*\//g, '');
  return file.endsWith('.css') ? noBlock : noBlock.replace(/(^|[^:"'`])\/\/.*$/gm, '$1');
}

const FORBIDDEN: readonly [string, RegExp][] = [
  ['a hex colour', /#[0-9a-fA-F]{3,8}\b/],
  ['a colour function', /\b(?:rgba?|hsla?|hwb|lab|lch|oklab|oklch)\(/],
  ['color-mix', /color-mix\(/],
  [
    'an old pre-role name',
    /var\(--(?:ink(?:-2)?|muted|dim|line(?:-strong)?|bg(?:-sunken|-grid)?|elevated|accent[\w-]*|control-border|danger-fill|up-wash|down-wash|up-bright|down-bright|warn|s-[a-z]+|bar-surface|inset-press|glass-highlight|glass-tint[\w-]*|glass-chip|glass-sheen)\)/,
  ],
  [
    'an old Tailwind colour name',
    /\b(?:text-ink(?:-2)?|border-edge|bg-elevated|text-muted-foreground|bg-accent-wash|text-accent-soft|bg-card)\b/,
  ],
  [
    'an arbitrary colour value',
    /\b(?:bg|text|border|fill|stroke|from|to|via)-\[(?:#|rgb|hsl|oklch|var\(--glass)/,
  ],
  ['a named colour', /:\s*(?:white|black|red|green|blue|gray|grey)\s*[;,)]/],
  ['a system colour', /\b(?:CanvasText|Canvas|ButtonText|LinkText|Highlight)\b/],
];

describe('no hand-rolled colour in the visuals', () => {
  const targets = OWNED.flatMap((p) => files(join(SRC, p))).filter((f) => /\.(tsx?|css)$/.test(f));

  it('scans the folders it should', () => {
    expect(targets.length).toBeGreaterThan(40);
  });

  for (const file of targets) {
    it(`${relative(SRC, file)}: no hand-rolled colour`, () => {
      const text = code(file);
      const hits = FORBIDDEN.filter(([, re]) => re.test(text)).map(([what]) => what);
      expect(hits).toEqual([]);
    });
  }
});

describe('the retired stylesheets are gone', () => {
  it('has no charts.css or shell.css: both are Tailwind in the components', () => {
    const present = readdirSync(join(SRC, 'styles'));
    expect(present).not.toContain('charts.css');
    expect(present).not.toContain('shell.css');
    const index = readFileSync(join(SRC, 'styles', 'index.css'), 'utf8');
    expect(index).not.toMatch(/charts\.css|shell\.css/);
  });

  it('liquid-glass.css places layers and names only lens effects and a surface fill', () => {
    const css = code(join(SRC, 'styles', 'liquid-glass.css'));
    expect(css).toContain('var(--lens-shade)');
    expect(css).toContain('var(--lens-light)');
    expect(css).toContain('var(--lg-fill');
  });
});

/* ---- axe over the shell, nav, toggle and charts, four passes ---------------------------- */
let host: HTMLDivElement;
let root: Root;
beforeEach(() => {
  window.matchMedia = ((query: string) => ({
    matches: query.includes('reduce'),
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  })) as typeof window.matchMedia;
  host = document.createElement('div');
  document.body.append(host);
  root = createRoot(host);
});
afterEach(() => {
  act(() => root.unmount());
  host.remove();
  document.documentElement.removeAttribute('data-skin');
  document.documentElement.removeAttribute('data-theme');
});

const SECTIONS = [
  { id: 'home', title: 'Home', href: '#/', icon: 'home' as const },
  { id: 'data', title: 'Data', href: '#/data' },
];

function Page(): ReactNode {
  return (
    <AppShell
      brand={<span>Brand</span>}
      background={false}
      sidebar={<Sidebar sections={[{ label: 'App', items: SECTIONS }]} current="home" />}
      topbar={
        <Topbar
          title="Page"
          actions={
            <>
              <SkinSelect skin="glass" onChange={() => {}} />
              <ThemeToggle theme="dark" onToggle={() => {}} />
            </>
          }
        />
      }
    >
      <SectionNav sections={SECTIONS} current="data" label="Local" />
      <LineChart title="Revenue" series={[{ name: 'A', points: [{ x: 'Mon', y: 3 }] }]} />
      <BarChart title="Orders" data={[{ label: 'Home', value: 120 }]} />
      <DonutChart title="Mix" data={[{ label: 'X', value: 3 }]} />
    </AppShell>
  );
}

describe('axe: shell, nav, toggle and charts in every skin and mode', () => {
  for (const [skin, theme] of [
    ['enterprise', 'dark'],
    ['enterprise', 'light'],
    ['glass', 'dark'],
    ['glass', 'light'],
  ] as const) {
    it(`${skin} ${theme}: no violations`, async () => {
      document.documentElement.setAttribute('data-skin', skin);
      document.documentElement.setAttribute('data-theme', theme);
      act(() => root.render(<Page />));
      const result = await axe.run(host, {
        runOnly: { type: 'tag', values: ['wcag2a', 'wcag2aa', 'wcag21a', 'wcag21aa', 'wcag22aa'] },
        // jsdom has no layout: contrast is measured by the real-browser gate (npm run a11y)
        rules: { 'color-contrast': { enabled: false }, region: { enabled: false } },
        resultTypes: ['violations'],
      });
      expect(
        result.violations.map(
          (v) => `${v.id}: ${v.nodes.map((n) => n.target.join(' ')).join(', ')}`,
        ),
      ).toEqual([]);
    });
  }
});

import { over, rgb, toHex } from './colour.ts';
import {
  amber,
  azure,
  black,
  graphite as g,
  green,
  lime,
  mist,
  orange,
  red,
  rose,
  seaGlass,
  sky,
  slate,
  teal,
  violet,
  white,
} from './palette.ts';

/* The roles: the ONLY colour names a component may use. A role says what a colour is for
   (the page, a card, the main action's hover, a gain), and each skin × mode gives every role
   a value from the palette. Components never ask which skin or mode is on: the same role
   name is right in all four.

   Groups (README.md has the full table and when to use each):
   - surfaces   canvas … selected       what things sit on
   - text       fg … fg-disabled        what words are drawn in
   - lines      border … focus          edges and the focus ring colour
   - actions    primary … disabled      every button level, each with hover / active
                                        (pressed) and its foreground (on-*)
   - status     success … brand-soft    messages and states; `x` is text, `x-soft` a wash
   - market     up … flat               gains and losses
   - data       chart-1 … chart-8       categorical series, >= 3:1 on canvas and surface
   - ramp       heat-0 … heat-4         one hue in four steps; heat-1..4 >= 3:1 on canvas and surface
   - identity   avatar-1 … avatar-6     a fill and an edge per avatar hue
   - scenes     backdrop-*, shader-*    the animated and static page backdrops (see `scene` below)
   - sea glass  seaglass-*              the SeaGlass material: paper, sun, sky, glass tints
   - effects    shadow-* … sheen        the coloured parts of shadows and materials

   Selected rows and toggles: `selected` is a wash for CONTROLS (a pressed toggle, the chosen
   segment). A selected table row is never washed: a wash pulls coloured cell text under
   4.5:1; rows show selection with a `brand` bar and the checkbox. */

export const ROLES = [
  // surfaces
  'canvas',
  'surface',
  'surface-solid',
  'raised',
  'sunken',
  'overlay',
  'bar',
  'scrim',
  'hover',
  'pressed',
  'selected',
  // text
  'fg',
  'fg-muted',
  'fg-subtle',
  'fg-disabled',
  // lines
  'border',
  'border-subtle',
  'border-strong',
  'border-input',
  'focus',
  // actions
  'primary',
  'primary-hover',
  'primary-active',
  'on-primary',
  'secondary',
  'secondary-hover',
  'secondary-active',
  'on-secondary',
  'neutral',
  'neutral-hover',
  'neutral-active',
  'neutral-border',
  'on-neutral',
  'outline-border',
  'outline-hover',
  'outline-active',
  'on-outline',
  'ghost-hover',
  'ghost-active',
  'on-ghost',
  'link',
  'link-hover',
  'danger-solid',
  'danger-solid-hover',
  'danger-solid-active',
  'on-danger',
  'success-solid',
  'success-solid-hover',
  'success-solid-active',
  'on-success',
  'disabled',
  'disabled-fg',
  'disabled-border',
  // status
  'success',
  'success-soft',
  'warning',
  'warning-soft',
  'danger',
  'danger-soft',
  'info',
  'info-soft',
  'brand',
  'brand-soft',
  // market
  'up',
  'up-soft',
  'down',
  'down-soft',
  'flat',
  // data
  'chart-1',
  'chart-2',
  'chart-3',
  'chart-4',
  'chart-5',
  'chart-6',
  'chart-7',
  'chart-8',
  // sequential ramp (activity heatmap): empty, then four steps of one hue
  'heat-0',
  'heat-1',
  'heat-2',
  'heat-3',
  'heat-4',
  // identity
  'avatar-1',
  'avatar-1-edge',
  'avatar-2',
  'avatar-2-edge',
  'avatar-3',
  'avatar-3-edge',
  'avatar-4',
  'avatar-4-edge',
  'avatar-5',
  'avatar-5-edge',
  'avatar-6',
  'avatar-6-edge',
  // scenes: the page backdrops (static washes, shader palette + scrim), see `scene`
  'backdrop-1',
  'backdrop-2',
  'backdrop-3',
  'shader-bg',
  'shader-a',
  'shader-b',
  'shader-c',
  'shader-scrim',
  // sea glass: the SeaGlass material's paper, light and seven glass tints, see `seaglass`
  'seaglass-paper',
  'seaglass-sun',
  'seaglass-sky',
  'seaglass-0',
  'seaglass-1',
  'seaglass-2',
  'seaglass-3',
  'seaglass-4',
  'seaglass-5',
  'seaglass-6',
] as const;

export type Role = (typeof ROLES)[number];

/* Effects: values that carry colour but are not one colour (shadows, gradients, materials).
   They become CSS custom properties of the same name; components use them through the
   kit's elevation and material tokens, never directly. */
export const EFFECTS = [
  'shadow-sm',
  'shadow-md',
  'shadow-lg',
  'shadow-inset',
  'glass-rim',
  'sheen',
  'highlight',
  'shine',
  'glare',
  'spotlight',
  'grid-dot',
  'app-backdrop',
  'lens-light',
  'lens-shade',
] as const;

export type Effect = (typeof EFFECTS)[number];

export const SKINS = ['enterprise', 'glass'] as const;
export const MODES = ['light', 'dark'] as const;
export type Skin = (typeof SKINS)[number];
export type Mode = (typeof MODES)[number];
export type ThemeKey = `${Skin}-${Mode}`;

export interface Theme {
  roles: Record<Role, string>;
  effects: Record<Effect, string>;
  /** The worst point under a translucent surface: what the gate composites against. */
  backdropPeak: string;
}

/* The sequential ramp (ActivityHeatmap): `heat-0` is an empty cell (a quiet wash, outlined by
   the chart), `heat-1`..`heat-4` are one azure hue in four steps, each >= 3:1 on the page and
   the surface. Dark mode climbs from deep to pale, light mode from mid to deep, so "more" is
   always further from the background. */
const heat = (steps: readonly [string, string, string, string], empty: string) => ({
  'heat-0': empty,
  'heat-1': steps[0],
  'heat-2': steps[1],
  'heat-3': steps[2],
  'heat-4': steps[3],
});
const HEAT_DARK = [azure[600], azure[500], azure[400], azure[200]] as const;
const HEAT_LIGHT = [azure[500], azure[600], azure[700], azure[800]] as const;

/* An avatar hue: a soft fill of the hue over the solid surface, and the hue as its edge.
   The initials are `fg`, so they keep their contrast whatever the hue. */
const avatars = (hues: readonly string[], alpha: number) =>
  Object.fromEntries(
    hues.flatMap((hue, i) => [
      [`avatar-${i + 1}`, rgb(hue, alpha)],
      [`avatar-${i + 1}-edge`, hue],
    ]),
  ) as Record<`avatar-${1 | 2 | 3 | 4 | 5 | 6}` | `avatar-${1 | 2 | 3 | 4 | 5 | 6}-edge`, string>;

/* The page backdrops: the static washes of AnimatedBackground / ShaderBackdrop (before the
   scene loads, under reduced motion, when WebGL is missing) and the shader scene's palette.

   - backdrop-1..3: a series hue (chart-1, chart-2, chart-3) at WASH alpha over the page. The
     alpha is how strongly the static backdrop shows: dark pages carry more colour than light
     ones before text loses contrast (26% dark, 12% light: retuned for the graphite + azure palette).
   - shader-bg: the page colour. shader-a/b/c: chart-1/2/3 already MIXED TOWARD THE PAGE by
     MAX_TINT, the strongest tint a shader ever paints (dark 0.45, light 0.40). The `intensity`
     prop of ShaderBackdrop / ShaderAccent is the canvas opacity (0..1) on top of that, which
     over the page colour is the same blend the old runtime mix produced at that intensity.
   - shader-scrim: the page colour at 30%, laid over the live canvas so text sitting straight
     on the page keeps 4.5:1 over the busiest frame. Raise the scrim, never the scene, if a
     preset needs more.
   The gate measures text over every one of these (see gate.ts). */
const WASH = { dark: 0.26, light: 0.12 } as const;
const MAX_TINT = { dark: 0.4, light: 0.2 } as const;
const SCRIM = 0.3;
const scene = (canvas: string, hues: readonly [string, string, string], mode: 'dark' | 'light') => {
  const tint = (hue: string) => toHex(over(rgb(hue, MAX_TINT[mode]), canvas));
  return {
    'backdrop-1': rgb(hues[0], WASH[mode]),
    'backdrop-2': rgb(hues[1], WASH[mode]),
    'backdrop-3': rgb(hues[2], WASH[mode]),
    'shader-bg': canvas,
    'shader-a': tint(hues[0]),
    'shader-b': tint(hues[1]),
    'shader-c': tint(hues[2]),
    'shader-scrim': rgb(canvas, SCRIM),
  } satisfies Partial<Record<Role, string>>;
};

/* Sea glass (the SeaGlass material, @apps/ui): the same in both skins, one set per mode.
   - seaglass-paper: the paper the pebbles lie on (the shader lights and shades it).
   - seaglass-sun / seaglass-sky: the colour of the direct light and of the ambient light. The
     shader scales them (they are light colours, never painted as a fill); dark mode is a cool
     moon over a night sky, so every lit term falls with them.
   - seaglass-0: clear (neutral) glass, an "off" piece. seaglass-1..6: coral, orchid,
     periwinkle, aqua, seafoam, amber. Each is also the flat fill a piece falls back to when
     the GPU is unavailable, so the gate measures `fg` and `fg-muted` on the paper and on
     every tint, and links on clear glass. */
const seaglass = (mode: 'light' | 'dark') => {
  const s = seaGlass[mode];
  return {
    'seaglass-paper': s.paper,
    'seaglass-sun': s.sun,
    'seaglass-sky': s.sky,
    'seaglass-0': s.clear,
    'seaglass-1': s.coral,
    'seaglass-2': s.orchid,
    'seaglass-3': s.periwinkle,
    'seaglass-4': s.aqua,
    'seaglass-5': s.seafoam,
    'seaglass-6': s.amber,
  } satisfies Partial<Record<Role, string>>;
};

/* ---- ENTERPRISE · dark ------------------------------------------------------------- */
const enterpriseDark: Theme = {
  roles: {
    canvas: g[950],
    surface: g[940],
    'surface-solid': g[900],
    raised: g[900],
    sunken: g[975],
    overlay: g[900],
    bar: g[940],
    scrim: rgb(black, 0.6),
    hover: g[875],
    pressed: g[800],
    selected: rgb(azure[500], 0.16),

    fg: g[50],
    'fg-muted': g[350],
    'fg-subtle': g[450],
    'fg-disabled': g[650],

    border: g[825],
    'border-subtle': rgb(white, 0.07),
    'border-strong': rgb(white, 0.14),
    'border-input': g[550],
    focus: azure[500],

    primary: g[50],
    'primary-hover': g[200],
    'primary-active': g[300],
    'on-primary': g[950],
    secondary: rgb(azure[500], 0.16),
    'secondary-hover': rgb(azure[500], 0.24),
    'secondary-active': rgb(azure[500], 0.32),
    'on-secondary': azure[300],
    neutral: g[900],
    'neutral-hover': g[850],
    'neutral-active': g[925],
    'neutral-border': g[750],
    'on-neutral': g[50],
    'outline-border': rgb(white, 0.14),
    'outline-hover': g[875],
    'outline-active': g[800],
    'on-outline': g[50],
    'ghost-hover': g[875],
    'ghost-active': g[800],
    'on-ghost': g[350],
    link: azure[400],
    'link-hover': azure[300],
    'danger-solid': red[600],
    'danger-solid-hover': red[700],
    'danger-solid-active': red[800],
    'on-danger': white,
    'success-solid': green[600],
    'success-solid-hover': green[700],
    'success-solid-active': green[800],
    'on-success': white,
    disabled: g[900],
    'disabled-fg': g[650],
    'disabled-border': g[825],

    success: green[400],
    'success-soft': rgb(green[400], 0.1),
    warning: amber[400],
    'warning-soft': rgb(amber[400], 0.1),
    danger: red[400],
    'danger-soft': rgb(red[400], 0.1),
    info: sky[400],
    'info-soft': rgb(sky[400], 0.1),
    brand: azure[400],
    'brand-soft': rgb(azure[500], 0.14),

    up: green[400],
    'up-soft': rgb(green[400], 0.1),
    down: red[400],
    'down-soft': rgb(red[400], 0.1),
    flat: g[450],

    'chart-1': azure[400],
    'chart-2': teal[300],
    'chart-3': amber[400],
    'chart-4': rose[300],
    'chart-5': lime[300],
    'chart-6': orange[300],
    'chart-7': violet[300],
    'chart-8': slate[300],

    ...heat(HEAT_DARK, g[800]),
    ...avatars([azure[400], teal[300], amber[400], rose[300], lime[300], violet[300]], 0.16),
    ...scene(g[950], [azure[400], teal[300], amber[400]], 'dark'),
    ...seaglass('dark'),
  },
  effects: {
    'shadow-sm': `0 1px 2px ${rgb(black, 0.5)}`,
    'shadow-md': `0 6px 20px -6px ${rgb(black, 0.6)}`,
    'shadow-lg': `0 24px 56px -18px ${rgb(black, 0.7)}`,
    'shadow-inset': `inset 0 1px 2px 0 ${rgb(black, 0.5)}`,
    'glass-rim': `0 0 ${rgb(black, 0)}`,
    sheen: `0 0 ${rgb(black, 0)}`,
    highlight: g[875],
    shine: rgb(g[50], 0.08),
    glare: rgb(g[50], 0.08),
    spotlight: rgb(azure[500], 0.12),
    'grid-dot': rgb(white, 0.035),
    'app-backdrop': 'none',
    'lens-light': rgb(white, 0.82),
    'lens-shade': black,
  },
  backdropPeak: g[950],
};

/* ---- ENTERPRISE · light ------------------------------------------------------------ */
const enterpriseLight: Theme = {
  roles: {
    canvas: g[50],
    surface: g[0],
    'surface-solid': g[0],
    raised: g[0],
    sunken: g[100],
    overlay: g[0],
    bar: g[0],
    scrim: rgb(g[950], 0.45),
    hover: g[100],
    pressed: g[150],
    selected: rgb(azure[500], 0.1),

    fg: g[950],
    'fg-muted': g[700],
    'fg-subtle': g[600],
    'fg-disabled': g[400],

    border: g[200],
    'border-subtle': g[150],
    'border-strong': g[300],
    'border-input': g[450],
    focus: azure[500],

    primary: g[900],
    'primary-hover': g[800],
    'primary-active': g[950],
    'on-primary': g[50],
    secondary: rgb(azure[500], 0.1),
    'secondary-hover': rgb(azure[500], 0.16),
    'secondary-active': rgb(azure[500], 0.2),
    'on-secondary': azure[700],
    neutral: g[0],
    'neutral-hover': g[75],
    'neutral-active': g[150],
    'neutral-border': g[300],
    'on-neutral': g[950],
    'outline-border': g[300],
    'outline-hover': g[100],
    'outline-active': g[150],
    'on-outline': g[950],
    'ghost-hover': g[100],
    'ghost-active': g[150],
    'on-ghost': g[700],
    link: azure[600],
    'link-hover': azure[700],
    'danger-solid': red[600],
    'danger-solid-hover': red[700],
    'danger-solid-active': red[800],
    'on-danger': white,
    'success-solid': green[600],
    'success-solid-hover': green[700],
    'success-solid-active': green[800],
    'on-success': white,
    disabled: g[100],
    'disabled-fg': g[400],
    'disabled-border': g[200],

    success: green[700],
    'success-soft': rgb(green[600], 0.08),
    warning: amber[800],
    'warning-soft': rgb(amber[400], 0.1),
    danger: red[600],
    'danger-soft': rgb(red[600], 0.07),
    info: sky[800],
    'info-soft': rgb(sky[400], 0.1),
    brand: azure[600],
    'brand-soft': rgb(azure[500], 0.08),

    up: green[700],
    'up-soft': rgb(green[600], 0.08),
    down: red[600],
    'down-soft': rgb(red[600], 0.07),
    flat: g[600],

    'chart-1': azure[600],
    'chart-2': teal[700],
    'chart-3': amber[700],
    'chart-4': rose[700],
    'chart-5': lime[700],
    'chart-6': orange[700],
    'chart-7': violet[700],
    'chart-8': slate[700],

    ...heat(HEAT_LIGHT, g[150]),
    ...avatars([azure[600], teal[700], amber[700], rose[700], lime[700], violet[700]], 0.1),
    ...scene(g[50], [azure[600], teal[700], amber[700]], 'light'),
    ...seaglass('light'),
  },
  effects: {
    'shadow-sm': `0 1px 2px ${rgb(g[950], 0.06)}`,
    'shadow-md': `0 6px 20px -6px ${rgb(g[950], 0.1)}`,
    'shadow-lg': `0 24px 56px -18px ${rgb(g[950], 0.16)}`,
    'shadow-inset': `inset 0 1px 2px 0 ${rgb(g[950], 0.12)}`,
    'glass-rim': `0 0 ${rgb(black, 0)}`,
    sheen: `0 0 ${rgb(black, 0)}`,
    highlight: g[100],
    shine: rgb(g[950], 0.06),
    glare: rgb(g[950], 0.06),
    spotlight: rgb(azure[500], 0.1),
    'grid-dot': rgb(g[950], 0.05),
    'app-backdrop': 'none',
    'lens-light': white,
    'lens-shade': black,
  },
  backdropPeak: g[50],
};

/* ---- GLASS · dark -------------------------------------------------------------------
   The Liquid Glass "regular" material (Glass HQ, MIT; see packages/ui THIRD_PARTY_NOTICES):
   a translucent graphite fill over a softly washed page. Text colours are tuned so every one
   keeps 4.5:1 against the WORST point under a surface (the backdrop wash at its peak). */
const glassPeakDark = rgb(azure[500], 0.2);
const glassDark: Theme = {
  roles: {
    canvas: g[990],
    surface: rgb(g[940], 0.62),
    'surface-solid': g[900],
    raised: rgb(g[900], 0.92),
    sunken: rgb(g[975], 0.55),
    overlay: rgb(g[900], 0.92),
    bar: rgb(g[900], 0.9),
    scrim: rgb(black, 0.5),
    hover: rgb(white, 0.07),
    pressed: rgb(white, 0.12),
    selected: rgb(azure[500], 0.22),

    fg: g[50],
    'fg-muted': g[250],
    'fg-subtle': g[350],
    'fg-disabled': g[600],

    border: rgb(white, 0.12),
    'border-subtle': rgb(white, 0.08),
    'border-strong': rgb(white, 0.18),
    'border-input': g[500],
    focus: azure[400],

    primary: rgb(g[50], 0.94),
    'primary-hover': g[50],
    'primary-active': rgb(g[200], 0.96),
    'on-primary': g[950],
    secondary: rgb(azure[500], 0.22),
    'secondary-hover': rgb(azure[500], 0.3),
    'secondary-active': rgb(azure[500], 0.38),
    'on-secondary': azure[200],
    neutral: rgb(white, 0.08),
    'neutral-hover': rgb(white, 0.12),
    'neutral-active': rgb(white, 0.05),
    'neutral-border': rgb(white, 0.14),
    'on-neutral': g[50],
    'outline-border': rgb(white, 0.18),
    'outline-hover': rgb(white, 0.07),
    'outline-active': rgb(white, 0.12),
    'on-outline': g[50],
    'ghost-hover': rgb(white, 0.07),
    'ghost-active': rgb(white, 0.12),
    'on-ghost': g[250],
    link: azure[300],
    'link-hover': azure[200],
    'danger-solid': rgb(red[600], 0.9),
    'danger-solid-hover': rgb(red[600], 0.98),
    'danger-solid-active': rgb(red[700], 0.98),
    'on-danger': white,
    'success-solid': rgb(green[600], 0.9),
    'success-solid-hover': rgb(green[600], 0.98),
    'success-solid-active': rgb(green[700], 0.98),
    'on-success': white,
    disabled: rgb(white, 0.05),
    'disabled-fg': g[600],
    'disabled-border': rgb(white, 0.08),

    success: green[300],
    'success-soft': rgb(green[300], 0.14),
    warning: amber[300],
    'warning-soft': rgb(amber[300], 0.14),
    danger: red[300],
    'danger-soft': rgb(red[300], 0.14),
    info: sky[300],
    'info-soft': rgb(sky[300], 0.14),
    brand: azure[300],
    'brand-soft': rgb(azure[500], 0.2),

    up: green[300],
    'up-soft': rgb(green[300], 0.14),
    down: red[300],
    'down-soft': rgb(red[300], 0.14),
    flat: g[350],

    'chart-1': azure[400],
    'chart-2': teal[300],
    'chart-3': amber[400],
    'chart-4': rose[300],
    'chart-5': lime[300],
    'chart-6': orange[300],
    'chart-7': violet[300],
    'chart-8': slate[300],

    ...heat(HEAT_DARK, g[800]),
    ...avatars([azure[400], teal[300], amber[400], rose[300], lime[300], violet[300]], 0.18),
    ...scene(g[990], [azure[400], teal[300], amber[400]], 'dark'),
    ...seaglass('dark'),
  },
  effects: {
    'shadow-sm': `0 2px 8px -3px ${rgb(black, 0.55)}`,
    'shadow-md': `0 10px 30px -10px ${rgb(black, 0.65)}`,
    'shadow-lg': `0 28px 64px -20px ${rgb(black, 0.75)}`,
    'shadow-inset': `inset 0 1px 2px 0 ${rgb(black, 0.5)}`,
    'glass-rim': `inset 0 1px 0 ${rgb(white, 0.14)}, inset 0 -1px 0 ${rgb(white, 0.04)}`,
    sheen: `inset 0 1px 0 ${rgb(white, 0.4)}, inset 0 10px 14px -12px ${rgb(white, 0.5)}, inset 0 -1px 0 ${rgb(black, 0.3)}`,
    highlight: rgb(white, 0.08),
    shine: rgb(g[50], 0.08),
    glare: rgb(g[50], 0.08),
    spotlight: rgb(azure[500], 0.14),
    'grid-dot': rgb(white, 0.035),
    'app-backdrop': `radial-gradient(55% 45% at 8% 0%, ${glassPeakDark}, transparent 70%), radial-gradient(45% 40% at 96% 100%, ${rgb(teal[700], 0.18)}, transparent 70%)`,
    // a dark page shows every bit of white: a quiet edge here, not the light skin's bright one
    'lens-light': rgb(white, 0.3),
    'lens-shade': black,
  },
  backdropPeak: glassPeakDark,
};

/* ---- GLASS · light ----------------------------------------------------------------- */
const glassPeakLight = rgb(azure[500], 0.1);
const glassLight: Theme = {
  roles: {
    canvas: mist,
    surface: rgb(white, 0.72),
    'surface-solid': white,
    raised: rgb(white, 0.9),
    sunken: rgb(white, 0.55),
    overlay: rgb(white, 0.92),
    bar: rgb(white, 0.88),
    scrim: rgb(g[950], 0.3),
    hover: rgb(g[950], 0.05),
    pressed: rgb(g[950], 0.09),
    selected: rgb(azure[500], 0.12),

    fg: g[950],
    'fg-muted': g[700],
    'fg-subtle': g[600],
    'fg-disabled': g[400],

    border: rgb(g[950], 0.12),
    'border-subtle': rgb(g[950], 0.07),
    'border-strong': rgb(g[950], 0.16),
    'border-input': g[500],
    focus: azure[600],

    primary: rgb(g[900], 0.92),
    'primary-hover': g[900],
    'primary-active': g[950],
    'on-primary': g[50],
    secondary: rgb(azure[500], 0.1),
    'secondary-hover': rgb(azure[500], 0.16),
    'secondary-active': rgb(azure[500], 0.2),
    'on-secondary': azure[700],
    neutral: rgb(white, 0.75),
    'neutral-hover': rgb(white, 0.95),
    'neutral-active': rgb(g[100], 0.9),
    'neutral-border': rgb(g[950], 0.12),
    'on-neutral': g[950],
    'outline-border': rgb(g[950], 0.16),
    'outline-hover': rgb(g[950], 0.05),
    'outline-active': rgb(g[950], 0.09),
    'on-outline': g[950],
    'ghost-hover': rgb(g[950], 0.05),
    'ghost-active': rgb(g[950], 0.09),
    'on-ghost': g[700],
    link: azure[700],
    'link-hover': azure[800],
    'danger-solid': rgb(red[600], 0.94),
    'danger-solid-hover': red[600],
    'danger-solid-active': red[700],
    'on-danger': white,
    'success-solid': rgb(green[700], 0.94),
    'success-solid-hover': green[700],
    'success-solid-active': green[800],
    'on-success': white,
    disabled: rgb(g[950], 0.04),
    'disabled-fg': g[400],
    'disabled-border': rgb(g[950], 0.08),

    success: green[750],
    'success-soft': rgb(green[600], 0.08),
    warning: amber[800],
    'warning-soft': rgb(amber[400], 0.1),
    danger: red[700],
    'danger-soft': rgb(red[600], 0.07),
    info: sky[800],
    'info-soft': rgb(sky[400], 0.1),
    brand: azure[700],
    'brand-soft': rgb(azure[500], 0.1),

    up: green[750],
    'up-soft': rgb(green[600], 0.08),
    down: red[700],
    'down-soft': rgb(red[600], 0.07),
    flat: g[600],

    'chart-1': azure[600],
    'chart-2': teal[700],
    'chart-3': amber[700],
    'chart-4': rose[700],
    'chart-5': lime[700],
    'chart-6': orange[700],
    'chart-7': violet[700],
    'chart-8': slate[700],

    ...heat(HEAT_LIGHT, g[150]),
    ...avatars([azure[600], teal[700], amber[700], rose[700], lime[700], violet[700]], 0.1),
    ...scene(mist, [azure[600], teal[700], amber[700]], 'light'),
    ...seaglass('light'),
  },
  effects: {
    'shadow-sm': `0 2px 8px -3px ${rgb(g[950], 0.12)}`,
    'shadow-md': `0 10px 30px -12px ${rgb(g[950], 0.16)}`,
    'shadow-lg': `0 28px 64px -22px ${rgb(g[950], 0.22)}`,
    'shadow-inset': `inset 0 1px 2px 0 ${rgb(g[950], 0.12)}`,
    'glass-rim': `inset 0 1px 0 ${rgb(white, 0.9)}, inset 0 -1px 0 ${rgb(g[950], 0.04)}`,
    sheen: `inset 0 1px 0 ${rgb(white, 0.35)}, inset 0 10px 14px -12px ${rgb(white, 0.4)}, inset 0 -1px 0 ${rgb(black, 0.25)}`,
    highlight: rgb(g[950], 0.06),
    shine: rgb(g[950], 0.06),
    glare: rgb(g[950], 0.06),
    spotlight: rgb(azure[500], 0.1),
    'grid-dot': rgb(g[950], 0.05),
    'app-backdrop': `radial-gradient(55% 45% at 8% 0%, ${glassPeakLight}, transparent 70%), radial-gradient(45% 40% at 96% 100%, ${rgb(teal[700], 0.08)}, transparent 70%)`,
    // a crisp edge, not a glowing one: full white on every rim reads as a halo
    'lens-light': rgb(white, 0.7),
    'lens-shade': black,
  },
  backdropPeak: glassPeakLight,
};

export const THEMES: Record<ThemeKey, Theme> = {
  'enterprise-dark': enterpriseDark,
  'enterprise-light': enterpriseLight,
  'glass-dark': glassDark,
  'glass-light': glassLight,
};

/** `var(--role)`: how JS (charts, shaders, inline SVG) refers to a role. Never a value. */
export const cssVar = (name: Role | Effect): string => `var(--${name})`;

import { contrast, flatten } from './colour.ts';
import { type Role, THEMES, type ThemeKey } from './roles.ts';

/* The contrast gate, run on the role table itself (no browser): every pair a component can
   draw is measured in every skin × mode, against the WORST case under translucent surfaces
   (glass: the page canvas plus the backdrop wash at its peak, blur ignored). Disabled roles
   are exempt (WCAG 1.4.3 excludes inactive components).

   Text 4.5:1 (1.4.3). Input boundaries, the focus colour and chart series 3:1 (1.4.11). */

export interface Failure {
  theme: ThemeKey;
  pair: string;
  ratio: number;
  need: number;
}

type Check = readonly [
  fg: Role,
  on: readonly Role[],
  need: number,
  /** Only measured in this skin (the glass skin is the one that draws the page backdrops). */
  skin?: 'glass',
];

/* What sits on what. `on` is a stack painted over the page, bottom first after the canvas:
   ['surface', 'primary'] = a primary button on a card. */
const CHECKS: readonly Check[] = [
  // text on every surface
  ...(['fg', 'fg-muted', 'fg-subtle'] as const).flatMap((t) =>
    (['canvas', 'surface', 'raised', 'sunken', 'overlay', 'bar'] as const).map(
      (s) => [t, [s], 4.5] as const,
    ),
  ),
  // text on interaction washes (a hovered / pressed / selected row or item)
  ...(['hover', 'pressed', 'selected'] as const).map((w) => ['fg', ['surface', w], 4.5] as const),
  ['fg-muted', ['surface', 'hover'], 4.5],
  // links and brand text
  ['link', ['canvas'], 4.5],
  ['link', ['surface'], 4.5],
  ['link-hover', ['surface'], 4.5],
  ['brand', ['surface'], 4.5],
  ['brand', ['surface', 'brand-soft'], 4.5],
  ['brand', ['surface', 'selected'], 4.5],
  // status and market text, plain and on its own wash
  ...(['success', 'warning', 'danger', 'info', 'up', 'down'] as const).flatMap((s) => [
    [s, ['canvas'], 4.5] as const,
    [s, ['surface'], 4.5] as const,
    [s, ['surface', `${s}-soft` as Role], 4.5] as const,
  ]),
  ['flat', ['surface'], 4.5],
  // every button level, at rest, hovered and pressed, on a card
  ...(['primary', 'primary-hover', 'primary-active'] as const).map(
    (b) => ['on-primary', ['surface', b], 4.5] as const,
  ),
  ...(['secondary', 'secondary-hover', 'secondary-active'] as const).map(
    (b) => ['on-secondary', ['surface', b], 4.5] as const,
  ),
  ...(['neutral', 'neutral-hover', 'neutral-active'] as const).map(
    (b) => ['on-neutral', ['surface', b], 4.5] as const,
  ),
  ['on-outline', ['surface'], 4.5],
  ...(['outline-hover', 'outline-active'] as const).map(
    (b) => ['on-outline', ['surface', b], 4.5] as const,
  ),
  ['on-ghost', ['surface'], 4.5],
  ...(['ghost-hover', 'ghost-active'] as const).map(
    (b) => ['on-ghost', ['surface', b], 4.5] as const,
  ),
  ...(['danger-solid', 'danger-solid-hover', 'danger-solid-active'] as const).map(
    (b) => ['on-danger', ['surface', b], 4.5] as const,
  ),
  ...(['success-solid', 'success-solid-hover', 'success-solid-active'] as const).map(
    (b) => ['on-success', ['surface', b], 4.5] as const,
  ),
  // initials on an avatar
  ...([1, 2, 3, 4, 5, 6] as const).map(
    (n) => ['fg', ['surface-solid', `avatar-${n}` as Role], 4.5] as const,
  ),
  // boundaries and the focus colour
  ['border-input', ['canvas'], 3],
  ['border-input', ['surface'], 3],
  ['focus', ['canvas'], 3],
  ['focus', ['surface'], 3],
  // text straight on the page over the static backdrop washes, and over the busiest frame of
  // the shader scene (its palette at full strength, then the page-coloured scrim)
  // (the backdrops are the glass skin's: enterprise's smallest, subtlest text is not held to them)
  ...(['fg', 'fg-muted', 'fg-subtle'] as const).flatMap((t) => {
    const skin = t === 'fg-subtle' ? ('glass' as const) : undefined;
    return [
      ...([1, 2, 3] as const).map(
        (n) => [t, ['canvas', `backdrop-${n}` as Role], 4.5, skin] as const,
      ),
      ...(['shader-a', 'shader-b', 'shader-c'] as const).map(
        (c) => [t, ['canvas', c, 'shader-scrim'], 4.5, skin] as const,
      ),
    ];
  }),
  // sea glass: text on the paper and on every glass tint (the flat fallback fill)
  ...(['fg', 'fg-muted'] as const).flatMap((t) => [
    [t, ['seaglass-paper'], 4.5] as const,
    ...([0, 1, 2, 3, 4, 5, 6] as const).map(
      (n) => [t, ['seaglass-paper', `seaglass-${n}` as Role], 4.5] as const,
    ),
  ]),
  ...(['link', 'link-hover'] as const).map(
    (t) => [t, ['seaglass-paper', 'seaglass-0'], 4.5] as const,
  ),
  // the heat ramp's four filled steps (heat-0 is an empty cell, outlined)
  ...([1, 2, 3, 4] as const).flatMap((n) => [
    [`heat-${n}` as Role, ['canvas'], 3] as const,
    [`heat-${n}` as Role, ['surface'], 3] as const,
  ]),
  // chart series
  ...([1, 2, 3, 4, 5, 6, 7, 8] as const).flatMap((n) => [
    [`chart-${n}` as Role, ['canvas'], 3] as const,
    [`chart-${n}` as Role, ['surface'], 3] as const,
  ]),
];

export function runGate(): Failure[] {
  const failures: Failure[] = [];
  for (const [key, theme] of Object.entries(THEMES) as [ThemeKey, (typeof THEMES)[ThemeKey]][]) {
    const page = [theme.roles.canvas, theme.backdropPeak];
    for (const [fg, on, need, only] of CHECKS) {
      if (only && !key.startsWith(only)) continue;
      const bg = flatten([...page, ...on.map((r) => theme.roles[r])]);
      const text = flatten([bg, theme.roles[fg]]);
      const ratio = contrast(text, bg);
      if (ratio < need) {
        failures.push({ theme: key, pair: `${fg} on ${on.join(' > ')}`, ratio, need });
      }
    }
  }
  return failures;
}

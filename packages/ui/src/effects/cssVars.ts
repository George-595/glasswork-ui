import type { CSSProperties } from 'react';

/* Merge custom properties into a style object. The effects pass their
   colours and timings to effects.css this way, so the CSS stays tokens-only
   and the TSX carries no colour literals. */
export type CssVars = Record<`--${string}`, string | number | undefined>;

export function withVars(style: CSSProperties | undefined, vars: CssVars): CSSProperties {
  return { ...style, ...vars };
}

/* @apps/colors — every colour in apps/, as roles (see README.md).

   CSS:  import '@apps/colors/colors.css' and '@apps/colors/theme.css' (the kit does it).
   JS:   ROLES, THEMES and cssVar('chart-1') for code that hands colours to a canvas or SVG;
         it passes var(--role), never a value, so skin and mode keep working. */
export { contrast, flatten, luminance, parse, rgb } from './colour.ts';
export { colorsCss, themeCss } from './css.ts';
export { faviconSvg } from './favicon.ts';
export { type Failure, runGate } from './gate.ts';
export {
  cssVar,
  EFFECTS,
  type Effect,
  MODES,
  type Mode,
  ROLES,
  type Role,
  SKINS,
  type Skin,
  THEMES,
  type Theme,
  type ThemeKey,
} from './roles.ts';

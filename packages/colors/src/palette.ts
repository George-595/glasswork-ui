/* The palette: every colour value in apps/ lives in this file. Nothing else may write one
   (no hex, rgb(), hsl(), oklch() or color-mix() anywhere outside packages/colors), and the
   no-colour check fails the build if anything does.

   The look (George, Oct 2026: "indigo screams vibe coded … professional and ultra modern"):
   GRAPHITE neutrals carry almost everything. The main action is ink, not a hue: near-black
   in light mode, near-white in dark. One restrained AZURE accent marks links, focus,
   selection and the secondary level, and nothing else. Status and chart colours are
   deep and desaturated so they read as information, not decoration.

   Swatches are named for what they ARE (a hue and a step, 50 lightest … 950 darkest);
   roles.ts says where each is used. `rgb(hex, alpha)` from colour.ts writes the translucent
   forms (washes, scrims, glass fills) from these swatches. */

/* ---- Graphite: true neutral with the faintest cool cast ---------------------------- */
export const graphite = {
  0: '#ffffff',
  25: '#fcfcfd',
  50: '#fafafa',
  75: '#f6f6f7',
  100: '#f4f4f5',
  150: '#ececee',
  200: '#e4e4e7',
  250: '#dcdce0',
  300: '#d4d4d8',
  350: '#b4b4bb',
  400: '#a1a1aa',
  450: '#8e8e96',
  500: '#71717a',
  550: '#6e6e78',
  600: '#5f5f68',
  650: '#52525b',
  700: '#3f3f46',
  750: '#2e2e33',
  800: '#27272a',
  825: '#232326',
  850: '#1f1f23',
  875: '#1c1c1f',
  900: '#18181b',
  925: '#141416',
  940: '#111113',
  950: '#0a0a0b',
  975: '#070708',
  990: '#07090c', // the glass dark page: graphite with a cold cast under the azure wash
} as const;

/* The glass light page: a cool mist, so white glass reads against it. */
export const mist = '#eef0f3';

/* ---- Azure: the one accent ---------------------------------------------------------- */
export const azure = {
  200: '#a9d0ff',
  300: '#7cb8ff',
  400: '#4a9cff',
  500: '#1f7ff0',
  600: '#0b66d6',
  700: '#0a52ad',
  800: '#0b4189',
} as const;

/* ---- Status and market --------------------------------------------------------------- */
export const green = {
  300: '#4ade80',
  400: '#34c27a',
  600: '#15803d',
  700: '#166534',
  750: '#13572d',
  800: '#14532d',
} as const;

export const red = {
  300: '#ff8a8f',
  400: '#ff6369',
  600: '#c8232c',
  700: '#b01e27',
  800: '#961a22',
} as const;

export const amber = {
  300: '#fbbf3c',
  400: '#f5a524',
  700: '#9a5b00',
  800: '#7c4a00',
} as const;

export const sky = {
  300: '#5cc8f5',
  400: '#38bdf8',
  700: '#0369a1',
  800: '#075985',
} as const;

/* ---- Data: a calm categorical set (no rainbow, no purple-first) --------------------- */
export const teal = { 300: '#2dd4bf', 700: '#0f766e' } as const;
export const rose = { 300: '#f08a9c', 700: '#be123c' } as const;
export const lime = { 300: '#93c65e', 700: '#4d7c0f' } as const;
export const orange = { 300: '#ef9a5a', 700: '#c2410c' } as const;
export const violet = { 300: '#b9a4f5', 700: '#6d4fc2' } as const;
export const slate = { 300: '#94a3b8', 700: '#526175' } as const;

/* ---- Sea glass: frosted glass pebbles on paper (the SeaGlass material) -------------------
   Light: sunlit paper and six pale tumbled-glass tints, the sun and the sky that light them.
   Dark: moonlit paper, the same six hues as deep glass, a cool moon and a night sky.
   The tints were drawn from Blueemi/sea-glass-demo's "Original" set (MIT). */
export const seaGlass = {
  light: {
    paper: '#f3f2ee',
    sun: '#fff9f0',
    sky: '#ebf0ff',
    clear: '#eaeeee',
    coral: '#ffc2ba',
    orchid: '#f3c8ff',
    periwinkle: '#c6d3ff',
    aqua: '#b2e9ec',
    seafoam: '#c6efc4',
    amber: '#ffd9a3',
  },
  dark: {
    paper: '#1c1d21',
    sun: '#bcc6e8',
    sky: '#3a4258',
    clear: '#232a2d',
    coral: '#6e211b',
    orchid: '#5b2373',
    periwinkle: '#243880',
    aqua: '#0e4c55',
    seafoam: '#154a27',
    amber: '#5f3e06',
  },
} as const;

/* ---- Absolutes ---------------------------------------------------------------------- */
export const white = '#ffffff';
export const black = '#000000';

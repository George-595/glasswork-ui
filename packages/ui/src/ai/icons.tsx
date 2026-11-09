import type { ReactNode, SVGProps } from 'react';

/* The few glyphs the AI primitives need that the kit's Icon set lacks. Decorative: the
   control that holds one carries the accessible name. */
interface GlyphProps extends Omit<SVGProps<SVGSVGElement>, 'children'> {
  size?: number;
}

function Glyph({ size = 16, children, ...rest }: GlyphProps & { children: ReactNode }) {
  return (
    <svg
      xmlns="http://www.w3.org/2000/svg"
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={2}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden="true"
      focusable="false"
      {...rest}
    >
      {children}
    </svg>
  );
}

export function CopyGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="9" width="12" height="12" rx="2" />
      <path d="M5 15H4a1 1 0 0 1-1-1V4a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v1" />
    </Glyph>
  );
}

export function StopGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="6" y="6" width="12" height="12" rx="2" fill="currentColor" />
    </Glyph>
  );
}

export function SpinnerGlyph(props: GlyphProps) {
  return (
    <Glyph {...props} strokeWidth={3}>
      <circle cx="12" cy="12" r="9" className="opacity-25" />
      <path d="M21 12a9 9 0 0 0-9-9" />
    </Glyph>
  );
}

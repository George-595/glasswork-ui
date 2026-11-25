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

export function PaperclipGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <path d="m21.4 11.1-8.5 8.5a5.5 5.5 0 0 1-7.8-7.8l8.5-8.5a3.7 3.7 0 0 1 5.2 5.2l-8.5 8.5a1.8 1.8 0 0 1-2.6-2.6l7.8-7.8" />
    </Glyph>
  );
}

export function MicGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <rect x="9" y="2" width="6" height="12" rx="3" />
      <path d="M5 10v1a7 7 0 0 0 14 0v-1M12 18v4" />
    </Glyph>
  );
}

export function BranchGlyph(props: GlyphProps) {
  return (
    <Glyph {...props}>
      <circle cx="6" cy="5" r="2" />
      <circle cx="6" cy="19" r="2" />
      <circle cx="18" cy="8" r="2" />
      <path d="M6 7v10M18 10a6 6 0 0 1-6 6H8" />
    </Glyph>
  );
}

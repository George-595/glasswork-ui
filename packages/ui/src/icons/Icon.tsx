/* Icon — inline SVG icons, replacing lucide-react (no runtime dependency).
   Path data follows Lucide (https://lucide.dev, ISC licence — see
   THIRD_PARTY_NOTICES.md): 24x24 grid, 2px round strokes, currentColor.

   Decorative by default (aria-hidden). Pass `label` when the icon is the only
   content that names something; it then renders as role="img". */
import type { ReactElement, SVGProps } from 'react';

const ICONS = {
  check: [<path key="a" d="M20 6 9 17l-5-5" />],
  x: [<path key="a" d="M18 6 6 18" />, <path key="b" d="m6 6 12 12" />],
  'chevron-down': [<path key="a" d="m6 9 6 6 6-6" />],
  'chevron-up': [<path key="a" d="m18 15-6-6-6 6" />],
  'chevron-left': [<path key="a" d="m15 18-6-6 6-6" />],
  'chevron-right': [<path key="a" d="m9 18 6-6-6-6" />],
  'arrow-up': [<path key="a" d="m5 12 7-7 7 7" />, <path key="b" d="M12 19V5" />],
  'arrow-down': [<path key="a" d="M12 5v14" />, <path key="b" d="m19 12-7 7-7-7" />],
  sun: [
    <circle key="a" cx="12" cy="12" r="4" />,
    <path
      key="b"
      d="M12 2v2M12 20v2m-7.07-17.07 1.41 1.41m11.32 11.32 1.41 1.41M2 12h2m16 0h2M6.34 17.66l-1.41 1.41M19.07 4.93l-1.41 1.41"
    />,
  ],
  moon: [<path key="a" d="M12 3a6 6 0 0 0 9 9 9 9 0 1 1-9-9Z" />],
  home: [
    <path key="a" d="M15 21v-8a1 1 0 0 0-1-1h-4a1 1 0 0 0-1 1v8" />,
    <path
      key="b"
      d="M3 10a2 2 0 0 1 .709-1.528l7-6a2 2 0 0 1 2.582 0l7 6A2 2 0 0 1 21 10v9a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"
    />,
  ],
  table: [
    <rect key="a" x="3" y="3" width="18" height="18" rx="2" />,
    <path key="b" d="M3 9h18M3 15h18M12 3v18" />,
  ],
  chart: [<path key="a" d="M3 3v16a2 2 0 0 0 2 2h16" />, <path key="b" d="m19 9-5 5-4-4-3 3" />],
  wrench: [
    <path
      key="a"
      d="M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z"
    />,
  ],
  shield: [
    <path
      key="a"
      d="M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z"
    />,
  ],
  user: [
    <path key="a" d="M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2" />,
    <circle key="b" cx="12" cy="7" r="4" />,
  ],
  menu: [<path key="a" d="M4 6h16M4 12h16M4 18h16" />],
  search: [<circle key="a" cx="11" cy="11" r="8" />, <path key="b" d="m21 21-4.3-4.3" />],
  database: [
    <ellipse key="a" cx="12" cy="5" rx="9" ry="3" />,
    <path key="b" d="M3 5v14a9 3 0 0 0 18 0V5" />,
    <path key="c" d="M3 12a9 3 0 0 0 18 0" />,
  ],
  alert: [
    <path key="a" d="m21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3" />,
    <path key="b" d="M12 9v4M12 17h.01" />,
  ],
  pin: [
    <path key="a" d="M12 17v5" />,
    <path
      key="b"
      d="M9 10.76a2 2 0 0 1-1.11 1.79l-1.78.9A2 2 0 0 0 5 15.24V16a1 1 0 0 0 1 1h12a1 1 0 0 0 1-1v-.76a2 2 0 0 0-1.11-1.79l-1.78-.9A2 2 0 0 1 15 10.76V7a1 1 0 0 1 1-1 2 2 0 0 0 0-4H8a2 2 0 0 0 0 4 1 1 0 0 1 1 1z"
    />,
  ],
  message: [<path key="a" d="M21 15a2 2 0 0 1-2 2H7l-4 4V5a2 2 0 0 1 2-2h14a2 2 0 0 1 2 2z" />],
  plus: [<path key="a" d="M5 12h14M12 5v14" />],
  'arrow-up-down': [
    <path key="a" d="m21 16-4 4-4-4" />,
    <path key="b" d="M17 20V4" />,
    <path key="c" d="m3 8 4-4 4 4" />,
    <path key="d" d="M7 4v16" />,
  ],
  'panel-left': [
    <rect key="a" x="3" y="3" width="18" height="18" rx="2" />,
    <path key="b" d="M9 3v18" />,
  ],
  settings: [
    <path
      key="a"
      d="M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z"
    />,
    <circle key="b" cx="12" cy="12" r="3" />,
  ],
  'log-out': [
    <path key="a" d="M9 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h4" />,
    <path key="b" d="m16 17 5-5-5-5" />,
    <path key="c" d="M21 12H9" />,
  ],
  users: [
    <path key="a" d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2" />,
    <circle key="b" cx="9" cy="7" r="4" />,
    <path key="c" d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75" />,
  ],
  'file-text': [
    <path key="a" d="M15 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V7Z" />,
    <path key="b" d="M14 2v4a2 2 0 0 0 2 2h4M10 9H8M16 13H8M16 17H8" />,
  ],
  more: [
    <circle key="a" cx="12" cy="12" r="1" />,
    <circle key="b" cx="19" cy="12" r="1" />,
    <circle key="c" cx="5" cy="12" r="1" />,
  ],
  sparkles: [
    <path key="a" d="M11 3l2 6 6 2-6 2-2 6-2-6-6-2 6-2z" />,
    <path key="b" d="M19 3v4M17 5h4" />,
  ],
  mail: [
    <rect key="a" x="2" y="4" width="20" height="16" rx="2" />,
    <path key="b" d="m22 7-8.991 5.727a2 2 0 0 1-2.009 0L2 7" />,
  ],
  clock: [<circle key="a" cx="12" cy="12" r="10" />, <path key="b" d="M12 6v6l4 2" />],
  bell: [
    <path key="a" d="M10.268 21a2 2 0 0 0 3.464 0" />,
    <path
      key="b"
      d="M3.262 15.326A1 1 0 0 0 4 17h16a1 1 0 0 0 .74-1.673C19.41 13.956 18 12.499 18 8A6 6 0 0 0 6 8c0 4.499-1.411 5.956-2.738 7.326"
    />,
  ],
  monitor: [
    <rect key="a" x="2" y="3" width="20" height="14" rx="2" />,
    <path key="b" d="M8 21h8M12 17v4" />,
  ],
  info: [<circle key="a" cx="12" cy="12" r="10" />, <path key="b" d="M12 16v-4M12 8h.01" />],
  minus: [<path key="a" d="M5 12h14" />],
  /* The tab bar, capture flows and inventory actions. */
  camera: [
    <path
      key="a"
      d="M14.5 4h-5L7 7H4a2 2 0 0 0-2 2v9a2 2 0 0 0 2 2h16a2 2 0 0 0 2-2V9a2 2 0 0 0-2-2h-3l-2.5-3z"
    />,
    <circle key="b" cx="12" cy="13" r="3" />,
  ],
  image: [
    <rect key="a" x="3" y="3" width="18" height="18" rx="2" />,
    <circle key="b" cx="9" cy="9" r="2" />,
    <path key="c" d="m21 15-3.086-3.086a2 2 0 0 0-2.828 0L6 21" />,
  ],
  package: [
    <path
      key="a"
      d="M11 21.73a2 2 0 0 0 2 0l7-4A2 2 0 0 0 21 16V8a2 2 0 0 0-1-1.73l-7-4a2 2 0 0 0-2 0l-7 4A2 2 0 0 0 3 8v8a2 2 0 0 0 1 1.73z"
    />,
    <path key="b" d="M12 22V12" />,
    <path key="c" d="m3.3 7 7.703 4.734a2 2 0 0 0 1.994 0L20.7 7" />,
    <path key="d" d="m7.5 4.27 9 5.15" />,
  ],
  bed: [
    <path key="a" d="M2 4v16" />,
    <path key="b" d="M2 8h18a2 2 0 0 1 2 2v10" />,
    <path key="c" d="M2 17h20" />,
    <path key="d" d="M6 8v9" />,
  ],
  gift: [
    <rect key="a" x="3" y="8" width="18" height="4" rx="1" />,
    <path key="b" d="M12 8v13" />,
    <path key="c" d="M19 12v7a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2v-7" />,
    <path
      key="d"
      d="M7.5 8a2.5 2.5 0 0 1 0-5A4.8 8 0 0 1 12 8a4.8 8 0 0 1 4.5-5 2.5 2.5 0 0 1 0 5"
    />,
  ],
  truck: [
    <path key="a" d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2" />,
    <path key="b" d="M15 18H9" />,
    <path
      key="c"
      d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"
    />,
    <circle key="d" cx="17" cy="18" r="2" />,
    <circle key="e" cx="7" cy="18" r="2" />,
  ],
  trash: [
    <path key="a" d="M3 6h18" />,
    <path key="b" d="M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6" />,
    <path key="c" d="M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2" />,
    <path key="d" d="M10 11v6M14 11v6" />,
  ],
  'map-pin': [
    <path
      key="a"
      d="M20 10c0 4.993-5.539 10.193-7.399 11.799a1 1 0 0 1-1.202 0C9.539 20.193 4 14.993 4 10a8 8 0 0 1 16 0"
    />,
    <circle key="b" cx="12" cy="10" r="3" />,
  ],
  share: [
    <circle key="a" cx="18" cy="5" r="3" />,
    <circle key="b" cx="6" cy="12" r="3" />,
    <circle key="c" cx="18" cy="19" r="3" />,
    <path key="d" d="m8.59 13.51 6.83 3.98M15.41 6.51l-6.82 3.98" />,
  ],
  undo: [
    <path key="a" d="M9 14 4 9l5-5" />,
    <path key="b" d="M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11" />,
  ],
  'rotate-ccw': [
    <path key="a" d="M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8" />,
    <path key="b" d="M3 3v5h5" />,
  ],
  scan: [
    <path key="a" d="M3 7V5a2 2 0 0 1 2-2h2M17 3h2a2 2 0 0 1 2 2v2" />,
    <path key="b" d="M21 17v2a2 2 0 0 1-2 2h-2M7 21H5a2 2 0 0 1-2-2v-2" />,
  ],
  tag: [
    <path
      key="a"
      d="M12.586 2.586A2 2 0 0 0 11.172 2H4a2 2 0 0 0-2 2v7.172a2 2 0 0 0 .586 1.414l8.704 8.704a2.426 2.426 0 0 0 3.42 0l6.58-6.58a2.426 2.426 0 0 0 0-3.42z"
    />,
    <circle key="b" cx="7.5" cy="7.5" r=".5" fill="currentColor" />,
  ],
  download: [
    <path key="a" d="M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" />,
    <path key="b" d="m7 10 5 5 5-5M12 15V3" />,
  ],
  filter: [<path key="a" d="M22 3H2l8 9.46V19l4 2v-8.54z" />],
  copy: [
    <rect key="a" x="8" y="8" width="14" height="14" rx="2" />,
    <path key="b" d="M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2" />,
  ],
  'external-link': [
    <path key="a" d="M15 3h6v6M10 14 21 3" />,
    <path key="b" d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" />,
  ],
  'wifi-off': [
    <path key="a" d="M12 20h.01M8.5 16.429a5 5 0 0 1 7 0M5 12.859a10 10 0 0 1 5.17-2.69" />,
    <path key="b" d="M19 12.859a10 10 0 0 0-2.007-1.523M2 8.82a15 15 0 0 1 4.177-2.643" />,
    <path key="c" d="M22 8.82a15 15 0 0 0-11.288-3.764M2 2l20 20" />,
  ],
  eye: [
    <path
      key="a"
      d="M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0"
    />,
    <circle key="b" cx="12" cy="12" r="3" />,
  ],
  'eye-off': [
    <path
      key="a"
      d="M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49"
    />,
    <path key="b" d="M14.084 14.158a3 3 0 0 1-4.242-4.242" />,
    <path
      key="c"
      d="M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143"
    />,
    <path key="d" d="m2 2 20 20" />,
  ],
} satisfies Record<string, ReactElement[]>;

export type IconName = keyof typeof ICONS;
export const ICON_NAMES = Object.keys(ICONS) as IconName[];

export interface IconProps extends Omit<SVGProps<SVGSVGElement>, 'name'> {
  name: IconName;
  /** Pixel size of the square icon. */
  size?: number;
  /** Accessible name. Omit for decorative icons next to visible text. */
  label?: string;
}

export function Icon({ name, size = 16, label, className, ...props }: IconProps) {
  const a11y = label
    ? { role: 'img' as const, 'aria-label': label }
    : { 'aria-hidden': true as const, focusable: 'false' as const };
  return (
    // biome-ignore lint/a11y/noSvgWithoutTitle: named by aria-label (role="img") when labelled, else aria-hidden
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
      className={className ? `ui-icon ${className}` : 'ui-icon'}
      {...a11y}
      {...props}
    >
      {ICONS[name]}
    </svg>
  );
}

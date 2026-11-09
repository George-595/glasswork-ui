/* describeUserAgent — a sign-in session's `User-Agent` header as "Chrome on macOS".
   A small, honest parser: the handful of browsers and systems people actually use, in the
   order their tokens must be tested (Edge and Opera say "Chrome", Chrome says "Safari").
   Anything it does not know becomes "Unknown browser" / "Unknown system"; nothing throws. */
export interface DescribedAgent {
  browser: string;
  os: string;
  /** For the icon. */
  kind: 'phone' | 'tablet' | 'computer';
  /** "Chrome on macOS"; "Unknown device" when the string says nothing. */
  label: string;
}

const BROWSERS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:Edg|EdgA|EdgiOS|Edge)\//, 'Edge'],
  [/\b(?:OPR|Opera)\//, 'Opera'],
  [/\bSamsungBrowser\//, 'Samsung Internet'],
  [/\b(?:Firefox|FxiOS)\//, 'Firefox'],
  [/\b(?:Chrome|HeadlessChrome|CriOS|Chromium)\//, 'Chrome'],
  [/\bSafari\//, 'Safari'],
  [/^curl\//i, 'curl'],
];

const SYSTEMS: ReadonlyArray<readonly [RegExp, string]> = [
  [/\b(?:iPhone|iPod)\b/, 'iOS'],
  [/\biPad\b/, 'iPadOS'],
  [/\bAndroid\b/, 'Android'],
  [/\bCrOS\b/, 'ChromeOS'],
  [/\bWindows\b/, 'Windows'],
  [/\b(?:Macintosh|Mac OS X)\b/, 'macOS'],
  [/\b(?:Linux|X11)\b/, 'Linux'],
];

export function describeUserAgent(userAgent: string | null | undefined): DescribedAgent {
  const ua = (userAgent ?? '').trim();
  const browser = BROWSERS.find(([re]) => re.test(ua))?.[1];
  const os = SYSTEMS.find(([re]) => re.test(ua))?.[1];
  const kind: DescribedAgent['kind'] =
    os === 'iOS' || (os === 'Android' && /\bMobile\b/.test(ua))
      ? 'phone'
      : os === 'iPadOS' || os === 'Android'
        ? 'tablet'
        : 'computer';
  const label =
    browser && os
      ? `${browser} on ${os}`
      : browser
        ? browser
        : os
          ? `Unknown browser on ${os}`
          : 'Unknown device';
  return { browser: browser ?? 'Unknown browser', os: os ?? 'Unknown system', kind, label };
}

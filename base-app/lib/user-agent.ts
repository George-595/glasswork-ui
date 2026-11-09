/* describeUserAgent — a User-Agent header as "Chrome on macOS", for the server's "new sign-in"
   notice. The kit has the same parser for the sessions list (packages/ui/src/account/user-agent.ts):
   the server may not import the kit, so the two are kept in step by hand and by the same cases in
   their tests. Browsers are tested from most to least specific (Edge and Opera also say "Chrome",
   Chrome also says "Safari"). Unknown strings give "Unknown device"; nothing throws. */
export interface DescribedAgent {
  browser: string;
  os: string;
  /** "Chrome on macOS", "Chrome", "Unknown browser on Linux" or "Unknown device". */
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
  const label =
    browser && os
      ? `${browser} on ${os}`
      : browser
        ? browser
        : os
          ? `Unknown browser on ${os}`
          : 'Unknown device';
  return { browser: browser ?? 'Unknown browser', os: os ?? 'Unknown system', label };
}

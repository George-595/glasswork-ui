import { createHash } from 'node:crypto';

/* The browser-facing security headers of the app shell, in one place. Two hosts send them and
   must agree:
   - Docker / `npm start`: static.ts adds them to index.html;
   - Vercel: its CDN serves dist/, so they live in vercel.json `headers`, which is GENERATED
     from this file (`node scripts/vercel-headers.mjs --write`) and proved equal by
     `npm run check:headers` and security-headers.test.ts.

   The one moving part is the inline theme script in index.html (it sets light/dark and the
   skin before first paint). `script-src 'self'` alone would block it, so its sha256 is part of
   the policy. static.ts computes the hash from the index.html it actually serves; vercel.json
   carries it, and the check fails when index.html and vercel.json drift apart. */

/** sha256 CSP source ('sha256-...') of every inline <script> in `html`. */
export function inlineScriptHashes(html: string): string[] {
  const hashes: string[] = [];
  for (const m of html.matchAll(/<script\b([^>]*)>([\s\S]*?)<\/script>/gi)) {
    const attrs = m[1] ?? '';
    if (/\bsrc\s*=/i.test(attrs)) continue;
    const digest = createHash('sha256')
      .update(m[2] ?? '', 'utf8')
      .digest('base64');
    hashes.push(`'sha256-${digest}'`);
  }
  return hashes.toSorted();
}

/** The policy. `blob:` images are the previews of the photo just taken (URL.createObjectURL). */
export function contentSecurityPolicy(scriptHashes: readonly string[] = []): string {
  return [
    "default-src 'self'",
    "img-src 'self' data: blob:",
    "style-src 'self' 'unsafe-inline'",
    `script-src ${["'self'", ...scriptHashes].join(' ')}`,
    "connect-src 'self'",
    "manifest-src 'self'",
    "object-src 'none'",
    "base-uri 'self'",
    "form-action 'self'",
    "frame-ancestors 'none'",
  ].join('; ');
}

/** Camera for taking a photo and location for tagging a capture; no microphone. */
export const PERMISSIONS_POLICY = 'camera=(self), geolocation=(self), microphone=()';

/** One year. Only sent where the app is behind TLS (never on plain-http development). */
export const HSTS = 'max-age=31536000';

/** The headers for an HTML page, names lower-case. */
export function securityHeaders(opts: {
  scriptHashes?: readonly string[];
  /** Send Strict-Transport-Security (the host is behind TLS: cookieSecure). */
  hsts?: boolean;
}): Record<string, string> {
  return {
    'content-security-policy': contentSecurityPolicy(opts.scriptHashes),
    'x-frame-options': 'DENY',
    'referrer-policy': 'no-referrer',
    'x-content-type-options': 'nosniff',
    'permissions-policy': PERMISSIONS_POLICY,
    ...(opts.hsts ? { 'strict-transport-security': HSTS } : {}),
  };
}

/** `content-security-policy` -> `Content-Security-Policy`, for vercel.json. */
export function headerCase(name: string): string {
  return name
    .split('-')
    .map((w) => (w[0] ?? '').toUpperCase() + w.slice(1))
    .join('-');
}

/** The vercel.json `headers` block: every response, the same map static.ts sends (no HSTS:
    Vercel sends its own on every deployment domain). */
export function vercelHeadersBlock(indexHtml: string): {
  source: string;
  headers: { key: string; value: string }[];
}[] {
  const map = securityHeaders({ scriptHashes: inlineScriptHashes(indexHtml) });
  return [
    {
      source: '/(.*)',
      headers: Object.entries(map).map(([key, value]) => ({ key: headerCase(key), value })),
    },
  ];
}

/* Minimal cookie parsing and serialising (RFC 6265 subset). No dependency. */

export function parseCookies(header: string | undefined): Record<string, string> {
  const out: Record<string, string> = {};
  if (!header) return out;
  for (const part of header.split(';')) {
    const eq = part.indexOf('=');
    if (eq <= 0) continue;
    const name = part.slice(0, eq).trim();
    const raw = part.slice(eq + 1).trim();
    if (!name || name in out) continue;
    try {
      out[name] = decodeURIComponent(raw);
    } catch {
      out[name] = raw;
    }
  }
  return out;
}

export interface CookieOptions {
  maxAgeSec: number;
  httpOnly?: boolean;
  secure?: boolean;
  sameSite?: 'Strict' | 'Lax';
  path?: string;
}

export function serializeCookie(name: string, value: string, o: CookieOptions): string {
  const parts = [`${name}=${encodeURIComponent(value)}`, `Path=${o.path ?? '/'}`];
  parts.push(`Max-Age=${Math.max(0, Math.floor(o.maxAgeSec))}`);
  if (o.httpOnly ?? true) parts.push('HttpOnly');
  parts.push(`SameSite=${o.sameSite ?? 'Strict'}`);
  if (o.secure) parts.push('Secure');
  return parts.join('; ');
}

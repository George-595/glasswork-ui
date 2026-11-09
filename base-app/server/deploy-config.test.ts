import { existsSync, readFileSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  contentSecurityPolicy,
  headerCase,
  inlineScriptHashes,
  PERMISSIONS_POLICY,
  vercelHeadersBlock,
} from './infra/http/security-headers.ts';

/* The deploy files, held to what the app needs. A drift here is a security hole or a broken
   deploy that nothing else would notice until it ran on the host. */

const root = join(import.meta.dirname, '..');
const read = (p: string): string => readFileSync(join(root, p), 'utf8');
const lines = (p: string): string[] =>
  read(p)
    .split('\n')
    .map((l) => l.trim())
    .filter((l) => l && !l.startsWith('#'));

describe('vercel.json', () => {
  const config = JSON.parse(read('vercel.json')) as {
    buildCommand: string;
    headers: { source: string; headers: { key: string; value: string }[] }[];
  };
  const sent = new Map(config.headers.flatMap((h) => h.headers.map((x) => [x.key, x.value])));

  it('sends the security headers on every path, the CDN-served app shell included', () => {
    expect(config.headers.map((h) => h.source)).toEqual(['/(.*)']);
    expect(sent.get('X-Frame-Options')).toBe('DENY');
    expect(sent.get('Referrer-Policy')).toBe('no-referrer');
    expect(sent.get('X-Content-Type-Options')).toBe('nosniff');
    expect(sent.get('Permissions-Policy')).toBe(PERMISSIONS_POLICY);
    const csp = sent.get('Content-Security-Policy') ?? '';
    expect(csp).toContain("frame-ancestors 'none'");
    expect(csp).toContain("object-src 'none'");
    expect(csp).toContain("img-src 'self' data: blob:");
    expect(csp).toContain("default-src 'self'");
  });

  it('allows exactly the inline theme script of index.html, by hash', () => {
    const hashes = inlineScriptHashes(read('index.html'));
    expect(hashes).toHaveLength(1);
    const csp = sent.get('Content-Security-Policy') ?? '';
    expect(csp).toContain(`script-src 'self' ${hashes[0]};`);
    expect(csp).not.toContain("'unsafe-inline'; connect"); // style-src only, never script-src
    expect(csp).toBe(contentSecurityPolicy(hashes));
  });

  it('is the block scripts/vercel-headers.mjs generates (npm run check:headers)', () => {
    expect(config.headers).toEqual(vercelHeadersBlock(read('index.html')));
  });

  it('builds the client, then migrates once: a failed migration fails the build', () => {
    expect(config.buildCommand).toBe('npm run vercel-build');
    const scripts = (JSON.parse(read('package.json')) as { scripts: Record<string, string> })
      .scripts;
    // vite first: a broken client build never leaves a migrated database with no deployment
    expect(scripts['vercel-build']).toBe('vite build && node server/cli/migrate.ts --deploy');
    expect(scripts['db:migrate']).toContain('server/cli/migrate.ts --apply');
  });

  it('title-cases header names', () => {
    expect(headerCase('content-security-policy')).toBe('Content-Security-Policy');
    expect(headerCase('x-frame-options')).toBe('X-Frame-Options');
  });

  it('matches what a built dist/index.html needs, when there is one', () => {
    const dist = join(root, 'dist', 'client', 'index.html');
    if (!existsSync(dist)) return; // nothing built in this checkout
    expect(inlineScriptHashes(readFileSync(dist, 'utf8'))).toEqual(
      inlineScriptHashes(read('index.html')),
    );
  });
});

describe('.vercelignore', () => {
  const ignored = new Set(lines('.vercelignore'));

  it('keeps secrets and local data out of a `vercel` CLI upload', () => {
    for (const pattern of ['.env', '.env.*', '!.env.example', '*.sqlite*', '.data/']) {
      expect([pattern, ignored.has(pattern)]).toEqual([pattern, true]);
    }
    expect([...ignored].some((l) => l.replace(/^\//, '') === 'dist')).toBe(true);
    expect([...ignored].some((l) => l.startsWith('/data'))).toBe(true);
  });
});

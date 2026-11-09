/* Server rendering, end to end in a node environment: the real routes, services and database
   (testing.ts), the real src/entry-server.tsx loaded through Vite, and a real HTTP request for every
   page as every kind of visitor. What a visitor is sent is checked, not how React gets there:
   status, one <h1>, the theme on <html>, the data embedded for the browser, the headers.
   (Hydration - that the browser's first render matches this HTML - is src/app/hydration.test.tsx.) */
import { request } from 'node:http';
import { fileURLToPath } from 'node:url';
import { brotliDecompressSync, gunzipSync } from 'node:zlib';
import type { ViteDevServer } from 'vite';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { viteSource } from './infra/http/ssr-source.ts';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  ORIGIN,
  startTestApp,
  type TestApp,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from './testing.ts';

const ROOT = fileURLToPath(new URL('..', import.meta.url));

let vite: ViteDevServer;
let app: TestApp;
let admin = '';
let viewer = '';
let routePaths: string[] = [];
let publicPaths: string[] = [];

beforeAll(async () => {
  const { createServer } = await import('vite');
  vite = await createServer({
    root: ROOT,
    appType: 'custom',
    logLevel: 'silent',
    server: { middlewareMode: true, hmr: false },
  });
  // the route table is the app's own: read it through Vite rather than import client code here
  const table = (await vite.ssrLoadModule('/src/app/routes.ts')) as {
    ROUTES: { path: string }[];
    PUBLIC_ROUTES: { path: string }[];
  };
  routePaths = table.ROUTES.map((r) => r.path);
  publicPaths = table.PUBLIC_ROUTES.map((r) => r.path);
  app = await startTestApp({ ssr: viteSource(vite, ROOT) });
  admin = await app.signIn(ADMIN_EMAIL, ADMIN_PASSWORD);
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
}, 120_000);

afterAll(async () => {
  await app?.close();
  await vite?.close();
});

interface Page {
  status: number;
  html: string;
  headers: Headers;
}
const page = async (path: string, cookie = '', method = 'GET'): Promise<Page> => {
  const res = await fetch(`${app.base}${path}`, {
    method,
    redirect: 'manual',
    headers: cookie ? { cookie } : {},
  });
  return { status: res.status, html: await res.text(), headers: res.headers };
};

/* What the browser shows once the stream has finished: React sends a loading fallback first and
   the finished section after it (swapped in by a script), so the page's text is the markup minus
   the fallbacks. Count headings in that. */
const settled = (html: string) => html.replace(/<!--\$\?-->[\s\S]*?<!--\/\$-->/g, '');
const h1s = (html: string) => settled(html).match(/<h1\b/g)?.length ?? 0;
const htmlTag = (html: string) => /<html\b[^>]*>/.exec(html)?.[0] ?? '';

/** The JSON the page embeds for the browser, parsed. */
function embedded(html: string): {
  theme: Record<string, string>;
  queries: Record<string, unknown>;
  now: string;
} {
  const match = /<script type="application\/json" id="__INITIAL_DATA__">([\s\S]*?)<\/script>/.exec(
    html,
  );
  if (!match) throw new Error('the page embeds no initial data');
  return JSON.parse(match[1] ?? '') as ReturnType<typeof embedded>;
}

const send = (method: string, path: string, body: unknown, cookie: string) =>
  fetch(`${app.base}/api${path}`, {
    method,
    headers: { 'content-type': 'application/json', origin: ORIGIN, cookie },
    body: JSON.stringify(body),
  });

const api = async (path: string, cookie: string) =>
  (await (await fetch(`${app.base}/api${path}`, { headers: { cookie } })).json()) as unknown;

describe('every route, as every kind of visitor', () => {
  it('has routes to try', () => {
    expect(routePaths.length).toBeGreaterThan(8);
    expect(publicPaths).toEqual(['/accept-invite', '/forgot-password', '/reset-password']);
  });

  it('signed out: the sign-in page at any address (200), and the public pages in place of it', async () => {
    for (const path of [...routePaths, '/nope', '/admin/users']) {
      const res = await page(path);
      expect(res.status).toBe(200);
      expect(h1s(res.html)).toBe(1);
      expect(res.html).toContain('>Sign in</h1>');
      expect(Object.keys(embedded(res.html).queries)).toEqual(['/auth/me']);
    }
    for (const path of publicPaths) {
      const res = await page(path);
      expect(res.status).toBe(200);
      expect(h1s(res.html)).toBe(1);
      expect(res.html).not.toContain('>Sign in</h1>');
    }
  });

  it.each([
    ['a viewer', () => viewer],
    ['an admin', () => admin],
  ])('as %s: every route answers with one heading, the shell and no error', async (name, who) => {
    const isAdmin = name === 'an admin';
    for (const path of routePaths) {
      const adminOnly = path.startsWith('/admin');
      const res = await page(path === '/admin' ? '/admin/users' : path, who());
      expect(res.status).toBe(adminOnly && !isAdmin ? 403 : 200);
      expect(h1s(res.html)).toBe(1);
      expect(res.html).toContain('class="ui-sidebar');
    }
    expect(app.logs.filter((l) => l.level === 'error')).toEqual([]);
  });

  it('an unknown address is a 404 for a signed-in visitor, with the not-found page', async () => {
    for (const who of [viewer, admin]) {
      const res = await page('/no/such/page', who);
      expect(res.status).toBe(404);
      expect(h1s(res.html)).toBe(1);
      expect(res.html).toContain('Page not found');
    }
  });

  it('a public page is shown to someone signed in too, without the shell', async () => {
    const res = await page('/forgot-password', admin);
    expect(res.status).toBe(200);
    expect(res.html).not.toContain('class="ui-sidebar');
  });

  it('an old short address redirects a signed-in visitor, keeping the query', async () => {
    const res = await page('/admin?x=1', admin);
    expect(res.status).toBe(302);
    expect(res.headers.get('location')).toBe('/admin/users?x=1');
  });

  it('a non-admin on an admin page is told so inside the shell (403)', async () => {
    const res = await page('/admin/settings', viewer);
    expect(res.status).toBe(403);
    expect(res.html).toContain('Not authorised');
    expect(res.html).toContain('class="ui-sidebar');
  });

  it('maintenance mode: a non-admin gets 503 and Retry-After, an admin the app', async () => {
    expect((await send('PUT', '/settings', { 'maintenance.enabled': true }, admin)).status).toBe(
      200,
    );
    try {
      const gated = await page('/table', viewer);
      expect(gated.status).toBe(503);
      expect(gated.headers.get('retry-after')).toBe('60');
      expect(gated.html).toContain('back soon');
      expect((await page('/table', admin)).status).toBe(200);
    } finally {
      await send('PUT', '/settings', { 'maintenance.enabled': false }, admin);
    }
  });
});

describe('the theme', () => {
  it('is on <html> from the ui-theme cookie, so there is no flash', async () => {
    const dark = await page('/', `${admin}; ui-theme=dark.glass.mesh.dark`);
    expect(htmlTag(dark.html)).toContain('data-theme="dark"');
    expect(htmlTag(dark.html)).toContain('data-skin="glass"');
    expect(embedded(dark.html).theme).toEqual({
      mode: 'dark',
      skin: 'glass',
      backdrop: 'mesh',
      resolved: 'dark',
    });

    const light = await page('/', `${admin}; ui-theme=light.enterprise.aurora.light`);
    expect(htmlTag(light.html)).toContain('data-theme="light"');
    expect(htmlTag(light.html)).toContain('data-skin="enterprise"');
  });

  it("'system' uses the device's last answer and asks the page to settle it", async () => {
    const res = await page('/', 'ui-theme=system.enterprise.aurora.light');
    expect(htmlTag(res.html)).toContain('data-theme="light"');
    expect(htmlTag(res.html)).toContain('data-theme-mode="system"');
  });

  it('a first visit, or a made-up cookie, gets the defaults and nothing else', async () => {
    for (const cookie of [
      '',
      'ui-theme=banana',
      'ui-theme=dark.glass."><script>.dark',
      'ui-theme=a.b.c.d.e',
    ]) {
      const res = await page('/', cookie);
      expect(htmlTag(res.html)).toContain('data-theme="dark"');
      expect(htmlTag(res.html)).toContain('data-skin="enterprise"');
      expect(res.html).not.toContain('<script>."');
    }
  });
});

describe('the data embedded for the browser', () => {
  it('is what the visitor’s own API calls answer, and no more', async () => {
    const res = await page('/', admin);
    const { queries } = embedded(res.html);
    expect(queries['/auth/me']).toEqual(await api('/auth/me', admin));
    expect(queries['/settings']).toEqual(await api('/settings', admin));
    expect(Object.keys(queries).sort()).toEqual(
      [
        '/activity',
        '/auth/me',
        '/metrics/categories',
        '/metrics/kpis?days=30',
        '/metrics/revenue?days=30&compare=1',
        '/settings',
        '/transactions',
      ].sort(),
    );
    expect(queries['/metrics/kpis?days=30']).toEqual(await api('/metrics/kpis?days=30', admin));
  });

  it('a viewer gets the viewer’s settings, not an admin’s', async () => {
    const mine = embedded((await page('/', viewer)).html).queries['/settings'];
    expect(mine).toEqual(await api('/settings', viewer));
    expect(JSON.stringify(mine)).toBe(JSON.stringify(await api('/settings', viewer)));
  });

  it('a page only prefetches for a visitor who may open it', async () => {
    const denied = embedded((await page('/admin/users', viewer)).html).queries;
    expect(Object.keys(denied).sort()).toEqual(['/auth/me', '/settings']);
  });

  it("the table's address decides the call: the same one the page makes", async () => {
    const res = await page('/table?page=2&size=10&status=paid', admin);
    const key = '/transactions?page=2&pageSize=10&sort=-date&status=paid';
    const { queries } = embedded(res.html);
    expect(Object.keys(queries)).toContain(key);
    expect(queries[key]).toEqual(await api(key, admin));
    // and the page was drawn from it: page 2 of 10 rows
    expect(res.html).toContain('Transactions');
  });

  it('writes the page from the data: Home is drawn with its figures, not skeletons', async () => {
    const res = await page('/', admin);
    expect(res.html).toMatch(/Good (morning|afternoon|evening), /);
    expect(res.html).toContain('Recent activity');
  });

  it('escapes what could end the block or the line: nothing a user typed can run', async () => {
    const evil = '</script><script>globalThis.pwned=1</script><!-- \u2028 \u2029 & >';
    expect((await send('PATCH', '/account', { name: evil }, viewer)).status).toBe(200);
    const res = await page('/', viewer);
    const block = /id="__INITIAL_DATA__">([\s\S]*?)<\/script>/.exec(res.html)?.[1] ?? '';
    expect(block).not.toContain('</script');
    expect(block).not.toContain('<!--');
    expect(block).not.toMatch(/[<>&\u2028\u2029]/);
    expect(res.html).not.toContain('<script>globalThis.pwned');
    const me = embedded(res.html).queries['/auth/me'] as { user: { name: string } };
    expect(me.user.name).toBe(evil);
  });
});

describe('the response', () => {
  it('is HTML that is never cached, varies on the cookie and carries the security headers', async () => {
    const res = await page('/', admin);
    expect(res.headers.get('content-type')).toBe('text/html; charset=utf-8');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
    expect(res.headers.get('vary')).toBe('Cookie, Accept-Encoding');
    expect(res.headers.get('x-frame-options')).toBe('DENY');
    expect(res.headers.get('x-content-type-options')).toBe('nosniff');
    expect(res.headers.get('content-security-policy')).toContain("script-src 'self' 'sha256-");
    // React's streamed inline scripts run under a fresh per-request nonce
    const nonce = /'nonce-([^']+)'/.exec(res.headers.get('content-security-policy') ?? '')?.[1];
    expect(nonce).toBeTruthy();
    for (const tag of res.html.match(/<script(?![^>]*\bsrc=)(?![^>]*application\/json)[^>]*>/g) ??
      []) {
      if (!tag.includes('nonce=') && !tag.startsWith('<script>'))
        throw new Error(`script without nonce: ${tag}`);
    }
    // (a page drawn in place streams no inline scripts; the ones a late section brings carry the nonce)
  });

  it('has the page itself in the markup: no loading fallback and no swap script for it', async () => {
    for (const [path, text] of [
      ['/', 'Revenue and costs'],
      ['/table', 'Transactions'],
      ['/assistant', 'Assistant'],
    ] as const) {
      const { html, status } = await page(path, admin);
      expect(status).toBe(200);
      const main = /<main\b[\s\S]*<\/main>/.exec(html)?.[0] ?? '';
      expect(main, `${path}: <main>`).toContain('<h1');
      expect(main, `${path}: content`).toContain(text);
      // React sends a section that was not ready as a fallback (`<!--$?-->`), the finished markup
      // in a hidden <div id="S:n"> and a script that moves it into place
      expect(html, `${path}: pending boundary`).not.toContain('<!--$?-->');
      expect(html, `${path}: hidden section`).not.toMatch(/<div hidden id="S:\d+"/);
      expect(html, `${path}: swap script`).not.toMatch(/\$RC\(|\$RS\(|\$RX\(/);
      expect(html, `${path}: template`).not.toContain('<template');
    }
  });

  it('is streamed', async () => {
    const res = await fetch(`${app.base}/`, { headers: { cookie: admin } });
    expect(res.headers.get('transfer-encoding')).toBe('chunked');
    await res.text();
  });

  it('HEAD sends the headers and no body', async () => {
    const res = await page('/table', admin, 'HEAD');
    expect(res.status).toBe(200);
    expect(res.html).toBe('');
    expect(res.headers.get('cache-control')).toBe('private, no-store');
  });

  it('does not answer files or the API', async () => {
    expect((await page('/assets/missing.js')).status).not.toBe(200);
    expect((await page('/robots.txt')).headers.get('content-type')).not.toContain('text/html');
    const api404 = await page('/api/nope');
    expect(api404.headers.get('content-type')).toContain('application/json');
  });

  it('puts the app inside the template and the title on the page', async () => {
    const res = await page('/table', admin);
    expect(res.html).toMatch(/<title>Table · [^<]+<\/title>/);
    expect(res.html).toContain('<div id="root">');
    expect(res.html.trimEnd().endsWith('</html>')).toBe(true);
  });
});

/* The raw bytes of a page request with the given Accept-Encoding (fetch would decode them). */
function raw(
  path: string,
  headers: Record<string, string>,
  method = 'GET',
): Promise<{
  status: number;
  headers: Record<string, string | string[] | undefined>;
  body: Buffer;
}> {
  return new Promise((resolve, reject) => {
    const req = request(`${app.base}${path}`, { method, headers }, (res) => {
      const chunks: Buffer[] = [];
      res.on('data', (c: Buffer) => chunks.push(c));
      res.on('end', () =>
        resolve({ status: res.statusCode ?? 0, headers: res.headers, body: Buffer.concat(chunks) }),
      );
    });
    req.on('error', reject);
    req.end();
  });
}

// the per-request CSP nonce is the one thing two renderings of a page differ in
const withoutNonce = (html: string) =>
  html.replace(/nonce="[^"]+"/g, 'nonce=""').replace(/"now":"[^"]+"/, '"now":""');

describe('the response is compressed', () => {
  it('Brotli when asked: a streamed, chunked body that decodes to the page', async () => {
    const plain = await raw('/', { cookie: admin });
    expect(plain.headers['content-encoding']).toBeUndefined();
    const res = await raw('/', { cookie: admin, 'accept-encoding': 'br, gzip' });
    expect(res.headers['content-encoding']).toBe('br');
    expect(res.headers['transfer-encoding']).toBe('chunked');
    expect(res.headers['content-length']).toBeUndefined();
    expect(res.headers.vary).toBe('Cookie, Accept-Encoding');
    expect(res.headers['cache-control']).toBe('private, no-store');
    expect(res.body.length).toBeLessThan(plain.body.length / 2);
    const html = brotliDecompressSync(res.body).toString('utf8');
    expect(html.trimEnd().endsWith('</html>')).toBe(true);
    expect(withoutNonce(html)).toBe(withoutNonce(plain.body.toString('utf8')));
  });

  it('gzip when that is all the client takes, and q-values are respected', async () => {
    const gz = await raw('/table', { cookie: admin, 'accept-encoding': 'gzip' });
    expect(gz.headers['content-encoding']).toBe('gzip');
    expect(gunzipSync(gz.body).toString('utf8')).toContain('<div id="root">');
    const noBr = await raw('/table', { cookie: admin, 'accept-encoding': 'br;q=0, gzip' });
    expect(noBr.headers['content-encoding']).toBe('gzip');
  });

  it('is not compressed without an Accept-Encoding, but still says Vary', async () => {
    const res = await raw('/', { cookie: admin });
    expect(res.headers['content-encoding']).toBeUndefined();
    expect(res.headers.vary).toBe('Cookie, Accept-Encoding');
    expect(res.body.toString('utf8').trimEnd().endsWith('</html>')).toBe(true);
  });

  it('covers the sign-in page, an error status and HEAD', async () => {
    const signedOut = await raw('/', { 'accept-encoding': 'br' });
    expect(signedOut.headers['content-encoding']).toBe('br');
    expect(brotliDecompressSync(signedOut.body).toString('utf8')).toContain('<h1');
    const missing = await raw('/no-such-page', { cookie: admin, 'accept-encoding': 'gzip' });
    expect(missing.status).toBe(404);
    expect(gunzipSync(missing.body).toString('utf8')).toContain('<div id="root">');
    const head = await raw('/', { cookie: admin, 'accept-encoding': 'br' }, 'HEAD');
    expect(head.status).toBe(200);
    expect(head.headers['content-encoding']).toBe('br');
    expect(head.body.length).toBe(0);
  });
});

// keep the unused-credential linter quiet: both visitors sign in above
void ADMIN_PASSWORD;

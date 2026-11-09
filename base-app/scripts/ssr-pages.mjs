// ssr-pages — what the server really sends, for the hydration test.
//
//   node scripts/ssr-pages.mjs '<json: [{ "id", "url", "as": "out" | "viewer" | "admin", "cookie"? }]>'
//
// Boots the whole server stack in this plain Node process (no window: this is the real server
// side of the app), signs in as each visitor and prints { id: html } as JSON on stdout. The jsdom
// test in src/app/hydration.test.tsx then hydrates each page and fails on a mismatch. It is a
// separate process because the server render must run where there is no `window`; inside a jsdom
// test, code that checks `typeof window` would take the browser branch and prove nothing.
import { fileURLToPath } from 'node:url';
import { createServer } from 'vite';
import { viteSource } from '../server/infra/http/ssr-source.ts';
import {
  ADMIN_EMAIL,
  ADMIN_PASSWORD,
  startTestApp,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from '../server/testing.ts';

const root = fileURLToPath(new URL('..', import.meta.url));
const cases = JSON.parse(process.argv[2] ?? '[]');

const vite = await createServer({
  root,
  appType: 'custom',
  logLevel: 'silent',
  server: { middlewareMode: true, hmr: false },
});
const app = await startTestApp({ ssr: viteSource(vite, root) });
try {
  const cookies = {
    out: '',
    admin: await app.signIn(ADMIN_EMAIL, ADMIN_PASSWORD),
    viewer: await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD),
  };
  const pages = {};
  for (const { id, url, as, cookie } of cases) {
    const res = await fetch(`${app.base}${url}`, {
      headers: { cookie: [cookies[as ?? 'out'], cookie].filter(Boolean).join('; ') },
    });
    pages[id] = { status: res.status, html: await res.text() };
  }
  process.stdout.write(JSON.stringify(pages));
} finally {
  await app.close();
  await vite.close();
}

import { fileURLToPath, URL } from 'node:url';
import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig, type Plugin } from 'vite';
import { precompressDir } from './scripts/precompress.ts';

/* `npm run dev` runs Vite inside the Node server (server/main.ts, Vite's middleware mode), so a
   page is server-rendered in development exactly as in production and /api is the same origin.
   This file also serves `npm run dev:web` (Vite alone, a client-only app) and `vite preview`, where
   /api is proxied to the Node API server. Only VITE_* variables reach the client bundle.
   Tailwind v4 compiles @apps/ui/styles.css. */
const apiPort = process.env.API_PORT || '8787';
const webPort = Number(process.env.WEB_PORT || '5173');
/* No timeouts on the proxy (0 = none): /api/events is a server-sent event stream that stays open
   for minutes, and a response is passed through as it arrives, never buffered. The client's own
   request deadlines (src/core/api/client.ts) decide when a call has taken too long. */
const proxy = {
  '/api': {
    target: `http://127.0.0.1:${apiPort}`,
    changeOrigin: false,
    timeout: 0,
    proxyTimeout: 0,
  },
};

/* A Vercel function cannot hold /api/events open, so the build there turns the live stream off
   (the client would otherwise reconnect every 30 s for the whole life of each open tab). An
   explicit VITE_REALTIME in the environment wins. */
const realtimeOff = process.env.VERCEL === '1' && process.env.VITE_REALTIME === undefined;

/* First-load JS stays under the budget (scripts/check-budget.ts). `react` and `cn` (the class-name
   helpers every component calls) are the long-cached chunks a sign-in page needs. The charts (the
   chart library, the kit's chart components, the assistant's visual) are fenced into one chunk that only the pages drawing a chart import (a KPI tile fetches its sparkline from it only when it has a
   trend). The menus', dialogs'
   and popovers' libraries (radix, floating-ui) have no group: the signed-in app's file
   (src/app/SignedIn.tsx) is what imports them, so they ride with it and the sign-in page never
   fetches them (the toast library, which every page's Toaster needs, stays in the entry). */
const CHUNK_GROUPS = [
  { name: 'react', test: /node_modules\/(react|react-dom|scheduler)\//, priority: 40 },
  {
    name: 'cn',
    test: /node_modules\/(class-variance-authority|clsx|tailwind-merge)\//,
    priority: 30,
  },
  {
    name: 'charts',
    test: /node_modules\/(@tanstack\/charts|d3-[^/]+|internmap)\/|packages\/ui\/src\/charts\/|src\/core\/ui\/AgentVisual/,
    priority: 20,
    includeDependenciesRecursively: false,
  },
  // everything else the entry needs, in one chunk instead of a dozen small ones
  { name: 'app', tags: ['$initial' as const], priority: 10, includeDependenciesRecursively: false },
];

/* After the client bundle is written, a .br and a .gz beside each text file of 1 kB or more
   (scripts/precompress.ts); server/infra/http/static.ts serves them. Skipped for the server build,
   and on Vercel, whose CDN compresses static files itself. */
function precompress(): Plugin {
  let skip = false;
  let outDir = '';
  return {
    name: 'precompress',
    apply: 'build',
    configResolved(config) {
      skip = Boolean(config.build.ssr) || process.env.VERCEL === '1';
      outDir = config.build.outDir;
    },
    async closeBundle() {
      if (skip) return;
      const totals = await precompressDir(outDir);
      console.log(
        `precompress: ${totals.files} files, ${(totals.original / 1000).toFixed(0)} kB -> ` +
          `${(totals.brotli / 1000).toFixed(0)} kB br, ${(totals.gzip / 1000).toFixed(0)} kB gzip`,
      );
    },
  };
}

/* The client bundle's chunking (CHUNK_GROUPS) and tree-shaking. A server build (vite build --ssr)
   keeps the defaults: its dependencies stay external and there is no first load to budget. */
function clientChunks(): Plugin {
  return {
    name: 'client-chunks',
    apply: 'build',
    config(_config, { isSsrBuild }) {
      if (isSsrBuild) return {};
      return {
        build: {
          rolldownOptions: {
            // the kit and the app's own ui folder hold no import-time side effects, so what a page
            // does not use is dropped even when it is re-exported through a barrel
            treeshake: {
              moduleSideEffects: [
                { test: /(packages\/ui\/src|src\/core\/ui)\/.*\.tsx?$/, sideEffects: false },
              ],
            },
            output: {
              codeSplitting: { includeDependenciesRecursively: false, groups: CHUNK_GROUPS },
            },
          },
        },
      };
    },
  };
}

export default defineConfig({
  define: realtimeOff ? { 'import.meta.env.VITE_REALTIME': JSON.stringify('off') } : {},
  plugins: [react(), tailwindcss(), clientChunks(), precompress()],
  resolve: { alias: { '~': fileURLToPath(new URL('./src', import.meta.url)) } },
  server: { host: '127.0.0.1', port: webPort, strictPort: true, proxy },
  preview: { host: '127.0.0.1', port: 4173, strictPort: true, proxy },
  /* Two builds (npm run build): the browser's bundle in dist/client, and the server render
     (`vite build --ssr src/entry-server.tsx --outDir dist/server`) that server/infra/http/ssr.ts
     loads. The server bundle includes the workspace kit, so the runtime image needs only the npm
     dependencies, not the packages' source. The manifest (dist/client/.vite/manifest.json) is the
     first-load graph that check:budget reads. */
  build: { target: 'es2023', sourcemap: false, outDir: 'dist/client', manifest: true },
  ssr: { noExternal: [/^@apps\//] },
});

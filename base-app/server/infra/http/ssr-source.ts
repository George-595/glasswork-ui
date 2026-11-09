import { readFile } from 'node:fs/promises';
import type { IncomingMessage, Server, ServerResponse } from 'node:http';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';
import type { ViteDevServer } from 'vite';
import type { SsrModule, SsrSource } from './ssr.ts';

/* Where the server render's code comes from.

   - `distSource`: production. `npm run build` wrote the browser bundle (dist/client, with the
     index.html to wrap pages in) and the server render (dist/server/entry-server.js). Both are
     read once and kept.
   - `viteSource`: development. Vite runs INSIDE this process in middleware mode (`appType:
     'custom'`), so `npm run dev` server-renders exactly as production does, with hot module
     replacement over the same port, and /api on the same origin. Source files are loaded through
     it on every request (it caches, and reloads what changed), and index.html goes through
     Vite's transform, which adds its client script. `vite` is a development dependency and is
     only imported here, in development.

   Both give the SSR handler (ssr.ts) the same two things: the module and the template. */

export function distSource(dist: { client: string; server: string }): SsrSource {
  let loaded: Promise<{ module: SsrModule; template: string }> | undefined;
  return {
    load() {
      loaded ??= (async () => {
        const template = await readFile(join(dist.client, 'index.html'), 'utf8');
        const module = (await import(
          pathToFileURL(join(dist.server, 'entry-server.js')).href
        )) as SsrModule;
        return { module, template };
      })().catch((err: unknown) => {
        loaded = undefined; // not cached: the next request tries again
        throw err;
      });
      return loaded;
    },
  };
}

/** The source for a Vite server in middleware mode (`appType: 'custom'`) rooted at `root`. */
export function viteSource(vite: ViteDevServer, root: string): SsrSource {
  return {
    async load(url) {
      const raw = await readFile(join(root, 'index.html'), 'utf8');
      const template = await vite.transformIndexHtml(url, raw);
      const module = (await vite.ssrLoadModule('/src/entry-server.tsx')) as unknown as SsrModule;
      return { module, template };
    },
    fixStacktrace(error) {
      vite.ssrFixStacktrace(error);
    },
  };
}

export interface ViteDev {
  /** Vite's middleware (modules, HMR client, public files) as a handler: true when it answered. */
  middleware: (req: IncomingMessage, res: ServerResponse) => Promise<boolean>;
  source: SsrSource;
  close: () => Promise<void>;
}

/** Starts Vite in middleware mode on `server` (its HMR socket shares the port). */
export async function startViteDev(server: Server, root: string): Promise<ViteDev> {
  const { createServer } = await import('vite');
  const vite = await createServer({
    root,
    appType: 'custom',
    // 'runner' loads vite.config.ts in memory; the default bundles it to node_modules/.vite-temp,
    // a file `node --watch` sees, so each start would restart the server in a loop
    configLoader: 'runner',
    server: { middlewareMode: true, ws: { server } },
  });
  return {
    middleware: (req, res) =>
      new Promise<boolean>((resolve, reject) => {
        const answered = () => resolve(true);
        res.once('close', answered);
        vite.middlewares(req, res, (err?: unknown) => {
          res.off('close', answered);
          if (err) reject(err instanceof Error ? err : new Error(String(err)));
          else resolve(false);
        });
      }),
    source: viteSource(vite, root),
    close: () => vite.close(),
  };
}

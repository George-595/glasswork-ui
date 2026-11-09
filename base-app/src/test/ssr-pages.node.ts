/// <reference types="node" />
import { execFileSync } from 'node:child_process';
import { resolve } from 'node:path';

/* The pages the real server sends, for a list of (visitor, address) cases, by running
   scripts/ssr-pages.mjs in a plain Node process (no `window`, which is the point: see the
   script). Node-only, so it is kept out of the client's type check (`*.node.ts`). */
export interface PageCase {
  id: string;
  url: string;
  as: 'out' | 'viewer' | 'admin';
  cookie?: string;
}

export function serverPages(
  cases: readonly PageCase[],
): Record<string, { status: number; html: string }> {
  const out = execFileSync(
    process.execPath,
    [resolve(process.cwd(), 'scripts/ssr-pages.mjs'), JSON.stringify(cases)],
    { cwd: process.cwd(), maxBuffer: 256 * 1024 * 1024, timeout: 180_000, encoding: 'utf8' },
  );
  return JSON.parse(out) as Record<string, { status: number; html: string }>;
}

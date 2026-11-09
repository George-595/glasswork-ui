import type { MapResponse } from './maps.worker';
import { type MapGeometry, renderFieldPixels, renderRimPixels } from './optics';
import { pngDataUrl } from './png';

/* Material maps as PNG data URLs, generated once per geometry and cached.
   Same idea as upstream's src/dom/maps.ts (a promise per key, settled maps
   readable synchronously, oldest evicted), without its IndexedDB store or
   GPU renderer.

   What makes it cheap enough for a page full of surfaces:
   - the work runs in a Web Worker (maps.worker.ts) so it never blocks a frame; where Workers
     are missing it runs on the main thread, one surface per idle moment;
   - the maps split in two: the displacement field depends on the shape alone, at half
     resolution; the rim planes (highlight, shade, body) also depend on the appearance. A
     theme switch therefore redraws the rim planes only, and the field is reused;
   - sizes are bucketed (bucketGeometry) so two cards a few pixels apart share their maps. */

export interface MaterialMaps {
  field: string;
  highlight: string;
  shade: string;
  body: string;
}

interface Rim {
  highlight: string;
  shade: string;
  body: string;
}

const limit = 48;
const pending = new Map<string, Promise<MaterialMaps>>();
const settled = new Map<string, MaterialMaps>();
const fields = new Map<string, Promise<string>>();
const rims = new Map<string, Promise<Rim>>();

/** Sizes from 96px up are rounded up to the next 8px: the maps are stretched to the real size
    (preserveAspectRatio none, mask-size 100%), and a few pixels of stretch across a smooth
    field is invisible. Smaller surfaces (a badge, a button) keep their exact size. */
export function bucketGeometry(g: MapGeometry): MapGeometry {
  const bucket = (n: number) => (n >= 96 ? Math.ceil(n / 8) * 8 : n);
  return { ...g, width: bucket(g.width), height: bucket(g.height) };
}

export function mapKey(g: MapGeometry): string {
  return [g.width, g.height, g.radius, g.dpr, g.appearance, g.band, g.rimFill].join('|');
}
const fieldKey = (g: MapGeometry) => [g.width, g.height, g.radius, g.dpr].join('|');

/** Maps already generated for this geometry, without waiting. */
export function peekMaterialMaps(g: MapGeometry): MaterialMaps | undefined {
  // Pure, so it can run during render.
  return settled.get(mapKey(g));
}

/* ---- the worker ------------------------------------------------------------------------ */

interface Job {
  resolve: (r: MapResponse) => void;
  reject: (e: unknown) => void;
  request: { kind: 'field' | 'rim'; geometry: MapGeometry };
}
let worker: Worker | null | undefined;
let nextId = 1;
const jobs = new Map<number, Job>();

function startWorker(): Worker | null {
  if (worker !== undefined) return worker;
  worker = null;
  if (typeof Worker === 'undefined') return null;
  try {
    const w = new Worker(new URL('./maps.worker.ts', import.meta.url), { type: 'module' });
    w.onmessage = (event: MessageEvent<MapResponse>) => {
      const job = jobs.get(event.data.id);
      if (!job) return;
      jobs.delete(event.data.id);
      if ('error' in event.data) job.reject(new Error(event.data.error));
      else job.resolve(event.data);
    };
    w.onerror = () => {
      // the worker could not run (blocked, a bad URL): do its jobs here, and stop using it
      worker = null;
      w.terminate();
      const stranded = [...jobs.values()];
      jobs.clear();
      for (const job of stranded) {
        runHere(job.request.kind, job.request.geometry).then(job.resolve, job.reject);
      }
    };
    worker = w;
  } catch {
    worker = null;
  }
  return worker;
}

/** After the first paint, one surface per idle moment. */
function idle<T>(fn: () => Promise<T>): Promise<T> {
  return new Promise((resolve, reject) => {
    const run = () => fn().then(resolve, reject);
    const ric = (globalThis as { requestIdleCallback?: (cb: () => void, o?: object) => number })
      .requestIdleCallback;
    if (typeof ric === 'function') ric(run, { timeout: 500 });
    else setTimeout(run, 0);
  });
}

function runHere(kind: 'field' | 'rim', geometry: MapGeometry): Promise<MapResponse> {
  return idle(async (): Promise<MapResponse> => {
    if (kind === 'field') {
      const p = renderFieldPixels(geometry);
      return { id: 0, kind: 'field', field: await pngDataUrl(p.columns, p.rows, p.field) };
    }
    const p = renderRimPixels(geometry);
    const [highlight, shade, body] = await Promise.all([
      pngDataUrl(p.columns, p.rows, p.highlight),
      pngDataUrl(p.columns, p.rows, p.shade),
      pngDataUrl(p.columns, p.rows, p.body),
    ]);
    return { id: 0, kind: 'rim', highlight, shade, body };
  });
}

function compute(kind: 'field' | 'rim', geometry: MapGeometry): Promise<MapResponse> {
  const w = startWorker();
  if (!w) return runHere(kind, geometry);
  return new Promise((resolve, reject) => {
    const id = nextId++;
    jobs.set(id, { resolve, reject, request: { kind, geometry } });
    w.postMessage({ id, kind, geometry });
  });
}

function remember<K, V>(cache: Map<K, V>, key: K, value: V) {
  cache.set(key, value);
  while (cache.size > limit * 2) {
    const oldest = cache.keys().next().value;
    if (oldest === undefined) break;
    cache.delete(oldest);
  }
}

function getField(g: MapGeometry): Promise<string> {
  const key = fieldKey(g);
  const hit = fields.get(key);
  if (hit) return hit;
  const made = compute('field', g).then((r) => {
    if (!('field' in r)) throw new Error('maps: no field');
    return r.field;
  });
  made.catch(() => fields.delete(key));
  remember(fields, key, made);
  return made;
}

function getRim(g: MapGeometry): Promise<Rim> {
  const key = mapKey(g);
  const hit = rims.get(key);
  if (hit) return hit;
  const made = compute('rim', g).then((r) => {
    if (!('highlight' in r)) throw new Error('maps: no rim');
    return { highlight: r.highlight, shade: r.shade, body: r.body };
  });
  made.catch(() => rims.delete(key));
  remember(rims, key, made);
  return made;
}

export function getMaterialMaps(g: MapGeometry): Promise<MaterialMaps> {
  const key = mapKey(g);
  const done = settled.get(key);
  if (done) return Promise.resolve(done);
  const inFlight = pending.get(key);
  if (inFlight) return inFlight;
  const result = Promise.all([getField(g), getRim(g)]).then(
    ([field, rim]) => {
      const maps = { field, ...rim };
      pending.delete(key);
      settled.set(key, maps);
      while (settled.size > limit) {
        const oldest = settled.keys().next().value;
        if (oldest === undefined) break;
        settled.delete(oldest);
      }
      return maps;
    },
    (error: unknown) => {
      pending.delete(key);
      throw error;
    },
  );
  pending.set(key, result);
  return result;
}

export function clearMaterialMaps(): void {
  pending.clear();
  settled.clear();
  fields.clear();
  rims.clear();
}

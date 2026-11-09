import { type MapGeometry, renderFieldPixels, renderRimPixels } from './optics';
import { pngDataUrl } from './png';

/* The material maps, made off the main thread.

   Pixel maths plus PNG encoding was 2 seconds of main-thread work at 4x CPU on a page load
   and 1.75 s on a theme switch. Both are pure (no canvas, no DOM), so they run here as they
   are and the page only receives the finished data URLs. maps.ts owns the worker and falls
   back to doing the same work on the main thread where Workers are not available. */
export type MapRequest =
  | { id: number; kind: 'field'; geometry: MapGeometry }
  | { id: number; kind: 'rim'; geometry: MapGeometry };

export type MapResponse =
  | { id: number; kind: 'field'; field: string }
  | { id: number; kind: 'rim'; highlight: string; shade: string; body: string }
  | { id: number; error: string };

self.onmessage = async (event: MessageEvent<MapRequest>) => {
  const request = event.data;
  try {
    if (request.kind === 'field') {
      const p = renderFieldPixels(request.geometry);
      const field = await pngDataUrl(p.columns, p.rows, p.field);
      self.postMessage({ id: request.id, kind: 'field', field } satisfies MapResponse);
    } else {
      const p = renderRimPixels(request.geometry);
      const [highlight, shade, body] = await Promise.all([
        pngDataUrl(p.columns, p.rows, p.highlight),
        pngDataUrl(p.columns, p.rows, p.shade),
        pngDataUrl(p.columns, p.rows, p.body),
      ]);
      self.postMessage({
        id: request.id,
        kind: 'rim',
        highlight,
        shade,
        body,
      } satisfies MapResponse);
    }
  } catch (error) {
    self.postMessage({ id: request.id, error: String(error) } satisfies MapResponse);
  }
};

/* Adapted from Arc's treemap (MIT, (c) Elia Kuratli; see THIRD_PARTY_NOTICES.md): the squarified
   layout. Rows of tiles run along the short side of the free rectangle; a row is closed when
   adding the next tile would make its worst aspect ratio worse. Pure, no DOM. */
export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** The worst aspect ratio in a row of areas laid along a side of length `side`. */
function worst(row: readonly number[], side: number): number {
  const sum = row.reduce((a, b) => a + b, 0);
  return Math.max(
    (side * side * Math.max(...row)) / (sum * sum),
    (sum * sum) / (side * side * Math.min(...row)),
  );
}

/** Lay `items` out in `rect`, biggest first. Every item gets a rect (zero-sized when its value
    is not positive), so the caller can look any of them up. The rects tile `rect` exactly. */
export function squarify(
  items: readonly { id: string; value: number }[],
  rect: Rect,
): Map<string, Rect> {
  const out = new Map<string, Rect>();
  const list = items.filter((i) => i.value > 0).toSorted((a, b) => b.value - a.value);
  const total = list.reduce((sum, i) => sum + i.value, 0);
  if (total > 0 && rect.w > 0 && rect.h > 0) {
    const scale = (rect.w * rect.h) / total;
    let { x, y, w, h } = rect;
    let i = 0;
    while (i < list.length) {
      const side = Math.min(w, h);
      const row = [(list[i]?.value ?? 0) * scale];
      let j = i + 1;
      while (j < list.length) {
        const next = [...row, (list[j]?.value ?? 0) * scale];
        if (worst(next, side) > worst(row, side)) break;
        row.push((list[j]?.value ?? 0) * scale);
        j++;
      }
      const sum = row.reduce((a, b) => a + b, 0);
      if (w >= h) {
        const colW = sum / h;
        let cy = y;
        for (let k = i; k < j; k++) {
          const item = list[k];
          if (!item) continue;
          const th = (item.value * scale) / colW;
          out.set(item.id, { x, y: cy, w: colW, h: th });
          cy += th;
        }
        x += colW;
        w -= colW;
      } else {
        const rowH = sum / w;
        let cx = x;
        for (let k = i; k < j; k++) {
          const item = list[k];
          if (!item) continue;
          const tw = (item.value * scale) / rowH;
          out.set(item.id, { x: cx, y, w: tw, h: rowH });
          cx += tw;
        }
        y += rowH;
        h -= rowH;
      }
      i = j;
    }
  }
  for (const item of items)
    if (!out.has(item.id)) out.set(item.id, { x: rect.x, y: rect.y, w: 0, h: 0 });
  return out;
}

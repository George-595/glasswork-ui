import { describe, expect, it } from 'vitest';
import { type Box, predict, rayHit, velocity } from '../src/effects/PointerPredict.tsx';

const box = (left: number, top: number, w = 100, h = 40): Box => ({
  left,
  top,
  right: left + w,
  bottom: top + h,
});

describe('pointer prediction', () => {
  it('reads velocity from the last tenth of a second only', () => {
    expect(velocity([{ t: 0, x: 0, y: 0 }])).toBeNull();
    const v = velocity([
      { t: 0, x: 999, y: 999 },
      { t: 200, x: 0, y: 0 },
      { t: 250, x: 50, y: 0 },
    ]);
    expect(v).toEqual({ vx: 1, vy: 0 });
  });

  it('casts a ray into a box', () => {
    expect(rayHit(0, 20, 1, 0, box(100, 0))).toBe(100);
    expect(rayHit(0, 200, 1, 0, box(100, 0))).toBeNull();
    expect(rayHit(0, 20, -1, 0, box(100, 0))).toBeNull();
  });

  it('picks the button the pointer is heading for, not the nearest one', () => {
    const boxes = [box(0, 300), box(300, 300)];
    // from above the left button, moving down and to the right
    const g = predict(100, 0, 0.6, 0.6, boxes);
    expect(g?.index).toBe(1);
  });

  it('prefers the nearer of two buttons on the same line', () => {
    const g = predict(0, 20, 1, 0, [box(500, 0), box(200, 0)]);
    expect(g).toMatchObject({ index: 1, x: 200, y: 20 });
  });

  it('accepts a near miss inside the cone, and nothing outside it', () => {
    expect(predict(0, 0, 1, 0.05, [box(300, 60, 40, 40)])?.index).toBe(0);
    expect(predict(0, 0, 1, 0, [box(300, 400)])).toBeNull();
  });

  it('says nothing when the pointer is resting or already on a button', () => {
    expect(predict(0, 20, 0.05, 0, [box(200, 0)])).toBeNull();
    expect(predict(50, 20, 1, 0, [box(0, 0)])).toBeNull();
  });
});

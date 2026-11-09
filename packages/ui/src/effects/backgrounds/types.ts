import type { Rgb } from '../cssColor';

/* The contract between AnimatedBackground and a lazily loaded scene (backgrounds/gl.ts).
   The component owns the loop, the visibility pause and the theme updates;
   a scene only draws a frame for a given time. */
export interface BackgroundScene {
  /** Draw one frame at `seconds` of (visible) animation time. */
  render(seconds: number): void;
  resize(width: number, height: number): void;
  setColors(colors: readonly Rgb[]): void;
  /** Remove the canvas and release the WebGL context. */
  destroy(): void;
}

/** Create the scene inside `container`, or return null when WebGL is unavailable. */
export type MountBackground = (
  container: HTMLElement,
  colors: readonly Rgb[],
) => BackgroundScene | null;

import { cssVar } from '@apps/colors';
import { type HTMLAttributes, useEffect, useRef, useState } from 'react';
import { cx } from '../lib/cx';
import type { BackgroundScene, MountBackground } from './backgrounds/types';
import { resolveCssColors } from './cssColor';
import { useLowPower } from './lowPower';
import { useWantsSolid } from './shaders/useShaderStage';
import { useReducedMotion } from './useReducedMotion';
import { claimWebGl, useWebGlOwner } from './webglGuard';

/* AnimatedBackground — the animated backdrop behind the glass skin (ENGINEERING.md §5:
   "Motion never costs access"). Two scenes, both the kit's own full-screen shaders on bare
   WebGL (backgrounds/gl.ts): 'tide', slow silk, and 'hive', a honeycomb that breathes.

   - Decorative: aria-hidden, no pointer events, fixed behind the content.
   - Lazy: the scene is a dynamic import, started after the first paint.
   - One WebGL context per page (webglGuard.ts): a second background
     renders nothing while the first is mounted, and a SeaGlassStage on
     screen takes the context, leaving this one on its static gradient.
   - DRAWN ON DEMAND. The backdrop sits under every translucent surface, and a new frame
     changes what each backdrop filter sees, so a loop that redraws it forever makes the GPU
     re-run every filter on the page 60 times a second while nothing happens. It draws one
     frame after load and again only when something changes (a resize, the theme or skin, a
     palette colour). It animates only on a device that can afford it (not low power:
     effects/lowPower.ts, which includes every touch device), at 30fps, and not while the
     page is scrolling or the tab is hidden.
   - Reduced motion, reduced transparency, no WebGL, or before the scene loads: a static
     gradient of the backdrop roles (effects.css), or the plain page colour for reduced
     transparency (as ShaderBackdrop does), never a blank page.
   - Re-coloured when the theme or skin changes.
   - SSR: renders the empty decorative div with the static gradient. */

export type BackgroundVariant = 'tide' | 'hive';

export interface AnimatedBackgroundProps extends HTMLAttributes<HTMLDivElement> {
  /** Which scene. tide: slow silk folds over the page colour; hive: a honeycomb whose cells
      light and fade in slow waves. */
  variant?: BackgroundVariant;
  /** Three roles (`cssVar('chart-1')`…) for the scene's ramp. Default: chart-1..3. */
  colors?: readonly [string, string, string];
  /** Time multiplier. 1 is the calm default. */
  speed?: number;
}

const DEFAULT_COLORS = [cssVar('chart-1'), cssVar('chart-2'), cssVar('chart-3')] as const;

/** The animated backdrop's frame rate cap: its curtain drifts over tens of seconds. */
export const BACKDROP_FPS = 30;
/** Quiet time after the last scroll event before the animation resumes. */
export const SCROLL_QUIET_MS = 150;

const SCENES: Record<BackgroundVariant, () => Promise<{ mount: MountBackground }>> = {
  tide: () => import('./backgrounds/tide'),
  hive: () => import('./backgrounds/hive'),
};

export function AnimatedBackground({
  variant = 'tide',
  colors = DEFAULT_COLORS,
  speed = 1,
  className,
  ...props
}: AnimatedBackgroundProps) {
  const reduced = useReducedMotion();
  const solid = useWantsSolid();
  const lowPower = useLowPower();
  const animate = !lowPower;
  const ref = useRef<HTMLDivElement>(null);
  const [id] = useState(() => Symbol('AnimatedBackground'));
  const owner = useWebGlOwner();
  const isOwner = owner?.id === id;
  const speedRef = useRef(speed);
  const [c0, c1, c2] = colors;

  useEffect(() => {
    speedRef.current = speed;
  }, [speed]);

  useEffect(() => claimWebGl(id, 'background'), [id]);

  useEffect(() => {
    const host = ref.current;
    if (!isOwner || reduced || solid || !host) return;

    let cancelled = false;
    let scene: BackgroundScene | null = null;
    let frame = 0;
    let last: number | null = null;
    let seconds = 0;
    let scrolling = false;
    let scrollTimer = 0;
    let redrawFrame = 0;
    const cleanups: Array<() => void> = [];
    const list = [c0, c1, c2];
    const frameMs = 1000 / BACKDROP_FPS;

    const tick = (now: number) => {
      frame = 0;
      if (!scene) return;
      if (last === null) {
        last = now;
        scene.render(seconds);
      } else if (now - last >= frameMs - 1) {
        seconds += ((now - last) / 1000) * speedRef.current;
        last = now;
        scene.render(seconds);
      }
      frame = requestAnimationFrame(tick);
    };
    const play = () => {
      if (!animate || !scene || frame || document.hidden || scrolling) return;
      last = null;
      frame = requestAnimationFrame(tick);
    };
    const pause = () => {
      cancelAnimationFrame(frame);
      frame = 0;
    };
    /* one frame now (a resize clears the canvas, a recolour changes it); animating, the loop
       draws the next one anyway */
    const redraw = () => {
      if (!scene || frame || redrawFrame) return;
      redrawFrame = requestAnimationFrame(() => {
        redrawFrame = 0;
        scene?.render(seconds);
      });
    };

    const start = async () => {
      const { mount } = await SCENES[variant]();
      if (cancelled) return;
      // roles that cannot be read (or no WebGL): the static gradient stays
      const initial = resolveCssColors(list, host);
      if (!initial) return;
      scene = mount(host, initial);
      if (!scene) return;
      const current = scene;
      let w = host.clientWidth;
      let h = host.clientHeight;
      const fit = () => {
        // a ResizeObserver reports once on observe: only a real change needs a new canvas
        if (host.clientWidth === w && host.clientHeight === h) return;
        w = host.clientWidth;
        h = host.clientHeight;
        current.resize(w, h);
        redraw();
      };
      current.resize(w, h);
      current.render(seconds);
      if (typeof ResizeObserver === 'function') {
        const ro = new ResizeObserver(fit);
        ro.observe(host);
        cleanups.push(() => ro.disconnect());
      } else {
        window.addEventListener('resize', fit);
        cleanups.push(() => window.removeEventListener('resize', fit));
      }
      const onVisibility = () => (document.hidden ? pause() : play());
      document.addEventListener('visibilitychange', onVisibility);
      cleanups.push(() => document.removeEventListener('visibilitychange', onVisibility));
      if (animate) {
        // a scrolling page is busy enough: hold the animation until it settles
        const onScroll = () => {
          if (!scrolling) {
            scrolling = true;
            pause();
          }
          window.clearTimeout(scrollTimer);
          scrollTimer = window.setTimeout(() => {
            scrolling = false;
            play();
          }, SCROLL_QUIET_MS);
        };
        document.addEventListener('scroll', onScroll, { passive: true, capture: true });
        cleanups.push(() => document.removeEventListener('scroll', onScroll, { capture: true }));
      }
      // theme or skin switch: re-read the token colours
      const recolour = () => {
        const next = resolveCssColors(list, host);
        if (next) {
          current.setColors(next);
          redraw();
        }
      };
      const mo = new MutationObserver(recolour);
      mo.observe(document.documentElement, {
        attributes: true,
        attributeFilter: ['data-theme', 'data-skin', 'class', 'style'],
      });
      cleanups.push(() => mo.disconnect());
      const scheme = window.matchMedia?.('(prefers-color-scheme: dark)');
      scheme?.addEventListener('change', recolour);
      cleanups.push(() => scheme?.removeEventListener('change', recolour));
      host.toggleAttribute('data-live', true);
      play();
    };

    // after the first paint: one frame, then a macrotask
    let timer = 0;
    const firstPaint = requestAnimationFrame(() => {
      timer = window.setTimeout(() => {
        start().catch(() => {
          /* a failed chunk load leaves the static gradient */
        });
      }, 0);
    });

    return () => {
      cancelled = true;
      cancelAnimationFrame(firstPaint);
      cancelAnimationFrame(redrawFrame);
      window.clearTimeout(timer);
      window.clearTimeout(scrollTimer);
      pause();
      for (const fn of cleanups) fn();
      scene?.destroy();
      scene = null;
      host.removeAttribute('data-live');
    };
  }, [isOwner, reduced, solid, animate, variant, c0, c1, c2]);

  // another background holds the context: render nothing (a stage holding it: the gradient)
  if (owner !== null && !isOwner && owner.kind === 'background') return null;

  return (
    <div
      {...props}
      ref={ref}
      aria-hidden="true"
      className={cx('ui-fx-bg', className)}
      data-variant={variant}
      data-view={solid ? 'solid' : undefined}
    />
  );
}

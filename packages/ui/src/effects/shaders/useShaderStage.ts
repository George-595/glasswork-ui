import { type RefObject, useCallback, useEffect, useState, useSyncExternalStore } from 'react';
import { useLowPower } from '../lowPower';
import { useReducedMotion } from '../useReducedMotion';
import { probeWebGpu, useGpuClaim } from './guard';
import { resolvePalette, type ShaderPalette } from './palette';

/* useShaderStage — everything ShaderBackdrop and ShaderAccent share: which of
   four views to draw, and when the lazy scene may mount.

     solid    prefers-reduced-transparency or forced-colors: the plain page
              colour, no gradient, no GPU (glass.css maps its surfaces to solid
              tokens in the same case);
     static   prefers-reduced-motion, a low-power device (effects/lowPower.ts: a WebGPU
              loop never runs on a phone), a second instance (the guard), the
              moment before the GPU probe returns, and the server: the CSS
              gradient, no GPU;
     unavailable  no WebGPU, the adapter request failed, or the scene threw:
              the caller draws its fallback;
     live     the scene may mount, once the adapter is confirmed and the
              element is on screen in a visible tab.

   The scene is UNMOUNTED, not just paused, while the tab is hidden or the
   element is off screen: that releases the GPU context and the render loop
   entirely (the package keeps its loop running at speed 0), and the CSS
   gradient underneath covers the gap, so a return is a fade-in, not a flash. */
export type ShaderView = 'solid' | 'static' | 'unavailable' | 'live';

export interface ShaderStage {
  view: ShaderView;
  /** True when `<ShaderScene>` should be in the tree. */
  mountScene: boolean;
  palette: ShaderPalette | null;
  /** The first frame has been drawn. */
  ready: boolean;
  onReady: () => void;
  /** The scene threw or reported the GPU unusable. */
  fail: () => void;
}

const TRANSPARENCY = '(prefers-reduced-transparency: reduce)';
const FORCED = '(forced-colors: active)';

function wantsSolid(): boolean {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return false;
  return window.matchMedia(TRANSPARENCY).matches || window.matchMedia(FORCED).matches;
}

function subscribeSolid(onChange: () => void): () => void {
  if (typeof window === 'undefined' || typeof window.matchMedia !== 'function') return () => {};
  const lists = [window.matchMedia(TRANSPARENCY), window.matchMedia(FORCED)];
  for (const l of lists) l.addEventListener('change', onChange);
  return () => {
    for (const l of lists) l.removeEventListener('change', onChange);
  };
}

/** True when the reader asked for no transparency, or forces colours. */
export function useWantsSolid(): boolean {
  return useSyncExternalStore(subscribeSolid, wantsSolid, () => false);
}

export function useShaderStage(
  priority: number,
  hostRef: RefObject<HTMLElement | null>,
): ShaderStage {
  const reducedMotion = useReducedMotion();
  const solid = useWantsSolid();
  const lowPower = useLowPower();
  const owner = useGpuClaim(priority, !reducedMotion && !solid && !lowPower);
  const [gpu, setGpu] = useState<'unknown' | 'yes' | 'no'>('unknown');
  const [failed, setFailed] = useState(false);
  const [visible, setVisible] = useState(true);
  const [palette, setPalette] = useState<ShaderPalette | null>(null);
  const [ready, setReady] = useState(false);

  // is WebGPU really there? (the property can exist while no adapter does)
  useEffect(() => {
    if (!owner || gpu !== 'unknown') return;
    let cancelled = false;
    probeWebGpu().then((ok) => {
      if (!cancelled) setGpu(ok ? 'yes' : 'no');
    });
    return () => {
      cancelled = true;
    };
  }, [owner, gpu]);

  const live = owner && gpu === 'yes' && !failed;

  // hidden tab or off-screen: let the scene go
  useEffect(() => {
    if (!live) return;
    const host = hostRef.current;
    let onScreen = true;
    const update = () => setVisible(onScreen && !document.hidden);
    document.addEventListener('visibilitychange', update);
    let io: IntersectionObserver | undefined;
    if (host && typeof IntersectionObserver === 'function') {
      io = new IntersectionObserver((entries) => {
        const last = entries[entries.length - 1];
        if (last) {
          onScreen = last.isIntersecting;
          update();
        }
      });
      io.observe(host);
    }
    update();
    return () => {
      document.removeEventListener('visibilitychange', update);
      io?.disconnect();
    };
  }, [live, hostRef]);

  // role colours, re-read when the skin or the mode change
  useEffect(() => {
    if (!live) return;
    const host = hostRef.current;
    if (!host) return;
    const read = () => setPalette(resolvePalette(host));
    read();
    const mo = new MutationObserver(read);
    mo.observe(document.documentElement, {
      attributes: true,
      attributeFilter: ['data-theme', 'data-skin', 'class', 'style'],
    });
    const scheme =
      typeof window.matchMedia === 'function'
        ? window.matchMedia('(prefers-color-scheme: dark)')
        : null;
    scheme?.addEventListener('change', read);
    return () => {
      mo.disconnect();
      scheme?.removeEventListener('change', read);
    };
  }, [live, hostRef]);

  const mountScene = live && visible && palette !== null;
  // the canvas is gone with the scene: the next one fades in afresh
  // (React's "adjust state while rendering" pattern, not an effect)
  const [hadScene, setHadScene] = useState(false);
  if (hadScene !== mountScene) {
    setHadScene(mountScene);
    if (!mountScene) setReady(false);
  }

  const onReady = useCallback(() => setReady(true), []);
  const fail = useCallback(() => setFailed(true), []);

  let view: ShaderView;
  if (solid) view = 'solid';
  else if (reducedMotion || lowPower || !owner) view = 'static';
  else if (gpu === 'no' || failed) view = 'unavailable';
  else view = 'live';

  return { view, mountScene: view === 'live' && mountScene, palette, ready, onReady, fail };
}

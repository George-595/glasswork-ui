import { cssVar } from '@apps/colors';
import {
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
  type Ref,
  useCallback,
  useEffect,
  useId,
  useState,
} from 'react';
import { type GlassMode, useGlassEnvironment } from './environment';
import type { MaterialMaps } from './maps';
import type { GlassAppearance, MapGeometry } from './optics';

/* LiquidGlass — Glass HQ's Liquid Glass on one element (MIT; see
   THIRD_PARTY_NOTICES.md). In the glass skin on Chromium the element's
   backdrop goes through the upstream material graph as an SVG
   backdrop-filter: frost, refraction by the displacement field, tone curve.
   The specular rim and highlight paint over it, then the element's own
   content, which no filter ever touches: text is never distorted.

   Colour: roles only. The fill is a surface role (surface, raised, overlay, bar); the rim
   is two alpha masks painted in the `lens-light` and `lens-shade` effects (liquid-glass.css).

   AA: the role fill (surface, raised, overlay, bar) still sits under
   the content. It thins only across the outer `band` pixels, where the rim
   refracts; keep text further in than `band` (card padding is 16px). Every
   other mode leaves the element exactly as its own CSS draws it. */

export type GlassFill = 'surface' | 'raised' | 'overlay' | 'bar';
export type GlassMaterialName = 'regular' | 'clear';

export interface LiquidGlassOptions {
  /** Displacement travel at the rim in CSS px. Upstream's default is 60. */
  refraction?: number;
  /** `regular` frosts the backdrop (upstream's regular material); `clear`
      refracts it unblurred, the strongest-looking lens. */
  material?: GlassMaterialName;
  /** The fill token drawn under the content. */
  fill?: GlassFill;
  /** Rim band, CSS px, across which the fill thins so the refraction shows. */
  band?: number;
  /** Fill left at the very rim, 0..1 of the token fill. */
  rimFill?: number;
  /** Refract at all. Default true. False keeps the surface on the plain translucent fill in
      every environment: for a surface that scrolls with the page, or sits in a long list,
      where a moving SVG filter costs a re-run of the filter every scrolled frame. */
  lens?: boolean;
}

interface Size {
  width: number;
  height: number;
  radius: number;
  dpr: number;
}

export interface LiquidGlassBinding<T extends HTMLElement> {
  /** Attach to the glass element. */
  ref: (element: T | null) => void;
  mode: GlassMode;
  /** Spread on the glass element (merge className and style with your own). */
  props: { className: string; 'data-lg': GlassMode; style?: CSSProperties };
  /** Render as children of the glass element (anywhere; they sit beneath). */
  layers: ReactNode;
}

const sameSize = (a: Size | null, b: Size) =>
  a !== null &&
  a.width === b.width &&
  a.height === b.height &&
  a.radius === b.radius &&
  a.dpr === b.dpr;

function measure(element: HTMLElement, width: number, height: number): Size {
  const w = Math.max(1, Math.round(width));
  const h = Math.max(1, Math.round(height));
  const radius = Number.parseFloat(getComputedStyle(element).borderTopLeftRadius) || 0;
  return {
    width: w,
    height: h,
    radius: Math.round(Math.min(radius, w / 2, h / 2)),
    dpr: Math.min(2, Math.max(1, Math.round((window.devicePixelRatio || 1) * 4) / 4)),
  };
}

type Refraction = typeof import('./refraction');

/** `materials.regular.refraction` (optics.ts), kept here so the hook does not import the optics. A test holds them equal. */
export const DEFAULT_REFRACTION = 60;

/* The refraction machinery (optics, the map worker, PNG encoding and the SVG filter) is fetched the first
   time a surface refracts: a fine pointer, at most 2x, not low power (rule 2). The server and the first client
   render never refract, so nothing here can mismatch; until it arrives, or if it cannot be fetched, the
   surface stays on the CSS blur material (`mode: 'blur'`, no layers), which is what it shows before its maps exist. */
let refractionModule: Refraction | null = null;
let refractionLoad: Promise<Refraction> | null = null;
function loadRefraction(): Promise<Refraction> {
  refractionLoad ??= import('./refraction').then(
    (m) => {
      refractionModule = m;
      return m;
    },
    (error: unknown) => {
      refractionLoad = null;
      throw error;
    },
  );
  return refractionLoad;
}

export function useLiquidGlass<T extends HTMLElement = HTMLElement>(
  options: LiquidGlassOptions = {},
): LiquidGlassBinding<T> {
  const {
    refraction = DEFAULT_REFRACTION,
    material = 'clear',
    fill = 'surface',
    band = 14,
    rimFill = 0.65,
    lens = true,
  } = options;
  const env = useGlassEnvironment();
  const refracting = env.mode === 'refract' && lens;
  const [element, setElement] = useState<T | null>(null);
  const [size, setSize] = useState<Size | null>(null);
  // The last maps fetched; maps already cached for the current size are
  // read during render instead (peekMaterialMaps).
  const [lastMaps, setMaps] = useState<MaterialMaps | null>(null);
  const [refr, setRefr] = useState<Refraction | null>(refractionModule);
  const filterId = `ui-lg-${useId().replace(/[^\w-]/g, '')}`;

  useEffect(() => {
    if (!refracting || refr) return;
    let live = true;
    loadRefraction().then(
      (m) => {
        if (live) setRefr(m);
      },
      () => {
        /* stays on the blur material; the next surface to mount tries the fetch again */
      },
    );
    return () => {
      live = false;
    };
  }, [refracting, refr]);

  // Size: a ResizeObserver while refracting, settled for 120ms before maps
  // are made, so a resize animation stretches the last maps meanwhile.
  useEffect(() => {
    if (!element || !refracting) return;
    let timer: ReturnType<typeof setTimeout> | undefined;
    const update = (width: number, height: number, immediate: boolean) => {
      const next = measure(element, width, height);
      const apply = () => setSize((prev) => (sameSize(prev, next) ? prev : next));
      clearTimeout(timer);
      if (immediate) apply();
      else timer = setTimeout(apply, 120);
    };
    const box = element.getBoundingClientRect();
    update(element.offsetWidth || box.width, element.offsetHeight || box.height, true);
    let first = true;
    const observer = new ResizeObserver((entries) => {
      const entry = entries[0];
      if (!entry) return;
      const border = entry.borderBoxSize?.[0];
      const width = border ? border.inlineSize : entry.contentRect.width;
      const height = border ? border.blockSize : entry.contentRect.height;
      update(width, height, first);
      first = false;
    });
    observer.observe(element);
    return () => {
      clearTimeout(timer);
      observer.disconnect();
    };
  }, [element, refracting]);

  // Maps: cached per geometry; a new size keeps showing the old maps until
  // its own are ready.
  const appearance: GlassAppearance = env.appearance;
  // sized in buckets (maps.ts): the maps are stretched to the real size
  const geometry: MapGeometry | null =
    refr && refracting && size ? refr.bucketGeometry({ ...size, appearance, band, rimFill }) : null;
  const ready = refr && geometry ? refr.peekMaterialMaps(geometry) : undefined;
  useEffect(() => {
    if (!refr || !refracting || !size || ready) return;
    let live = true;
    refr.getMaterialMaps(refr.bucketGeometry({ ...size, appearance, band, rimFill })).then(
      (next) => {
        if (live) setMaps(next);
      },
      () => {
        if (live) setMaps(null);
      },
    );
    return () => {
      live = false;
    };
  }, [refr, refracting, size, ready, appearance, band, rimFill]);

  const ref = useCallback((node: T | null) => setElement(node), []);
  const maps = ready ?? lastMaps;
  const active = refr !== null && refracting && maps !== null && size !== null;
  // Until the maps exist a refracting surface shows the CSS blur material.
  const mode: GlassMode = env.mode === 'refract' && !active ? 'blur' : env.mode;

  if (!active || !refr || !maps || !size) {
    return { ref, mode, props: { className: 'ui-lg', 'data-lg': mode }, layers: null };
  }

  const backdrop = `url("#${filterId}")`;
  return {
    ref,
    mode,
    props: {
      className: 'ui-lg',
      'data-lg': mode,
      style: {
        backdropFilter: backdrop,
        WebkitBackdropFilter: backdrop,
        ['--lg-fill' as string]: cssVar(fill),
      },
    },
    layers: (
      <refr.RefractionLayers
        filterId={filterId}
        maps={maps}
        width={size.width}
        height={size.height}
        refraction={refraction}
        material={material}
        appearance={appearance}
      />
    ),
  };
}

type GlassTag = 'div' | 'section' | 'aside' | 'header' | 'nav' | 'article' | 'footer' | 'main';

export interface LiquidGlassProps extends HTMLAttributes<HTMLElement>, LiquidGlassOptions {
  as?: GlassTag;
  ref?: Ref<HTMLElement>;
}

/** An element with the Liquid Glass backdrop; a plain element outside the
    glass skin. Give it the surface class it replaces (e.g. ui-card). */
export function LiquidGlass({
  as: Tag = 'div',
  refraction,
  material,
  fill,
  band,
  rimFill,
  lens,
  className,
  style,
  children,
  ref,
  ...rest
}: LiquidGlassProps) {
  const glass = useLiquidGlass<HTMLElement>({ refraction, material, fill, band, rimFill, lens });
  const setRef = glass.ref;
  const merged = useCallback(
    (node: HTMLElement | null) => {
      setRef(node);
      if (typeof ref === 'function') ref(node);
      else if (ref) ref.current = node;
    },
    [setRef, ref],
  );
  return (
    <Tag
      {...rest}
      ref={merged}
      data-lg={glass.props['data-lg']}
      className={className ? `${glass.props.className} ${className}` : glass.props.className}
      style={glass.props.style ? { ...style, ...glass.props.style } : style}
    >
      {glass.layers}
      {children}
    </Tag>
  );
}

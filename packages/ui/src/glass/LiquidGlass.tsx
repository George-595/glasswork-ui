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
import { bucketGeometry, getMaterialMaps, type MaterialMaps, peekMaterialMaps } from './maps';
import { type GlassAppearance, type MapGeometry, materials, toneTable } from './optics';

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

export function useLiquidGlass<T extends HTMLElement = HTMLElement>(
  options: LiquidGlassOptions = {},
): LiquidGlassBinding<T> {
  const {
    refraction = materials.regular.refraction,
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
  const filterId = `ui-lg-${useId().replace(/[^\w-]/g, '')}`;

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
    refracting && size ? bucketGeometry({ ...size, appearance, band, rimFill }) : null;
  const ready = geometry ? peekMaterialMaps(geometry) : undefined;
  useEffect(() => {
    if (!refracting || !size || ready) return;
    let live = true;
    getMaterialMaps(bucketGeometry({ ...size, appearance, band, rimFill })).then(
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
  }, [refracting, size, ready, appearance, band, rimFill]);

  const ref = useCallback((node: T | null) => setElement(node), []);
  const maps = ready ?? lastMaps;
  const active = refracting && maps !== null && size !== null;
  // Until the maps exist a refracting surface shows the CSS blur material.
  const mode: GlassMode = env.mode === 'refract' && !active ? 'blur' : env.mode;

  if (!active || !maps || !size) {
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
      <>
        <svg className="ui-lg-defs" aria-hidden="true" focusable="false" width="0" height="0">
          <GlassFilter
            id={filterId}
            maps={maps}
            width={size.width}
            height={size.height}
            refraction={refraction}
            material={material}
            appearance={appearance}
          />
        </svg>
        <span
          className="ui-lg-layer ui-lg-fill"
          aria-hidden="true"
          style={{ maskImage: `url("${maps.body}")`, WebkitMaskImage: `url("${maps.body}")` }}
        />
        <span
          className="ui-lg-layer ui-lg-shade"
          aria-hidden="true"
          style={{ maskImage: `url("${maps.shade}")`, WebkitMaskImage: `url("${maps.shade}")` }}
        />
        <span
          className="ui-lg-layer ui-lg-light"
          aria-hidden="true"
          style={{
            maskImage: `url("${maps.highlight}")`,
            WebkitMaskImage: `url("${maps.highlight}")`,
          }}
        />
      </>
    ),
  };
}

interface GlassFilterProps {
  id: string;
  maps: MaterialMaps;
  width: number;
  height: number;
  refraction: number;
  material: GlassMaterialName;
  appearance: GlassAppearance;
}

/** The material graph of upstream's src/dom/lens-layers.ts and
    material-graph.ts (frostMarkup, toneMarkup), as React SVG, reading the
    element's backdrop as SourceGraphic. */
export function GlassFilter({
  id,
  maps,
  width,
  height,
  refraction,
  material,
  appearance,
}: GlassFilterProps) {
  const dark = appearance === 'dark';
  const spec = materials.regular[appearance];
  const region = { x: 0, y: 0, width, height };
  let input = 'SourceGraphic';
  const frost: ReactNode[] = [];
  if (material === 'regular') {
    input = 'mix';
    frost.push(
      <feGaussianBlur
        key="frost"
        in="SourceGraphic"
        stdDeviation={materials.regular.blur}
        result="frost"
      />,
      <feGaussianBlur key="fill" in="SourceGraphic" stdDeviation={spec.fillSigma} result="fill" />,
      <feBlend
        key="blend"
        in="frost"
        in2="fill"
        mode={dark ? 'darken' : 'lighten'}
        result="blend"
      />,
      <feComposite
        key="mix"
        in="blend"
        in2="frost"
        operator="arithmetic"
        k2={spec.fillOpacity}
        k3={1 - spec.fillOpacity}
        result="mix"
      />,
    );
  }
  const table = material === 'regular' ? toneTable(appearance) : clearToneTable(appearance);
  return (
    <filter
      id={id}
      {...region}
      filterUnits="userSpaceOnUse"
      primitiveUnits="userSpaceOnUse"
      colorInterpolationFilters="sRGB"
    >
      <feImage
        href={maps.field}
        x={-2}
        y={-2}
        width={width + 4}
        height={height + 4}
        preserveAspectRatio="none"
        result="field"
      />
      {frost}
      <feDisplacementMap
        in={input}
        in2="field"
        scale={2 * refraction}
        xChannelSelector="R"
        yChannelSelector="G"
        result="refracted"
      />
      <feComponentTransfer in="refracted" result="tone">
        <feFuncR type="table" tableValues={table} />
        <feFuncG type="table" tableValues={table} />
        <feFuncB type="table" tableValues={table} />
      </feComponentTransfer>
      <feColorMatrix
        in="tone"
        type="saturate"
        values={String(material === 'regular' ? spec.tone[3] : 1)}
        result="color"
      />
      <feComposite in="color" in2="field" operator="in" />
    </filter>
  );
}

/** Upstream's clear-material tone (toneMarkup's second branch, not nested). */
function clearToneTable(appearance: GlassAppearance): string {
  const dark = appearance === 'dark';
  const spec = dark
    ? { shadowLift: 0.15, highlightRolloff: 0.2 }
    : { shadowLift: 0.18, highlightRolloff: 0 };
  return Array.from({ length: 33 }, (_, n) => {
    const v = n / 32;
    const tone = v + spec.shadowLift * (1 - v) ** 3 - spec.highlightRolloff * v ** 3;
    const tinted = dark ? 0.38 * v + 0.2 : 0.78 * v + 0.26;
    const weight = dark ? 0.14 : 0.06;
    return Number(Math.max(0, Math.min(1, (1 - weight) * tone + weight * tinted)).toFixed(4));
  }).join(' ');
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

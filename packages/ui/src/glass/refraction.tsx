import type { ReactNode } from 'react';
import type { GlassMaterialName } from './LiquidGlass';
import type { MaterialMaps } from './maps';
import { type GlassAppearance, materials, toneTable } from './optics';

/* The refraction machinery of LiquidGlass, fetched the first time a surface refracts (LiquidGlass.tsx:
   loadRefraction). It holds everything that is used only while `env.mode === 'refract'`: the optics, the maps
   (and so the worker and the PNG encoder), the SVG material graph and the tone tables. */

export { bucketGeometry, getMaterialMaps, peekMaterialMaps } from './maps';

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

interface RefractionLayersProps extends Omit<GlassFilterProps, 'id'> {
  filterId: string;
}

/** What a refracting surface renders beneath its content: the SVG material graph and the three mask layers. */
export function RefractionLayers({ filterId, ...filter }: RefractionLayersProps) {
  const { maps } = filter;
  return (
    <>
      <svg className="ui-lg-defs" aria-hidden="true" focusable="false" width="0" height="0">
        <GlassFilter id={filterId} {...filter} />
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
  );
}

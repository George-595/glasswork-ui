import { LiquidMetal, MeshGradient, Ripples, Shader, SimplexNoise } from 'shaders/react';
import type { ShaderPalette } from './palette';
import type { ShaderPreset } from './presets';

/* ShaderScene — the one file that imports the `shaders` package. It is only
   ever reached through a dynamic import() from ShaderBackdrop / ShaderAccent,
   so the package (and typegpu under it) is a separate chunk that an
   enterprise-skin page never downloads.

   Calm by construction: every speed is a fraction of the package default,
   every colour is a shader-* role, already mixed toward the page colour, and the
   colour space is plain sRGB so the tokens come out as written. Telemetry is
   off: the package would otherwise report usage to shaders.com, and nothing
   leaves this app.

   Tuning notes (not verified in a browser when written): `speed`, `drift`,
   `warp` and `turbulence` are the knobs for how busy a preset feels; the
   colours are tuned in @apps/colors (`MAX_TINT`, roles.ts) and the scrim role. */
export interface ShaderSceneProps {
  preset: ShaderPreset;
  palette: ShaderPalette;
  /** Called when the first frame has been drawn: the canvas can fade in. */
  onReady?: () => void;
  /** This browser or GPU cannot run the shader after all. */
  onUnavailable?: () => void;
  className?: string;
}

function Layers({ preset, palette }: Pick<ShaderSceneProps, 'preset' | 'palette'>) {
  switch (preset) {
    case 'mesh':
      return (
        <MeshGradient
          colorA={palette.a}
          colorB={palette.b}
          // the package's default stops (a five-colour sunset) win over colorA/colorB,
          // so the role tints go in as stops too. No page-colour stop: the roles are
          // already mixed toward it, and a dark stop reads as a smudge in an accent
          stops={[
            { color: palette.a, position: 0 },
            { color: palette.c, position: 0.5 },
            { color: palette.b, position: 1 },
          ]}
          colorSpace="srgb"
          count={4}
          smoothness={2.4}
          variation={0.2}
          swirl={0.12}
          drift={0.35}
          speed={0.25}
        />
      );
    case 'liquid-metal':
      return (
        <LiquidMetal
          lightColor={palette.b}
          darkColor={palette.dark ? palette.bg : palette.a}
          // the scene is a sphere (radius 0.35 of the view); at this scale it
          // overfills the viewport, so the backdrop reads as a flowing surface
          scale={4.2}
          turbulence={0.5}
          ripple={2}
          warp={0.8}
          sharpness={0.25}
          bevelWidth={0}
          speed={0.1}
        />
      );
    case 'aurora-noise':
      return (
        <SimplexNoise
          colorA={palette.bg}
          colorB={palette.c}
          colorSpace="srgb"
          scale={1.2}
          contrast={-0.3}
          speed={0.12}
        />
      );
    case 'glass-caustics':
      return (
        <Ripples
          colorA={palette.b}
          colorB={palette.bg}
          center={{ x: 0.8, y: 0.12 }}
          frequency={6}
          softness={1}
          thickness={0.5}
          speed={0.15}
        />
      );
  }
}

export default function ShaderScene({
  preset,
  palette,
  onReady,
  onUnavailable,
  className,
}: ShaderSceneProps) {
  return (
    <Shader
      className={className}
      colorSpace="srgb"
      disableTelemetry
      onReady={onReady}
      onUnavailable={onUnavailable}
    >
      <Layers preset={preset} palette={palette} />
    </Shader>
  );
}

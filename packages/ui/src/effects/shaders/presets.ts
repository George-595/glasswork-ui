import type { BackgroundVariant } from '../AnimatedBackground';

/* The four curated presets. Each names real components from the `shaders`
   package (https://github.com/shader-effects-inc/shaders, MIT); the layer
   trees live in ShaderScene.tsx, which is the only file that imports the
   package, so it is the only thing the lazy chunk pulls in.

     mesh            MeshGradient    slow drifting colour field
     liquid-metal    LiquidMetal     soft metallic flow, tinted not chrome
     aurora-noise    SimplexNoise    soft cloud/fog of two tints
     glass-caustics  Ripples         wide, soft rings like light through glass
*/
export const SHADER_PRESETS = ['mesh', 'liquid-metal', 'aurora-noise', 'glass-caustics'] as const;
export type ShaderPreset = (typeof SHADER_PRESETS)[number];

export function isShaderPreset(value: unknown): value is ShaderPreset {
  return typeof value === 'string' && (SHADER_PRESETS as readonly string[]).includes(value);
}

/** What `fallback="animated"` shows (the kit's AnimatedBackground) for each preset. */
export const FALLBACK_VARIANT: Record<ShaderPreset, BackgroundVariant> = {
  mesh: 'hive',
  'liquid-metal': 'hive',
  'aurora-noise': 'tide',
  'glass-caustics': 'tide',
};

/** Human names, for a settings picker. */
export const PRESET_LABELS: Record<ShaderPreset, string> = {
  mesh: 'Mesh gradient',
  'liquid-metal': 'Liquid metal',
  'aurora-noise': 'Soft noise',
  'glass-caustics': 'Glass caustics',
};

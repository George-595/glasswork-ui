/* The kit's effects: the glass backdrops, the pointer light, the rolling figure, the
   generation reveal and the shader pieces. Styles: src/styles/effects.css. */
export {
  AnimatedBackground,
  type AnimatedBackgroundProps,
  type BackgroundVariant,
} from './AnimatedBackground';
export { Generate, type GenerateProps } from './generate/Generate.tsx';
export {
  type GenerateMode,
  type GenerateOptions,
  type GenerateRender,
  type GenerateRun,
  generate,
  skipAllGenerations,
} from './generate/reveal';
export { type UseGenerateOptions, useGenerate } from './generate/useGenerate';
export {
  isLowPower,
  type PowerPreference,
  type PowerSignals,
  readPowerSignals,
  setPowerPreference,
  useLowPower,
} from './lowPower';
export { PointerLight, type PointerLightProps } from './PointerLight';
export { RollingNumber, type RollingNumberProps } from './RollingNumber';
export { PRESET_LABELS, SHADER_PRESETS, type ShaderPreset } from './shaders/presets';
export { ShaderAccent, type ShaderAccentProps } from './shaders/ShaderAccent';
export { ShaderBackdrop, type ShaderBackdropProps } from './shaders/ShaderBackdrop';
export { ShaderHero, type ShaderHeroProps } from './shaders/ShaderHero';
export {
  BACKDROPS,
  type Backdrop,
  DEFAULT_BACKDROP,
  setBackdrop,
  useBackdrop,
} from './useBackdrop';
export { useReducedMotion } from './useReducedMotion';

import { type HTMLAttributes, useRef } from 'react';
import { cx } from '../../lib/cx';
import { AnimatedBackground } from '../AnimatedBackground';
import { withVars } from '../cssVars';
import { PRIORITY_BACKDROP } from './guard';
import { intensityOpacity } from './palette';
import { FALLBACK_VARIANT, type ShaderPreset } from './presets';
import { SceneSlot } from './SceneSlot';
import { useShaderStage } from './useShaderStage';

/* ShaderBackdrop — a WebGPU shader behind the page (glass skin), from the
   `shaders` package. Decorative, calm, and never the only thing standing
   between a reader and the page:

   - aria-hidden, inert, pointer-events none, fixed behind the content
     (z-index -1, like AnimatedBackground; effects.css).
   - Lazy: the package is a dynamic import, fetched only once a WebGPU adapter
     has been confirmed. Enterprise-skin pages never load it.
   - Fallbacks, in order: reduced transparency → the plain page colour;
     reduced motion, a second instance, SSR, the probe in flight → the static
     token gradient; no `navigator.gpu`, no adapter, a thrown error →
     `fallback` ('animated' = AnimatedBackground, the WebGL scene; 'static' =
     the gradient).
   - One GPU context per page (guard.ts): the first backdrop owns it, any
     other ShaderBackdrop or ShaderAccent draws its static gradient.
   - Paused (the scene is unmounted) while the tab is hidden or the element is
     off screen.
   - Text contrast: the shader-* roles are already mixed toward the page colour
     (@apps/colors, gate-checked) and the `shader-scrim` role is laid over the
     canvas (effects.css), so the busiest frame stays inside 4.5:1 for text
     sitting straight on the page. */
export interface ShaderBackdropProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  /** Which curated preset. Default 'mesh'. */
  preset?: ShaderPreset;
  /** 0–1: the canvas opacity, i.e. how much colour the scene carries. Default 0.6. */
  intensity?: number;
  /** What to draw when the GPU cannot. 'animated' (default): AnimatedBackground. 'static': the gradient. */
  fallback?: 'animated' | 'static';
}

export function ShaderBackdrop({
  preset = 'mesh',
  intensity = 0.6,
  fallback = 'animated',
  className,
  ...props
}: ShaderBackdropProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useShaderStage(PRIORITY_BACKDROP, ref);

  if (stage.view === 'unavailable' && fallback === 'animated') {
    return <AnimatedBackground className={className} variant={FALLBACK_VARIANT[preset]} />;
  }

  return (
    <div
      {...props}
      ref={ref}
      style={withVars(props.style, { '--ui-shader-intensity': intensityOpacity(intensity) })}
      aria-hidden="true"
      inert
      className={cx('ui-shader', className)}
      data-preset={preset}
      data-view={stage.view === 'unavailable' ? 'static' : stage.view}
      data-live={stage.ready || undefined}
    >
      {stage.mountScene && stage.palette && (
        <SceneSlot stage={stage} preset={preset} palette={stage.palette} />
      )}
    </div>
  );
}

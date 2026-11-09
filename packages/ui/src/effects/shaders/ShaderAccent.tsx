import { type HTMLAttributes, useRef } from 'react';
import { cx } from '../../lib/cx';
import { withVars } from '../cssVars';
import { PRIORITY_ACCENT } from './guard';
import { intensityOpacity } from './palette';
import type { ShaderPreset } from './presets';
import { SceneSlot } from './SceneSlot';
import { useShaderStage } from './useShaderStage';

/* ShaderAccent — a small, bounded shader behind a card or hero: a soft glow
   that fades out toward the edges. Optional and subtle.

     <div className="ui-shader-host">
       <ShaderAccent />
       …the content…
     </div>

   `.ui-shader-host` is `position: relative; isolation: isolate`, which is
   what lets the accent sit at z-index -1 inside it, above the host's own
   background and below its content. Same guards as ShaderBackdrop (decorative,
   lazy, reduced motion/transparency, paused off screen), with one difference:
   an accent yields the GPU context to any ShaderBackdrop (guard.ts) and, like
   every other failure, then shows its CSS gradient, so it never renders
   nothing and never needs a `fallback` prop. */
export interface ShaderAccentProps
  extends Omit<HTMLAttributes<HTMLDivElement>, 'children' | 'role'> {
  /** Default 'mesh'. */
  preset?: ShaderPreset;
  /** 0–1. Default 0.5; an accent is quieter than a backdrop. */
  intensity?: number;
}

export function ShaderAccent({
  preset = 'mesh',
  intensity = 0.5,
  className,
  ...props
}: ShaderAccentProps) {
  const ref = useRef<HTMLDivElement>(null);
  const stage = useShaderStage(PRIORITY_ACCENT, ref);
  return (
    <div
      {...props}
      ref={ref}
      style={withVars(props.style, { '--ui-shader-intensity': intensityOpacity(intensity) })}
      aria-hidden="true"
      inert
      className={cx('ui-shader ui-shader-accent', className)}
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

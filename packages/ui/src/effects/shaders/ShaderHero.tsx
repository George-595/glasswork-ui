import type { HTMLAttributes } from 'react';
import { cn } from '../../lib/cn';
import type { ShaderPreset } from './presets';
import { ShaderAccent } from './ShaderAccent';

/* ShaderHero — a bounded, centred panel with a ShaderAccent glowing behind its content: a
   hero, an empty state, a call to action. It is the `.ui-shader-host` (positioned, isolated)
   the accent needs, so a page never writes that class itself.

     <ShaderHero preset="mesh" active={skin === 'glass'}>…</ShaderHero>

   `active` draws the accent (pass the glass-skin test; the enterprise skin shows none). */
export interface ShaderHeroProps extends HTMLAttributes<HTMLDivElement> {
  preset?: ShaderPreset;
  intensity?: number;
  /** Draw the accent behind the content. Default true. */
  active?: boolean;
}

export function ShaderHero({
  preset = 'mesh',
  intensity = 0.55,
  active = true,
  className,
  children,
  ...props
}: ShaderHeroProps) {
  return (
    <div
      {...props}
      className={cn(
        'ui-shader-host relative isolate grid min-h-56 place-items-center rounded-lg border border-solid border-border p-6 text-center',
        className,
      )}
    >
      {active && <ShaderAccent preset={preset} intensity={intensity} />}
      <div className="grid justify-items-center gap-2">{children}</div>
    </div>
  );
}

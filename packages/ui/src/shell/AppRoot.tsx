import { type HTMLAttributes, useEffect } from 'react';
import {
  bindPowerAttribute,
  type PowerPreference,
  setPowerPreference,
  startLagMonitor,
} from '../effects/lowPower';
import { cn } from '../lib/cn';
import { useSoundEnabled } from '../sound';

/* AppRoot — the app's root element: the page colour, the type and the skin's backdrop
   (`.ui-app`). Wrap the whole app, the sign-in page and the shell alike, in one; a page
   never writes the class itself.

   It also owns the low-power signal (effects/lowPower.ts): it mirrors it on
   <html data-power="low"> for CSS and starts the page lag monitor. `power` forces it:
   "low" for the cheap path everywhere, "normal" for the full one, "auto" (default) reads the
   device. */
export interface AppRootProps extends HTMLAttributes<HTMLDivElement> {
  power?: PowerPreference;
}

export function AppRoot({ className, power = 'auto', ...props }: AppRootProps) {
  // while sounds are on, load them on the first gesture (never at page load)
  useSoundEnabled();
  useEffect(() => {
    setPowerPreference(power);
    const unbind = bindPowerAttribute();
    startLagMonitor();
    return () => {
      unbind();
      setPowerPreference('auto');
    };
  }, [power]);
  return <div {...props} className={cn('ui-app', className)} />;
}

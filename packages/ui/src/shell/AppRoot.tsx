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
  /** A shared, always-on screen that many people tap in passing (a wall tablet): text selection, the long-press
      callout and double-tap zoom are off, so a stray touch never selects, copies or zooms. Inputs and text fields
      stay selectable. Default false. */
  kiosk?: boolean;
}

const KIOSK =
  'select-none touch-manipulation [-webkit-touch-callout:none] [&_input]:select-text [&_textarea]:select-text';

export function AppRoot({ className, power = 'auto', kiosk = false, ...props }: AppRootProps) {
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
  return (
    <div
      {...props}
      data-kiosk={kiosk || undefined}
      className={cn('ui-app', kiosk && KIOSK, className)}
    />
  );
}

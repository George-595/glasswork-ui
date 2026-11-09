import { type HTMLAttributes, useLayoutEffect, useRef } from 'react';
import { cn } from '../../lib/cn';

/* FillHeight — a column at least as tall as the room left on the screen under it, down to the
   phone's tab bar, so the children (`flex-1` ones) split that room between them: a phone Home
   whose two big actions share the screen. It is a phone idea: under 768px AppShell pads <main> by
   the tab bar's height plus 16px, and this stops 16px short of the bar to match, so the page
   ends exactly above the bar and nothing hides under it. From 768px nothing is reserved
   (`--ui-bottom-inset` is unset), so use it only inside a phone layout.

   The room is measured, not guessed, because a banner (offline, "viewing as") or the safe area
   changes it; it is measured again when the window, the visual viewport, the page's height or
   the bar's height changes. */
export interface FillHeightProps extends HTMLAttributes<HTMLDivElement> {
  /** The gap left under it (AppShell's padding under <main>'s content). Default 16. */
  reserve?: number;
}

export function FillHeight({ reserve = 16, className, ...props }: FillHeightProps) {
  const ref = useRef<HTMLDivElement>(null);
  useLayoutEffect(() => {
    const el = ref.current;
    if (!el) return;
    const fit = () => {
      const viewport = window.visualViewport?.height ?? window.innerHeight;
      const top = el.getBoundingClientRect().top + window.scrollY;
      const inset =
        Number.parseFloat(
          getComputedStyle(document.documentElement).getPropertyValue('--ui-bottom-inset'),
        ) || 0;
      el.style.minHeight = `${Math.max(0, Math.floor(viewport - top - inset - reserve))}px`;
    };
    fit();
    window.addEventListener('resize', fit);
    window.visualViewport?.addEventListener('resize', fit);
    // the tab bar publishes its height on <html> once it has mounted
    const style = new MutationObserver(fit);
    style.observe(document.documentElement, { attributes: true, attributeFilter: ['style'] });
    // a banner coming or going moves this column up or down
    let resize: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      resize = new ResizeObserver(fit);
      if (el.parentElement) resize.observe(el.parentElement);
      resize.observe(document.body);
    }
    return () => {
      window.removeEventListener('resize', fit);
      window.visualViewport?.removeEventListener('resize', fit);
      style.disconnect();
      resize?.disconnect();
    };
  }, [reserve]);
  return (
    <div {...props} ref={ref} className={cn('ui-fill-height flex min-w-0 flex-col', className)} />
  );
}

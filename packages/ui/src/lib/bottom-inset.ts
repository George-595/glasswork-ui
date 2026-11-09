import { type RefObject, useEffect } from 'react';

/* Bars that sit over the bottom of the screen (the phone tab bar, a flow's action bar, a pinned
   bulk or save bar) tell the page how much room they take, as `--ui-bottom-inset` on <html>:
   the sum of their heights, safe area included, or unset when none is showing.

   Two things read it and neither needs to know which bar is there:
   - `scroll-padding-bottom` (styles/components.css): moving focus to a control scrolls it
     clear of the bar instead of to the screen's edge, behind the bar (WCAG 2.4.11);
   - the Toaster rests above the bars instead of on them. */
const heights = new Map<symbol, number>();

function publish() {
  if (typeof document === 'undefined') return;
  let total = 0;
  for (const h of heights.values()) total += h;
  const style = document.documentElement.style;
  if (total > 0) style.setProperty('--ui-bottom-inset', `${Math.ceil(total)}px`);
  else style.removeProperty('--ui-bottom-inset');
}

/** Report this element's height as bottom chrome while it is mounted (0 when it is hidden, as
    the tab bar is from 768px). `active` false reports nothing. */
export function useBottomInset(ref: RefObject<HTMLElement | null>, active = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    const key = Symbol('bottom-inset');
    const measure = () => {
      heights.set(key, el.getBoundingClientRect().height);
      publish();
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      heights.delete(key);
      publish();
    };
  }, [ref, active]);
}

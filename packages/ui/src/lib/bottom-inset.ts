import { type RefObject, useEffect } from 'react';

/* Bars that sit over the bottom of the screen (the phone tab bar, a flow's action bar, a pinned
   bulk or save bar) tell the page how much room they take, as `--ui-bottom-inset` on <html>:
   the sum of their heights, safe area included, or unset when none is showing.

   Two things read it and neither needs to know which bar is there:
   - `scroll-padding-bottom` (styles/components.css): moving focus to a control scrolls it
     clear of the bar instead of to the screen's edge, behind the bar (WCAG 2.4.11);
   - the Toaster and the floating stack (shell/Floating.tsx) rest above the bars instead of on
     them.

   The floating stack (back to top, the main action) reports its own height the same way, as
   `--ui-float-inset`: the Toaster stacks above it, and the shell's <main> pads its end by it so
   the last row of a page can always scroll out from under the buttons. */
const registries = new Map<string, Map<symbol, number>>();

function publish(name: string) {
  if (typeof document === 'undefined') return;
  let total = 0;
  for (const h of registries.get(name)?.values() ?? []) total += h;
  const style = document.documentElement.style;
  if (total > 0) style.setProperty(name, `${Math.ceil(total)}px`);
  else style.removeProperty(name);
}

/** Report this element's height as the CSS variable `name` on <html> while it is mounted (the
    sum over every element reporting the same name; 0 while it is hidden). `active` false
    reports nothing. */
export function useInsetVar(ref: RefObject<HTMLElement | null>, name: string, active = true) {
  useEffect(() => {
    const el = ref.current;
    if (!el || !active) return;
    let heights = registries.get(name);
    if (!heights) {
      heights = new Map();
      registries.set(name, heights);
    }
    const own = heights;
    const key = Symbol(name);
    const measure = () => {
      own.set(key, el.getBoundingClientRect().height);
      publish(name);
    };
    measure();
    let ro: ResizeObserver | undefined;
    if (typeof ResizeObserver === 'function') {
      ro = new ResizeObserver(measure);
      ro.observe(el);
    }
    return () => {
      ro?.disconnect();
      own.delete(key);
      publish(name);
    };
  }, [ref, name, active]);
}

/** Report this element's height as bottom chrome while it is mounted (0 when it is hidden, as
    the tab bar is from 768px). `active` false reports nothing. */
export function useBottomInset(ref: RefObject<HTMLElement | null>, active = true) {
  useInsetVar(ref, '--ui-bottom-inset', active);
}

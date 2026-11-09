import { useCallback, useRef, useState } from 'react';

/** The exact content width of an element in px (before it is measured: `initial`). Attach
    `ref` to the element. Hand-drawn SVG charts use it so patterns are not stretched. */
export function useMeasuredWidth(initial = 480) {
  const [width, setWidth] = useState(initial);
  const observer = useRef<ResizeObserver | null>(null);
  const ref = useCallback((el: HTMLElement | null) => {
    observer.current?.disconnect();
    observer.current = null;
    if (!el || typeof ResizeObserver === 'undefined') return;
    const read = () => {
      const w = Math.floor(el.clientWidth);
      if (w > 0) setWidth(w);
    };
    read();
    observer.current = new ResizeObserver(read);
    observer.current.observe(el);
  }, []);
  return { width, ref };
}

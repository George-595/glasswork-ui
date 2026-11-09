import { type RefObject, useEffect } from 'react';

/* Touch screens. `(pointer: coarse)` is the kit's one test for "a thumb, not a mouse": the same
   media query that grows every control to a 48px target decides whether a
   field may take focus on its own. A focused text field raises the on-screen keyboard, which
   covers the bottom half of the screen (and with it the button the person came to press), so
   on a touch screen nothing grabs focus for the person: the dialog or sheet itself does, and
   they tap the field they want. With a mouse or a keyboard the first field is still focused. */
export const COARSE_POINTER = '(pointer: coarse)';

/** Is the primary pointer a finger? False where matchMedia is missing (old browsers, SSR). */
export function prefersTouch(): boolean {
  try {
    return typeof window !== 'undefined' && window.matchMedia?.(COARSE_POINTER).matches === true;
  } catch {
    return false;
  }
}

/** Focus `ref` when `active` turns true (default: on mount), unless the screen is a touch one,
    where a field that opens the keyboard on its own covers the page. Use it for the mount-time
    `ref.current?.focus()` of a sign-in field or a dialog's first input; leave error focus
    (after a failed submit) as it is: that follows a tap, and the person is typing. */
export function useInitialFocus(ref: RefObject<HTMLElement | null>, active = true) {
  // biome-ignore lint/correctness/useExhaustiveDependencies: the ref's current is read when `active` flips; a ref object is stable
  useEffect(() => {
    if (!active || prefersTouch()) return;
    ref.current?.focus();
  }, [active]);
}

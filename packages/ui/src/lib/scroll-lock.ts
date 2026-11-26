/* lockPageScroll — stops the page behind a modal from scrolling while it is open.
   A modal <dialog> makes the page inert but does not stop it scrolling: on iOS a swipe that
   reaches the end of the dialog's own scroller (or lands on the scrim) scrolls the page
   underneath instead. Hiding the root's overflow stops that without moving the page (its
   scroll position is kept), and the counter lets dialogs stack. Returns the unlock. */
let locks = 0;
let saved: { overflow: string; overscroll: string } | null = null;

export function lockPageScroll(): () => void {
  if (typeof document === 'undefined') return () => {};
  const root = document.documentElement;
  if (locks === 0) {
    saved = { overflow: root.style.overflow, overscroll: root.style.overscrollBehavior };
    root.style.overflow = 'hidden';
    root.style.overscrollBehavior = 'none';
  }
  locks += 1;
  let released = false;
  return () => {
    if (released) return;
    released = true;
    locks -= 1;
    if (locks === 0 && saved) {
      root.style.overflow = saved.overflow;
      root.style.overscrollBehavior = saved.overscroll;
      saved = null;
    }
  };
}

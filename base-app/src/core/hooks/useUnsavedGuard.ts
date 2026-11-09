import { useCallback, useEffect, useState } from 'react';
import { isAppHref, navigate } from '../router/path';

/* Stops a reader losing edits by accident, without touching the shell.

   - Closing or reloading the tab: a `beforeunload` handler asks the browser's
     own "Leave site?" question while `dirty` is true.
   - Following a link to another page of the app: the sidebar, the user menu and
     in-page links are plain `<a href="/…">`, so one capturing click listener
     sees them first. While `dirty` it cancels the click and remembers where it
     was going (`pending`); the page asks "Leave without saving?" with a
     ConfirmDialog, and `proceed()` goes on to that address, `stay()` drops it.

   What it does not catch: the browser's Back and Forward buttons, and anything
   that calls `navigate()` from script. Those change the route without a
   click we can cancel, so they are not guarded. */
export function useUnsavedGuard(dirty: boolean): {
  pending: string | null;
  stay: () => void;
  proceed: () => void;
} {
  const [pending, setPending] = useState<string | null>(null);

  useEffect(() => {
    if (!dirty) return;
    const onBeforeUnload = (e: BeforeUnloadEvent) => {
      e.preventDefault();
      // Some browsers still need a return value to show the prompt.
      e.returnValue = '';
    };
    window.addEventListener('beforeunload', onBeforeUnload);
    return () => window.removeEventListener('beforeunload', onBeforeUnload);
  }, [dirty]);

  useEffect(() => {
    if (!dirty) return;
    const onClick = (e: MouseEvent) => {
      if (e.defaultPrevented || e.button !== 0) return;
      if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
      const anchor = (e.target as Element | null)?.closest?.('a[href]');
      if (!(anchor instanceof HTMLAnchorElement)) return;
      if (anchor.target && anchor.target !== '_self') return;
      const href = anchor.getAttribute('href') ?? '';
      // Only pages of the app count. '#main' (the skip link) stays on this page, and so does
      // the address already showing.
      if (!isAppHref(href)) return;
      if (href === `${window.location.pathname}${window.location.search}`) return;
      e.preventDefault();
      e.stopPropagation();
      setPending(href);
    };
    document.addEventListener('click', onClick, true);
    return () => document.removeEventListener('click', onClick, true);
  }, [dirty]);

  const stay = useCallback(() => setPending(null), []);
  const proceed = useCallback(() => {
    if (pending === null) return;
    const href = pending;
    setPending(null);
    navigate(href);
  }, [pending]);

  return { pending, stay, proceed };
}

import type { ComponentPropsWithRef, JSX, MouseEvent } from 'react';
import { hrefFor, isAppHref, navigate } from './path';

/* Is this a plain left click (not a new-tab, new-window or download gesture, and nobody has
   handled it yet)? Anything else keeps the browser's behaviour. */
export function isPlainLeftClick(
  event: Pick<
    MouseEvent,
    'button' | 'metaKey' | 'ctrlKey' | 'shiftKey' | 'altKey' | 'defaultPrevented'
  >,
): boolean {
  return (
    !event.defaultPrevented &&
    event.button === 0 &&
    !event.metaKey &&
    !event.ctrlKey &&
    !event.shiftKey &&
    !event.altKey
  );
}

/* A real anchor to a page of the app: it has its href (open in a new tab, copy the address, work
   without JavaScript), and a plain left click moves within the app instead of reloading it. */
export function Link({
  to,
  children,
  onClick,
  ...rest
}: { to: string } & Omit<ComponentPropsWithRef<'a'>, 'href'>): JSX.Element {
  const href = hrefFor(to);
  return (
    <a
      href={href}
      onClick={(event) => {
        onClick?.(event);
        if (!isPlainLeftClick(event) || !isAppHref(href)) return;
        if (rest.target && rest.target !== '_self') return;
        if (rest.download !== undefined) return;
        event.preventDefault();
        navigate(href);
      }}
      {...rest}
    >
      {children}
    </a>
  );
}

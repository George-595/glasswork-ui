import { createElement, type ElementType, type ReactNode } from 'react';

/* Shared by the patterns: a row's click target, and the shape of a failed load.
   Internal; not exported from the package. */

/** What happens when a row (a feed item, a quick action) is activated. Give one of:
    - `href`: a plain link;
    - `onClick`: a button;
    - `linkAs` (+ `linkProps`): your router's link component, e.g.
      `linkAs={Link} linkProps={{ to: '/audit' }}`. */
export interface TargetProps {
  href?: string;
  onClick?: () => void;
  linkAs?: ElementType;
  linkProps?: Record<string, unknown>;
}

export const hasTarget = (p: TargetProps): boolean => Boolean(p.href || p.onClick || p.linkAs);

/** The element a row's content sits in: a link, a router link, a button, or a plain div. */
export function renderTarget(p: TargetProps, className: string, children: ReactNode): ReactNode {
  if (p.linkAs) {
    return createElement(
      p.linkAs,
      { ...p.linkProps, ...(p.href ? { href: p.href } : {}), className },
      children,
    );
  }
  if (p.href) {
    return (
      <a href={p.href} className={className}>
        {children}
      </a>
    );
  }
  if (p.onClick) {
    return (
      <button type="button" onClick={p.onClick} className={className}>
        {children}
      </button>
    );
  }
  return <div className={className}>{children}</div>;
}

/** The classes of a row: a roomy target. */
export const ROW_TARGET =
  'flex w-full min-h-11 items-center gap-3 rounded-md border-0 bg-transparent px-2 py-2 text-start font-sans text-fg no-underline';
/** Added when the row is interactive: role hover and pressed, the focus ring. */
export const ROW_INTERACTIVE =
  'cursor-pointer transition-colors duration-(--dur-fast) ease-(--ease-out) hover:bg-hover active:bg-pressed motion-reduce:transition-none focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]';

/** A failed load, in the shape ErrorState takes. */
export interface LoadError {
  /** What failed to load, e.g. "transactions". Read as "Couldn't load transactions." */
  what: string;
  error: unknown;
  onRetry?: () => void;
}

import { useSyncExternalStore } from 'react';
import { Icon } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button, type ButtonProps } from './button';
import { Kbd } from './kbd';

/** True on Apple platforms, where the shortcut is spelt ⌘K rather than Ctrl K. False on the
    server: Node has a `navigator` too, but it describes the host, not the visitor. */
export function isMacLike(): boolean {
  if (typeof window === 'undefined') return false;
  return /mac|iphone|ipad|ipod/i.test(navigator.platform || navigator.userAgent || '');
}

const noopSubscribe = () => () => {};

/** isMacLike() for rendering: false on the server and while hydrating (so the markup matches),
    the visitor's platform after that. */
export function useIsMacLike(): boolean {
  return useSyncExternalStore(noopSubscribe, isMacLike, () => false);
}

/* CommandPaletteButton — the visible way in: "Search…" with the shortcut as
   Kbd chips (⌘ K on Apple platforms, Ctrl K elsewhere). Under 640px only the
   icon shows; the name stays. `variant="ghost" size="icon"` makes it a plain icon button like
   the bell's (a phone's top bar). */
export function CommandPaletteButton({ className, children, ...props }: ButtonProps) {
  const mac = useIsMacLike();
  return (
    <Button
      variant="outline"
      size="sm"
      aria-haspopup="dialog"
      aria-keyshortcuts="Control+K Meta+K"
      {...props}
      className={cn('ui-palette-button gap-2', className)}
    >
      <Icon name="search" size={props.size === 'icon' ? 18 : 14} />
      <span className="max-sm:sr-only">{children ?? 'Search…'}</span>
      <span className="inline-flex items-center gap-0.5 max-sm:hidden" aria-hidden="true">
        <Kbd>{mac ? '⌘' : 'Ctrl'}</Kbd>
        <Kbd>K</Kbd>
      </span>
    </Button>
  );
}

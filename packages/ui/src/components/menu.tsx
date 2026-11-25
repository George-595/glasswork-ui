import { type ComponentPropsWithRef, useCallback, useLayoutEffect, useRef, useState } from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import type { ButtonVariant } from './button';
import { MenuTrigger } from './menu-trigger';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useIsClient } from './ui/use-is-client';

/* Menu — the WAI-ARIA menu button pattern on Vercel's UI SDK
   (@ui-sdk/react/menu).

   The SDK gives the roles, the roving focus, Up/Down (wrapping), Home/End,
   type-ahead, Esc back to the trigger, a press outside to close, Enter or
   Space to activate any item (links included), ArrowUp on the trigger to
   open on the last item, and Tab and Shift+Tab to close it and move on from
   the trigger, as from any button. Ctrl/Cmd/Alt shortcuts pass through
   untouched.

   Non-modal, so the rest of the page is not hidden from assistive tech. In
   the glass skin the menu is a LiquidGlass panel on the --raised fill.
   `defaultOpen` renders it open without moving focus. The SDK renders the
   content in place (the browser's top layer, no portal), so an open menu is
   in the server-rendered HTML the a11y gate scans; `data-static` marks it
   until the client has hydrated, for the CSS that places it there. */
export type MenuItem =
  | {
      id: string;
      label: string;
      icon?: IconName;
      onSelect?: () => void;
      /** Renders the item as a link. */
      href?: string;
      /** A destructive action, painted in the danger colour. */
      danger?: boolean;
    }
  | { separator: true };

export interface MenuProps {
  /** The trigger's text. */
  label: string;
  icon?: IconName;
  items: readonly MenuItem[];
  /** Which trigger edge the menu lines up with. Default 'start'. */
  align?: 'start' | 'end';
  /** Render open from the start (showcase and tests); focus is not moved. */
  defaultOpen?: boolean;
  /** Show only `icon` (a 24px square button, 48px on a touch screen); `label` stays the button's accessible name.
      For dense places such as a table's row actions. Needs `icon`. */
  iconOnly?: boolean;
  /** The trigger icon's size in px. Default 15 (beside a label, or in a dense row). 18 matches the
      top bar's other icon buttons (search, the bell), for a menu that sits among them. */
  iconSize?: number;
  /** The trigger's button level. Default 'ghost'. */
  variant?: ButtonVariant;
  /** Classes for the trigger button (a SplitButton squares its inner corners). */
  triggerClassName?: string;
  className?: string;
}

/** @internal Set only by DeferredMenu, which mounts a Menu once the UI SDK menu has arrived. */
export interface MenuInternalProps {
  /** Open on the first render, as a press (focus on the menu), a key (focus on the first item) or ArrowUp (focus on the last item) would have. */
  openOnMount?: 'pointer' | 'keyboard' | 'keyboard-last';
  /** Move focus to the trigger on mount: the stand-in it replaces had it. */
  focusOnMount?: boolean;
}

const isSeparator = (item: MenuItem): item is { separator: true } => 'separator' in item;

export function Menu({
  label,
  icon,
  items,
  align = 'start',
  defaultOpen = false,
  iconOnly = false,
  iconSize = 15,
  variant,
  triggerClassName,
  className,
  openOnMount,
  focusOnMount = false,
}: MenuProps & MenuInternalProps) {
  const [open, setOpen] = useState(defaultOpen || openOnMount !== undefined);
  const client = useIsClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const pending = useRef(openOnMount); // a gesture made before the module arrived
  const glass = useLiquidGlass<HTMLDivElement>({ fill: 'raised', band: 10, refraction: 24 });
  const setGlassRef = glass.ref;
  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      content.current = node;
      setGlassRef(node);
    },
    [setGlassRef],
  );

  /* Mounted open for a gesture DeferredMenu caught: focus goes where the SDK
     would have put it for that gesture (a menu rendered open moves none). */
  useLayoutEffect(() => {
    if (focusOnMount) trigger.current?.focus();
    const mode = pending.current;
    pending.current = undefined;
    const menu = content.current;
    if (!mode || !menu) return;
    const all = menu.querySelectorAll<HTMLElement>('[role="menuitem"]');
    if (mode === 'pointer') menu.focus();
    else if (mode === 'keyboard') all[0]?.focus();
    else all[all.length - 1]?.focus();
  }, [focusOnMount]);

  return (
    <div className={cn('ui-menu-wrap relative inline-flex', className)}>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false} loop>
        <DropdownMenuTrigger
          render={
            <MenuTrigger
              ref={trigger}
              label={label}
              icon={icon}
              iconOnly={iconOnly}
              iconSize={iconSize}
              {...(variant ? { variant } : {})}
              {...(triggerClassName ? { className: triggerClassName } : {})}
            />
          }
        />
        <DropdownMenuContent
          ref={contentRef}
          align={align}
          data-align={align}
          data-static={client ? undefined : ''}
          className={cn('ui-menu min-w-[190px]', glass.props.className)}
          data-lg={glass.props['data-lg']}
          style={glass.props.style}
        >
          {glass.layers}
          {items.map((item, n) => {
            if (isSeparator(item)) {
              // biome-ignore lint/suspicious/noArrayIndexKey: separators have no id and never reorder
              return <DropdownMenuSeparator key={`sep-${n}`} className="ui-menu-separator" />;
            }
            const body = (
              <>
                {item.icon && <Icon name={item.icon} size={15} />}
                {item.label}
              </>
            );
            return (
              <DropdownMenuItem
                key={item.id}
                label={item.label}
                render={item.href ? <ItemLink href={item.href} /> : undefined}
                className={cn(
                  'ui-menu-item min-h-7 pointer-coarse:min-h-12 no-underline',
                  item.danger && 'text-danger',
                )}
                data-danger={item.danger || undefined}
                onSelect={() => {
                  item.onSelect?.();
                }}
              >
                {body}
              </DropdownMenuItem>
            );
          })}
        </DropdownMenuContent>
      </DropdownMenu>
    </div>
  );
}

/* A link item: the SDK renders the item's label and props into it */
function ItemLink({ children, ...props }: ComponentPropsWithRef<'a'>) {
  return <a {...props}>{children}</a>;
}

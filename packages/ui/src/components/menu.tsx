import { type KeyboardEvent, type PointerEvent, useCallback, useRef, useState } from 'react';
import { useLiquidGlass } from '../glass/LiquidGlass';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { Button } from './button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from './ui/dropdown-menu';
import { useIsClient } from './ui/use-is-client';

/* Menu — the WAI-ARIA menu button pattern on Radix DropdownMenu (shadcn).

   Radix gives the roles, the roving focus, Up/Down (wrapping), Home/End,
   type-ahead, Esc back to the trigger, a press outside to close, and Space
   or Enter to activate any item, links included. On top of it:
   - ArrowUp on the trigger opens on the last item;
   - Tab and Shift+Tab leave the menu (Radix would swallow Tab) and close it:
     focus goes to the control after the trigger, or back to the trigger;
   - focus leaving the menu any other way closes it without pulling focus
     back;
   - a click with no pointer press before it (assistive tech, scripts)
     toggles it too;
   - Ctrl/Cmd/Alt shortcuts pass through untouched (Radix ignores them).

   Non-modal, so the rest of the page is not hidden from assistive tech. In
   the glass skin the menu is a LiquidGlass panel on the --raised fill.
   `defaultOpen` renders it open without moving focus; on the server (and
   while hydrating) the open menu renders in place, because Radix's portal
   only mounts on the client, so it is in the static HTML the a11y gate
   scans. */
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
  className?: string;
}

const isSeparator = (item: MenuItem): item is { separator: true } => 'separator' in item;

const TABBABLE =
  'a[href],button:not([disabled]),input:not([disabled]):not([type="hidden"]),select:not([disabled]),textarea:not([disabled]),[tabindex]';

/** The control Tab reaches after `from`, skipping `skip`; `from` if none. */
function nextTabbable(from: HTMLElement, skip: HTMLElement | null): HTMLElement {
  const all = Array.from(from.ownerDocument.querySelectorAll<HTMLElement>(TABBABLE)).filter(
    (el) => el.tabIndex >= 0 && !el.closest('[hidden],[inert]') && !skip?.contains(el),
  );
  return all[all.indexOf(from) + 1] ?? from;
}

export function Menu({
  label,
  icon,
  items,
  align = 'start',
  defaultOpen = false,
  iconOnly = false,
  iconSize = 15,
  className,
}: MenuProps) {
  const [open, setOpen] = useState(defaultOpen);
  const client = useIsClient();
  const trigger = useRef<HTMLButtonElement>(null);
  const content = useRef<HTMLDivElement | null>(null);
  const quietOpen = useRef(defaultOpen); // the defaultOpen mount keeps focus where it is
  const focusLast = useRef(false);
  const keepFocus = useRef(false); // focus already moved on: do not send it back
  const pointerToggled = useRef(false);
  const glass = useLiquidGlass<HTMLDivElement>({ fill: 'raised', band: 10, refraction: 24 });
  const setGlassRef = glass.ref;
  const contentRef = useCallback(
    (node: HTMLDivElement | null) => {
      content.current = node;
      setGlassRef(node);
    },
    [setGlassRef],
  );

  const onTriggerKey = (e: KeyboardEvent<HTMLButtonElement>) => {
    if (e.key === 'ArrowUp') {
      e.preventDefault();
      focusLast.current = true;
      setOpen(true);
    }
  };
  const onTriggerPointer = (e: PointerEvent<HTMLButtonElement>) => {
    pointerToggled.current = e.button === 0 && !e.ctrlKey;
  };
  const onTriggerClick = () => {
    // Radix opens on pointerdown and on Enter/Space (which cancel the click);
    // a bare click comes from assistive tech or a script
    if (!pointerToggled.current) setOpen((o) => !o);
    pointerToggled.current = false;
  };

  const onContentKey = (e: KeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    e.preventDefault(); // Radix skips its own Tab trap once this is prevented
    const from = trigger.current;
    if (!from) return;
    keepFocus.current = true;
    setOpen(false);
    (e.shiftKey ? from : nextTabbable(from, content.current)).focus();
  };

  /* Radix's Menu.Content takes onOpenAutoFocus and DropdownMenu.Content
     passes it through, but its type leaves it out; spread so it still
     arrives. It keeps focus put for the defaultOpen mount, and lands on the
     last item after ArrowUp on the trigger. */
  const openAutoFocus: { onOpenAutoFocus: (e: Event) => void } = {
    onOpenAutoFocus: (e) => {
      if (quietOpen.current) {
        quietOpen.current = false;
        e.preventDefault();
      } else if (focusLast.current) {
        focusLast.current = false;
        e.preventDefault();
        const all = content.current?.querySelectorAll<HTMLElement>('[role="menuitem"]');
        all?.[all.length - 1]?.focus();
      }
    },
  };

  return (
    <div className={cn('ui-menu-wrap relative inline-flex', className)}>
      <DropdownMenu open={open} onOpenChange={setOpen} modal={false}>
        <DropdownMenuTrigger asChild>
          <Button
            ref={trigger}
            variant="ghost"
            size="md"
            className={
              iconOnly && icon
                ? 'size-6 min-h-6 p-0 pointer-coarse:size-12 pointer-coarse:min-h-12'
                : undefined
            }
            onKeyDown={onTriggerKey}
            onPointerDown={onTriggerPointer}
            onClick={onTriggerClick}
          >
            {icon && <Icon name={icon} size={iconSize} />}
            {iconOnly && icon ? (
              <span className="ui-sr-only">{label}</span>
            ) : (
              <>
                {label}
                <Icon name="chevron-down" size={14} />
              </>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent
          ref={contentRef}
          portal={client}
          align={align}
          loop
          data-align={align}
          data-static={client ? undefined : ''}
          className={cn('ui-menu min-w-[190px]', glass.props.className)}
          data-lg={glass.props['data-lg']}
          style={glass.props.style}
          onKeyDown={onContentKey}
          onBlur={(e) => {
            const to = e.relatedTarget;
            if (
              to instanceof Node &&
              (e.currentTarget.contains(to) || trigger.current?.contains(to))
            ) {
              return;
            }
            keepFocus.current = true;
            setOpen(false);
          }}
          {...openAutoFocus}
          onCloseAutoFocus={(e) => {
            if (keepFocus.current) e.preventDefault();
            keepFocus.current = false;
          }}
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
            const cls = cn(
              'ui-menu-item min-h-7 pointer-coarse:min-h-12 no-underline',
              item.danger && 'text-danger',
            );
            return item.href ? (
              <DropdownMenuItem
                key={item.id}
                asChild
                className={cls}
                data-danger={item.danger || undefined}
                onSelect={() => item.onSelect?.()}
              >
                <a href={item.href}>{body}</a>
              </DropdownMenuItem>
            ) : (
              <DropdownMenuItem
                key={item.id}
                className={cls}
                data-danger={item.danger || undefined}
                onSelect={() => item.onSelect?.()}
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

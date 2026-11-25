import {
  MenuCheckboxItem,
  MenuContent,
  MenuGroup,
  MenuGroupLabel,
  MenuItem,
  MenuItemIndicator,
  MenuRadioGroup,
  MenuRadioItem,
  MenuSeparator,
  MenuSub,
  MenuSubContent,
  MenuSubTrigger,
} from '@ui-sdk/react/menu';
import { type ComponentPropsWithoutRef, Fragment, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* The menus as data, shared by ContextMenu and Menubar: plain items, checkboxes, a radio
   group, submenus, group labels and rules, drawn on the SDK's menu parts (roles, roving
   focus, type-ahead and submenu keys come from @ui-sdk/react/menu).

   `shortcut` is printed at the item's end ("⌘C"); it is a hint only and binds no key, so a
   demo never steals a page's copy or paste. */
export type MenuEntry =
  | {
      type?: 'item';
      id: string;
      label: string;
      icon?: IconName;
      shortcut?: string;
      danger?: boolean;
      disabled?: boolean;
    }
  | { type: 'checkbox'; id: string; label: string; defaultChecked?: boolean; shortcut?: string }
  | {
      type: 'radio';
      id: string;
      label: string;
      defaultValue: string;
      options: readonly { value: string; label: string }[];
    }
  | { type: 'sub'; id: string; label: string; icon?: IconName; items: readonly MenuEntry[] }
  | { type: 'separator'; id: string }
  | { type: 'label'; id: string; label: string };

const surface =
  'ui-menu-surface z-50 m-0 min-w-56 overflow-hidden rounded-lg border border-solid border-border bg-overlay p-1 text-fg [box-shadow:var(--elev-3)] glass-chrome forced-colors:border-[CanvasText] origin-(--transform-origin) transition-[opacity,scale] duration-(--dur-fast) ease-(--ease-out) data-starting-style:scale-95 data-starting-style:opacity-0 data-ending-style:opacity-0 motion-reduce:transition-none';

const row =
  'relative flex min-h-8 cursor-pointer select-none items-center gap-2 rounded-sm px-2 font-sans text-[13px] text-fg outline-none pointer-coarse:min-h-12 data-highlighted:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-disabled:pointer-events-none data-disabled:text-disabled-fg';

function Hint({ children }: { children?: ReactNode }) {
  if (!children) return null;
  return (
    <span
      aria-hidden="true"
      className="ms-auto ps-4 font-mono text-[11px] tracking-wide text-fg-muted"
    >
      {children}
    </span>
  );
}

function Lead({ icon }: { icon?: IconName }) {
  return (
    <span
      aria-hidden="true"
      className="inline-flex size-4 shrink-0 items-center justify-center text-fg-muted"
    >
      {icon && <Icon name={icon} size={15} />}
    </span>
  );
}

export function MenuEntries({ items }: { items: readonly MenuEntry[] }) {
  return items.map((e) => {
    switch (e.type) {
      case 'separator':
        return <MenuSeparator key={e.id} className="-mx-1 my-1 h-px bg-border-subtle" />;
      case 'label':
        return (
          <MenuGroup key={e.id}>
            <MenuGroupLabel className="px-2 pt-1.5 pb-1 font-sans text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
              {e.label}
            </MenuGroupLabel>
          </MenuGroup>
        );
      case 'checkbox':
        return (
          <MenuCheckboxItem
            key={e.id}
            value={e.id}
            defaultChecked={e.defaultChecked}
            className={row}
          >
            <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-xs border border-solid border-border-input">
              <MenuItemIndicator className="inline-flex text-brand">
                <Icon name="check" size={12} strokeWidth={3} />
              </MenuItemIndicator>
            </span>
            {e.label}
            <Hint>{e.shortcut}</Hint>
          </MenuCheckboxItem>
        );
      case 'radio':
        return (
          <MenuRadioGroup key={e.id} defaultValue={e.defaultValue}>
            <MenuGroupLabel className="px-2 pt-1.5 pb-1 font-sans text-[11px] font-semibold tracking-wider text-fg-muted uppercase">
              {e.label}
            </MenuGroupLabel>
            {e.options.map((o) => (
              <MenuRadioItem key={o.value} value={o.value} className={row}>
                <span className="inline-flex size-4 shrink-0 items-center justify-center rounded-full border border-solid border-border-input">
                  <MenuItemIndicator className="block size-2 rounded-full bg-brand" />
                </span>
                {o.label}
              </MenuRadioItem>
            ))}
          </MenuRadioGroup>
        );
      case 'sub':
        return (
          <MenuSub key={e.id}>
            <MenuSubTrigger className={cn(row, 'data-open:bg-hover')}>
              <Lead icon={e.icon} />
              {e.label}
              <Icon name="chevron-right" size={14} className="ms-auto text-fg-muted" />
            </MenuSubTrigger>
            <MenuSubContent className={surface}>
              <MenuEntries items={e.items} />
            </MenuSubContent>
          </MenuSub>
        );
      default:
        return (
          <Fragment key={e.id}>
            <MenuItem
              value={e.id}
              disabled={e.disabled}
              className={cn(
                row,
                e.danger && 'text-danger data-highlighted:bg-danger-soft [&_.ui-icon]:text-danger',
              )}
            >
              <Lead icon={e.icon} />
              {e.label}
              <Hint>{e.shortcut}</Hint>
            </MenuItem>
          </Fragment>
        );
    }
  });
}

export function MenuSurface({
  items,
  className,
  ...props
}: { items: readonly MenuEntry[]; className?: string } & Omit<
  ComponentPropsWithoutRef<typeof MenuContent>,
  'children'
>) {
  return (
    <MenuContent className={cn(surface, className)} {...props}>
      <MenuEntries items={items} />
    </MenuContent>
  );
}

import { MenuContextTrigger, Menu as MenuRoot, MenuTrigger } from '@ui-sdk/react/menu';
import { Menubar as MenubarRoot } from '@ui-sdk/react/menubar';
import type { ReactNode } from 'react';
import { cn } from '../lib/cn';
import { type MenuEntry, MenuSurface } from './menu-parts';

export type { MenuEntry } from './menu-parts';

/* ContextMenu — the menu a right-click, a long press, Shift+F10 or the context-menu key opens
   over an area (a file, a card, a canvas), on Vercel's UI SDK menu. The area is focusable, so
   a keyboard reaches it; its `label` says what it is and that it has a menu. The menu opens
   where the pointer is, scales out from there, and right-clicking elsewhere in the area moves
   it. Items as data (MenuEntry): plain items with an icon and a printed shortcut, danger
   items, checkboxes, a radio group, submenus, labels and rules.

   `onAction` gets a plain item's id; `onCheckedChange` and `onValueChange` report checkboxes
   and radio groups. */
export interface ContextMenuProps {
  items: readonly MenuEntry[];
  /** The area. */
  children: ReactNode;
  /** Names the area for assistive tech; " (has a menu: Shift+F10)" is not added for you. */
  label: string;
  onAction?: (id: string) => void;
  onCheckedChange?: (id: string, checked: boolean) => void;
  onValueChange?: (group: string, value: string) => void;
  className?: string;
}

export function ContextMenu({
  items,
  children,
  label,
  onAction,
  onCheckedChange,
  onValueChange,
  className,
}: ContextMenuProps) {
  return (
    <MenuRoot
      loop
      onAction={(id) => onAction?.(id)}
      onCheckedChange={(checked, d) => onCheckedChange?.(String(d.value), checked)}
      onValueChange={(value, d) => onValueChange?.(String(d.group ?? ''), value)}
    >
      <MenuContextTrigger
        tabIndex={0}
        aria-label={label}
        className={cn(
          'ui-context-area relative block rounded-lg outline-none focus-visible:[box-shadow:var(--ring)] data-open:ring-2 data-open:ring-brand',
          className,
        )}
      >
        {children}
      </MenuContextTrigger>
      <MenuSurface items={items} />
    </MenuRoot>
  );
}

/* Menubar — a desktop app's row of menus (File, Edit, View), on Vercel's UI SDK menubar:
   Left/Right move between the menus (and, once one is open, open the next), Down opens one,
   every menu has the same data model as ContextMenu. The bar is a slim glass strip; the open
   menu's name sits on a pill. */
export interface MenubarMenu {
  id: string;
  label: string;
  items: readonly MenuEntry[];
}

export interface MenubarProps {
  menus: readonly MenubarMenu[];
  /** Names the bar: "Editor menu". */
  label: string;
  onAction?: (menu: string, id: string) => void;
  onCheckedChange?: (id: string, checked: boolean) => void;
  onValueChange?: (group: string, value: string) => void;
  /** Something at the bar's far end (a document title, a status). */
  end?: ReactNode;
  className?: string;
}

export function Menubar({
  menus,
  label,
  onAction,
  onCheckedChange,
  onValueChange,
  end,
  className,
}: MenubarProps) {
  return (
    <div
      className={cn(
        'ui-menubar flex min-h-10 w-full min-w-0 items-center gap-2 rounded-lg border border-solid border-border bg-surface px-1 [box-shadow:var(--elev-1)] glass-chrome',
        className,
      )}
    >
      <MenubarRoot aria-label={label} className="flex min-w-0 items-center gap-0.5 overflow-x-auto">
        {menus.map((m) => (
          <MenuRoot
            key={m.id}
            loop
            onAction={(id) => onAction?.(m.id, id)}
            onCheckedChange={(checked, d) => onCheckedChange?.(String(d.value), checked)}
            onValueChange={(value, d) => onValueChange?.(String(d.group ?? ''), value)}
          >
            <MenuTrigger className="inline-flex min-h-8 cursor-pointer items-center rounded-md border-0 bg-transparent px-3 font-sans text-[13px] font-medium text-fg outline-none pointer-coarse:min-h-12 pointer-coarse:min-w-12 hover:bg-hover focus-visible:[box-shadow:var(--ring-inset)] data-open:bg-selected">
              {m.label}
            </MenuTrigger>
            <MenuSurface items={m.items} align="start" sideOffset={6} />
          </MenuRoot>
        ))}
      </MenubarRoot>
      {end && (
        <div className="ms-auto flex min-w-0 shrink items-center gap-2 pe-2 font-sans text-[12px] text-fg-muted">
          {end}
        </div>
      )}
    </div>
  );
}

import { useRef } from 'react';
import { Icon, type IconName } from '../icons/Icon';
import { useBottomInset } from '../lib/bottom-inset';
import { cn } from '../lib/cn';

/* BottomTabBar — the phone's main navigation: 4 or 5 tabs fixed to the bottom of
   the screen, above the device's safe area. Goes in AppShell's `bottomNav` slot, which shows it
   under 768px only (the sidebar takes over from there) and pads <main> so nothing hides behind it.

   - A <nav> landmark ("Main") with a list of links; the current one carries aria-current="page"
     and a filled indicator bar above its icon, so it is never told by colour alone.
   - Every tab is a 48px+ target with an icon AND a label.
   - `dot` marks a tab that needs a look ("Out of stock"): a small dot on the icon, and the text
     joins the link's accessible name ("Packs, Out of stock").
   - It reports its height as `--ui-bottom-inset` (lib/bottom-inset.ts): focus scrolls clear of
     it (`scroll-padding-bottom`) and toasts rest above it. */
export interface BottomTab {
  id: string;
  label: string;
  icon: IconName;
  /** A hash ('#/stock') or a path. */
  href: string;
  /** Words for a needs-attention dot; absent = no dot. */
  dot?: string;
}

export interface BottomTabBarProps {
  tabs: readonly BottomTab[];
  /** id of the current tab, or null when the page belongs to none (a scan flow). */
  current: string | null;
  /** Names the landmark. Default "Main". */
  label?: string;
  /** For client-side routers: called on a plain left click instead of navigating. */
  onNavigate?: (tab: BottomTab) => void;
}

export function BottomTabBar({ tabs, current, label = 'Main', onNavigate }: BottomTabBarProps) {
  const nav = useRef<HTMLElement>(null);
  useBottomInset(nav);
  return (
    <nav
      ref={nav}
      aria-label={label}
      className={cn(
        'ui-bottom-tabs glass-chrome fixed inset-x-0 bottom-0 z-30 border-t border-solid border-border bg-bar md:hidden',
        'pb-[env(safe-area-inset-bottom)] [box-shadow:var(--glass-rim)]',
      )}
    >
      <ul className="m-0 grid h-(--bottom-nav-h,64px) list-none auto-cols-fr grid-flow-col p-0">
        {tabs.map((t) => {
          const isCurrent = t.id === current;
          return (
            <li key={t.id} className="flex min-w-0">
              <a
                href={t.href}
                aria-current={isCurrent ? 'page' : undefined}
                data-tab={t.id}
                onClick={(e) => {
                  if (!onNavigate || e.defaultPrevented || e.button !== 0) return;
                  if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                  e.preventDefault();
                  onNavigate(t);
                }}
                className={cn(
                  'ui-bottom-tab relative flex min-h-12 min-w-0 flex-1 flex-col items-center justify-center gap-1 px-1',
                  'font-sans text-[11.5px] leading-[1.2] font-medium text-fg-muted no-underline',
                  'transition-colors duration-[120ms] motion-reduce:transition-none',
                  'hover:text-fg focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
                  'aria-[current=page]:text-fg',
                  // the indicator: a filled bar at the top edge of the current tab
                  "before:absolute before:top-0 before:h-[3px] before:w-8 before:rounded-b-full before:content-['']",
                  'aria-[current=page]:before:bg-brand',
                )}
              >
                <span className="relative inline-flex">
                  <Icon name={t.icon} size={22} />
                  {t.dot && (
                    <span
                      aria-hidden="true"
                      data-dot=""
                      className="absolute -top-0.5 -right-1 size-2.5 rounded-full border-2 border-solid border-surface-solid bg-danger"
                    />
                  )}
                </span>
                <span className="max-w-full truncate">
                  {t.label}
                  {t.dot && <span className="sr-only">, {t.dot}</span>}
                </span>
              </a>
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

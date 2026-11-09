import type { ComponentType } from 'react';
import { Tooltip } from '../components/tooltip';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';

/* SectionNav + the section registry, generalised from site/apps/web/src/
   sections/. An app keeps one typed list of SectionDefs; routing and the nav
   both read it, so adding a page is one folder plus one entry.

   SectionNav renders a <nav> landmark with a list of links; the current one
   carries aria-current="page" (not colour alone). Horizontal for a top bar,
   vertical for a sidebar. */
export interface SectionDef {
  /** Stable id; also the storage-namespace convention. */
  id: string;
  /** Visible title, used by the nav and document titles. */
  title: string;
  /** Route the link points to: a hash ('#/table') or a path ('/table'). */
  href: string;
  icon?: IconName;
  /** Lazy entry point, so each section is its own chunk. */
  load?: () => Promise<{ default: ComponentType }>;
}

export interface SectionNavProps {
  sections: readonly SectionDef[];
  /** id of the current section. */
  current: string;
  /** Names the landmark; give two navs on one page different labels. */
  label?: string;
  orientation?: 'horizontal' | 'vertical';
  className?: string;
  /** For client-side routers: called on a plain left click instead of navigating. */
  onNavigate?: (section: SectionDef) => void;
  /** Show each link's title as a tooltip (hover and keyboard focus). For the sidebar's
      icon rail, where the text is visually hidden. */
  tooltips?: boolean;
}

/* shadcn's navigation-menu link look, on roles. Rest is `fg-muted`, hover `bg-hover` +
   `fg`; the current link is `bg-selected text-fg` with a `brand` indicator (a bar at the
   edge: aria-current, never colour alone). In the glass skin the current link is a glass
   pill (blur and specular rim). In the sidebar's icon rail (the shell's data-collapsed, on
   the desktop layout) the link centres on its icon and the text is visually hidden. */
const linkClasses = cn(
  'ui-nav-link relative box-border flex min-h-6 pointer-coarse:min-h-12 items-center gap-2 px-2.5 py-[5px]',
  'border border-solid border-transparent font-sans text-[13px] leading-[1.3] font-medium text-fg-muted no-underline',
  'transition-[background-color,color,border-color] duration-[120ms] motion-reduce:transition-none',
  'hover:bg-hover hover:text-fg',
  'focus-visible:outline-none focus-visible:[box-shadow:var(--ring)]',
  'aria-[current=page]:bg-selected aria-[current=page]:text-fg',
  "before:absolute before:rounded-full before:content-[''] aria-[current=page]:before:bg-brand",
  'glass:aria-[current=page]:[box-shadow:var(--glass-rim)]',
  'group-data-[collapsed]/shell:md:min-h-9 group-data-[collapsed]/shell:md:min-w-9 group-data-[collapsed]/shell:md:justify-center group-data-[collapsed]/shell:md:px-0',
);

export function SectionNav({
  sections,
  current,
  label = 'Sections',
  orientation = 'horizontal',
  className,
  onNavigate,
  tooltips = false,
}: SectionNavProps) {
  const horizontal = orientation === 'horizontal';
  return (
    <nav className={cn('ui-nav', className)} aria-label={label} data-orientation={orientation}>
      <ul
        className={cn(
          'ui-nav-list m-0 flex list-none p-0',
          horizontal ? 'flex-row flex-wrap items-center gap-1.5' : 'flex-col gap-0.5',
        )}
      >
        {sections.map((s) => {
          const link = (
            <a
              className={cn(
                linkClasses,
                horizontal
                  ? 'rounded-pill text-[12.5px] before:inset-x-3 before:bottom-0.5 before:h-0.5'
                  : 'rounded-sm before:inset-y-1.5 before:left-0 before:w-0.5',
              )}
              href={s.href}
              aria-current={s.id === current ? 'page' : undefined}
              onClick={(e) => {
                if (!onNavigate || e.defaultPrevented || e.button !== 0) return;
                if (e.metaKey || e.ctrlKey || e.shiftKey || e.altKey) return;
                e.preventDefault();
                onNavigate(s);
              }}
            >
              {s.icon && <Icon name={s.icon} size={15} />}
              <span className="ui-nav-text group-data-[collapsed]/shell:md:sr-only">{s.title}</span>
            </a>
          );
          return (
            <li
              key={s.id}
              className="group-data-[collapsed]/shell:md:flex group-data-[collapsed]/shell:md:justify-center"
            >
              {tooltips ? <Tooltip content={s.title}>{link}</Tooltip> : link}
            </li>
          );
        })}
      </ul>
    </nav>
  );
}

const isRoot = (href: string) => href === '#/' || href === '/';

/** Longest-prefix match of a location (hash or path) against the sections'
    hrefs. The section whose href is the bare root ('#/' or '/') is home and
    the fallback; throws if there is none. */
export function matchSection(sections: readonly SectionDef[], location: string): SectionDef {
  let best: SectionDef | null = null;
  for (const s of sections) {
    if (!isRoot(s.href) && location.startsWith(s.href)) {
      if (!best || s.href.length > best.href.length) best = s;
    }
  }
  if (best) return best;
  const home = sections.find((s) => isRoot(s.href));
  if (!home) throw new Error('section registry has no home ("#/" or "/") section');
  return home;
}

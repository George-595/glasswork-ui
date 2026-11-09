import {
  createContext,
  type MouseEvent as ReactMouseEvent,
  type ReactNode,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
} from 'react';
import { Button } from '../components/button';
import { AnimatedBackground } from '../effects/AnimatedBackground';
import { isShaderPreset } from '../effects/shaders/presets';
import { ShaderBackdrop } from '../effects/shaders/ShaderBackdrop';
import { type Backdrop, useBackdrop } from '../effects/useBackdrop';
import { Icon, type IconName } from '../icons/Icon';
import { cn } from '../lib/cn';
import { type SectionDef, SectionNav } from '../nav/SectionNav';
import { useDocumentSkin } from '../theme/useDocumentSkin';

/* AppShell + Sidebar + Topbar — the frame every app page sits in, ported
   from the design skill's strategies kit (ui_kits/strategies) with the a11y
   it lacked.

   - A "Skip to main content" link is the first stop in the tab order; it
     lands on <main id="main" tabIndex={-1}>.
   - From 768px up the sidebar is a column that collapses to an icon rail.
     Its toggle has aria-expanded + aria-controls; the choice is kept in
     localStorage (guarded: storage can be blocked), or owned by the app
     through `collapsed` / `onCollapsedChange` (so a keyboard shortcut can
     flip it). In the rail the link text is visually hidden, not removed, so
     every link keeps its name, and each icon gets a tooltip with it.
   - Under 768px the sidebar is an off-canvas drawer opened by the topbar's
     menu button. While it is open the rest of the page is inert, focus moves
     into it, and Esc, the close button, a scrim click or following a link
     closes it and puts focus back on the menu button. */
const COLLAPSE_KEY = 'ui-sidebar-collapsed';
const DESKTOP = '(min-width: 768px)';

/* Whether the sidebar is currently the icon rail: collapsed AND wide enough for the
   column (under 768px it is the drawer, whose links keep their full width). Without
   matchMedia (old environments) the column is assumed. */
function subscribeDesktop(onChange: () => void) {
  if (typeof window.matchMedia !== 'function') return () => {};
  const mq = window.matchMedia(DESKTOP);
  mq.addEventListener('change', onChange);
  return () => mq.removeEventListener('change', onChange);
}
const isDesktop = () =>
  typeof window.matchMedia !== 'function' || window.matchMedia(DESKTOP).matches;

interface ShellState {
  /** True while the sidebar shows only icons (collapsed, on the desktop layout). */
  rail: boolean;
  /** A bottom tab bar is present (phones): the topbar hides its drawer button. */
  hasBottomNav: boolean;
  sidebarId: string;
  drawerOpen: boolean;
  setDrawerOpen: (open: boolean) => void;
  /** Callback ref for the topbar's menu button, so closing can refocus it. */
  registerMenuButton: (el: HTMLButtonElement | null) => void;
}

const ShellContext = createContext<ShellState | null>(null);

function readCollapsed(): boolean {
  try {
    return window.localStorage.getItem(COLLAPSE_KEY) === '1';
  } catch {
    return false;
  }
}

function writeCollapsed(v: boolean) {
  try {
    window.localStorage.setItem(COLLAPSE_KEY, v ? '1' : '0');
  } catch {
    /* storage unavailable: the choice lasts for this page only */
  }
}

export interface AppShellProps {
  /** Logo and name at the top of the sidebar. */
  brand: ReactNode;
  /** Usually a <Sidebar>. */
  sidebar: ReactNode;
  /** Usually a <Topbar>. */
  topbar: ReactNode;
  /** A full-width announcement under the top bar, usually a <Banner> (maintenance mode, an
      outage). It sits outside <main>, so it never pushes against the page's heading. */
  banner?: ReactNode;
  children: ReactNode;
  /** Controlled collapse of the desktop sidebar to its icon rail. Leave unset and the
      shell keeps the choice itself (localStorage `ui-sidebar-collapsed`). */
  collapsed?: boolean;
  onCollapsedChange?: (collapsed: boolean) => void;
  /** The phone's bottom navigation, usually a <BottomTabBar> (UX K1). Shown under 768px only,
      fixed to the bottom above the safe area; <main> is padded so nothing hides behind it, and
      the topbar's drawer button is hidden while it is there (the tab bar's More is the way to
      everything else). From 768px the sidebar takes over. Leave unset on full-screen flows. */
  bottomNav?: ReactNode;
  /** The glass skin's animated backdrop: a kit scene ('tide', 'hive'), a shader
      preset ('mesh', 'liquid-metal', 'aurora-noise', 'glass-caustics'), or false for none.
      Unset: the reader's saved choice (`useBackdrop()`), which defaults to 'tide'. */
  background?: Backdrop | false;
}

export function AppShell({
  brand,
  sidebar,
  topbar,
  banner,
  bottomNav,
  children,
  background,
  collapsed: collapsedProp,
  onCollapsedChange,
}: AppShellProps) {
  const skin = useDocumentSkin();
  const [preferred] = useBackdrop();
  const backdrop = background ?? preferred;
  const sidebarId = useId();
  // Expanded on the server and for hydration; the saved choice is read once mounted, so the
  // first client render matches the server's HTML.
  const [ownCollapsed, setOwnCollapsed] = useState(false);
  useEffect(() => {
    // oxlint-disable-next-line react/set-state-in-effect -- the saved choice is read once mounted, so hydration matches
    if (readCollapsed()) setOwnCollapsed(true);
  }, []);
  const collapsed = collapsedProp ?? ownCollapsed;
  const desktop = useSyncExternalStore(subscribeDesktop, isDesktop, () => true);
  const [drawerOpen, setDrawerOpenState] = useState(false);
  const aside = useRef<HTMLElement>(null);
  const scrim = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);
  const main = useRef<HTMLElement>(null);
  // set when the drawer is closed by the user; focus goes back to the menu
  // button once the column is no longer inert (an inert button takes no focus)
  const refocusMenu = useRef(false);

  const setDrawerOpen = useCallback((open: boolean) => {
    setDrawerOpenState(open);
    if (!open) refocusMenu.current = true;
  }, []);

  useEffect(() => {
    if (drawerOpen || !refocusMenu.current) return;
    refocusMenu.current = false;
    menuButton.current?.focus();
  }, [drawerOpen]);

  // the skip link moves focus itself: in a hash-routed app, following
  // href="#main" would change the route instead
  const skipToMain = (e: ReactMouseEvent<HTMLAnchorElement>) => {
    e.preventDefault();
    main.current?.focus();
  };

  const toggleCollapsed = () => {
    const next = !collapsed;
    if (collapsedProp === undefined) {
      writeCollapsed(next);
      setOwnCollapsed(next);
    }
    onCollapsedChange?.(next);
  };

  // drawer open: focus its first link (else the close button; the collapse
  // button is hidden in the drawer); Esc, a scrim click or a followed link close it
  useEffect(() => {
    const el = aside.current;
    if (!drawerOpen || !el) return;
    (
      el.querySelector<HTMLElement>('.ui-sidebar-body a[href]') ??
      el.querySelector<HTMLElement>('.ui-sidebar-close')
    )?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') setDrawerOpen(false);
    };
    const onClick = (e: MouseEvent) => {
      if (e.target instanceof Element && e.target.closest('a[href]')) setDrawerOpen(false);
    };
    const onScrim = () => setDrawerOpen(false);
    const s = scrim.current;
    document.addEventListener('keydown', onKey);
    el.addEventListener('click', onClick);
    s?.addEventListener('click', onScrim);
    return () => {
      document.removeEventListener('keydown', onKey);
      el.removeEventListener('click', onClick);
      s?.removeEventListener('click', onScrim);
    };
  }, [drawerOpen, setDrawerOpen]);

  // growing past the breakpoint turns the drawer back into the column
  useEffect(() => {
    if (!drawerOpen || typeof window.matchMedia !== 'function') return;
    const mq = window.matchMedia(DESKTOP);
    const onChange = () => {
      if (mq.matches) setDrawerOpenState(false);
    };
    mq.addEventListener('change', onChange);
    return () => mq.removeEventListener('change', onChange);
  }, [drawerOpen]);

  const registerMenuButton = useCallback((el: HTMLButtonElement | null) => {
    menuButton.current = el;
  }, []);
  const rail = collapsed && desktop;
  const hasBottomNav = bottomNav !== undefined && bottomNav !== null && bottomNav !== false;
  const ctx = useMemo(
    () => ({ rail, hasBottomNav, sidebarId, drawerOpen, setDrawerOpen, registerMenuButton }),
    [rail, hasBottomNav, sidebarId, drawerOpen, setDrawerOpen, registerMenuButton],
  );

  return (
    <ShellContext.Provider value={ctx}>
      <div
        className="ui-shell group/shell relative isolate grid min-h-dvh overflow-clip grid-cols-[minmax(0,1fr)] [--bottom-nav-h:64px] [--sidebar-w:240px] data-[collapsed]:md:[--sidebar-w:64px] md:grid-cols-[var(--sidebar-w)_minmax(0,1fr)]"
        data-collapsed={collapsed || undefined}
        data-drawer-open={drawerOpen || undefined}
        data-generate-host=""
      >
        {/* the glass skin's animated backdrop: what the glass refracts */}
        {skin === 'glass' &&
          backdrop !== false &&
          (isShaderPreset(backdrop) ? (
            <ShaderBackdrop preset={backdrop} />
          ) : (
            <AnimatedBackground variant={backdrop} />
          ))}
        {/* biome-ignore lint/a11y/useValidAnchor: a skip link is a link (and works without JS); the click handler only keeps a hash router from taking #main as a route */}
        <a
          className="ui-skip-link absolute top-2 left-2 z-100 -translate-y-[200%] rounded-sm bg-primary px-3.5 py-2 text-[13px]/[1.3] font-semibold text-on-primary no-underline focus:translate-y-0 focus:outline-none focus:[box-shadow:var(--ring)]"
          href="#main"
          onClick={skipToMain}
        >
          Skip to main content
        </a>
        {/* The sidebar and top bar are frosted (the CSS blur material), not lensed: a lens
            rim round full-height chrome reads as a grey bevel and a halo (§14). */}
        <aside
          ref={aside}
          id={sidebarId}
          className={cn(
            'ui-sidebar glass-chrome sticky top-0 box-border flex h-dvh flex-col border-r border-solid border-border bg-surface [box-shadow:var(--glass-rim)]',
            // under 768px: an off-canvas drawer over the scrim
            'max-md:invisible max-md:fixed max-md:inset-y-0 max-md:left-0 max-md:z-50 max-md:w-[min(280px,85vw)] max-md:-translate-x-full max-md:bg-surface-solid! max-md:[box-shadow:var(--shadow-lg)]',
            'group-data-[drawer-open]/shell:max-md:visible group-data-[drawer-open]/shell:max-md:translate-x-0',
            'motion-safe:max-md:[transition:transform_var(--t-slow),visibility_var(--t-slow)]',
          )}
          aria-label="Sidebar"
        >
          <div className="ui-sidebar-head box-border flex min-h-14 items-center justify-between gap-2 pt-[calc(0.625rem+env(safe-area-inset-top))] pr-2.5 pb-2.5 pl-[max(1rem,env(safe-area-inset-left))] group-data-[collapsed]/shell:md:justify-center group-data-[collapsed]/shell:md:px-2">
            <div className="ui-sidebar-brand flex min-w-0 items-center gap-2 text-[15px]/[1.2] font-semibold text-fg group-data-[collapsed]/shell:md:sr-only">
              {brand}
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="ui-sidebar-collapse max-md:hidden"
              aria-label="Full sidebar"
              aria-expanded={!collapsed}
              aria-controls={sidebarId}
              onClick={toggleCollapsed}
            >
              <Icon name="panel-left" size={16} />
            </Button>
            <Button
              variant="ghost"
              size="icon"
              className="ui-sidebar-close md:hidden"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
            >
              <Icon name="x" size={16} />
            </Button>
          </div>
          <div className="ui-sidebar-body min-h-0 flex-1 overflow-y-auto px-2.5 pt-2 pb-4 group-data-[collapsed]/shell:md:px-2">
            {sidebar}
          </div>
        </aside>
        <div
          ref={scrim}
          className="ui-drawer-scrim hidden bg-scrim group-data-[drawer-open]/shell:max-md:fixed group-data-[drawer-open]/shell:max-md:inset-0 group-data-[drawer-open]/shell:max-md:z-45 group-data-[drawer-open]/shell:max-md:block"
          aria-hidden="true"
        />
        <div
          className="ui-shell-column flex min-w-0 flex-col [background-image:radial-gradient(var(--grid-dot)_1px,transparent_1px)] [background-size:24px_24px]"
          inert={drawerOpen}
        >
          {topbar}
          {banner}
          <main
            ref={main}
            id="main"
            className={cn(
              'ui-main min-w-0 flex-1 scroll-mt-14 p-4 outline-none md:p-6',
              hasBottomNav &&
                'max-md:pb-[calc(var(--bottom-nav-h)+env(safe-area-inset-bottom)+16px)]',
            )}
            tabIndex={-1}
          >
            {children}
          </main>
          {hasBottomNav && bottomNav}
        </div>
      </div>
    </ShellContext.Provider>
  );
}

/* Sidebar — the app's sections in labelled groups, each its own <nav>
   (the first is "Main" unless it is given a label). */
export interface SidebarGroup {
  label?: string;
  /** A small decorative icon before the label (the label stays the group's name). */
  icon?: IconName;
  items: readonly SectionDef[];
}

export interface SidebarProps {
  sections: readonly SidebarGroup[];
  /** id of the current section. */
  current: string;
  /** For client-side routers: called on a plain left click instead of navigating. */
  onNavigate?: (section: SectionDef) => void;
}

export function Sidebar({ sections, current, onNavigate }: SidebarProps) {
  const rail = useContext(ShellContext)?.rail ?? false;
  return (
    <div className="ui-sidebar-groups flex flex-col gap-4.5">
      {sections.map((g, i) => (
        <div key={g.label ?? `group-${i}`} className="ui-sidebar-group">
          {g.label && (
            <p className="ui-sidebar-group-label m-0 mb-1.5 flex items-center gap-1.5 px-2.5 text-[10.5px]/[1.3] font-medium tracking-[0.12em] text-fg-subtle uppercase group-data-[collapsed]/shell:md:sr-only">
              {g.icon && <Icon name={g.icon} size={12} />}
              {g.label}
            </p>
          )}
          <SectionNav
            sections={g.items}
            current={current}
            label={g.label ?? (i === 0 ? 'Main' : `Section group ${i + 1}`)}
            orientation="vertical"
            tooltips={rail}
            onNavigate={onNavigate}
          />
        </div>
      ))}
    </div>
  );
}

/* Topbar — the page's header bar: the drawer's menu button (small screens
   only), the page title and an actions slot (admin menu, theme controls).

   `variant="flow"` is the header of a full-screen task (a scan): no drawer button at any width,
   so the whole navigation is never one stray tap away mid-task, and a `leading` slot for the
   task's own way out ("‹ Cancel"). The actions never wrap: a crowded bar truncates its title,
   it does not grow a second row. The bar clears the notch, the status bar and the rounded
   corners of a phone (env(safe-area-inset-*), live once the page sets viewport-fit=cover). */
export interface TopbarProps {
  /** The page's name, or a short trail ("Admin / Users"). Plain text: the page's own
      <h1> is the heading, so this is a paragraph. */
  title: ReactNode;
  actions?: ReactNode;
  /** `flow`: a full-screen task's header (no drawer button; `leading` carries Cancel). */
  variant?: 'default' | 'flow';
  /** Before the title: a flow's "‹ Cancel". */
  leading?: ReactNode;
  /** The app's mark and name. Under 768px it takes the left of the bar in place of the title (the
      title stays for screen readers, and the page's own <h1> says where you are), so a phone's
      bar is never half empty. From 768px it is not shown: the sidebar carries the brand. */
  brand?: ReactNode;
}

export function Topbar({ title, actions, variant = 'default', leading, brand }: TopbarProps) {
  const shell = useContext(ShellContext);
  const menuButton = useRef<HTMLButtonElement>(null);
  const register = shell?.registerMenuButton;
  useEffect(() => {
    register?.(menuButton.current);
    return () => register?.(null);
  }, [register]);
  return (
    <header
      className="ui-topbar glass-chrome sticky top-0 z-20 box-border flex min-h-14 items-center gap-3 border-b border-solid border-border bg-bar pt-[calc(0.5rem+env(safe-area-inset-top))] pr-[max(0.75rem,env(safe-area-inset-right))] pb-2 pl-[max(0.75rem,env(safe-area-inset-left))] md:pr-[max(1.25rem,env(safe-area-inset-right))] md:pl-[max(1.25rem,env(safe-area-inset-left))] [box-shadow:var(--glass-rim)]"
      data-variant={variant}
    >
      {shell && !shell.hasBottomNav && variant !== 'flow' && (
        <Button
          ref={menuButton}
          variant="ghost"
          size="icon"
          className="ui-topbar-menu shrink-0 md:hidden"
          aria-label="Navigation"
          aria-expanded={shell.drawerOpen}
          aria-controls={shell.sidebarId}
          onClick={() => shell.setDrawerOpen(!shell.drawerOpen)}
        >
          <Icon name="menu" size={18} />
        </Button>
      )}
      {leading && <div className="ui-topbar-leading flex shrink-0 items-center">{leading}</div>}
      {brand && (
        <div className="ui-topbar-brand flex min-w-0 flex-1 items-center md:hidden">{brand}</div>
      )}
      <p
        className={cn(
          'ui-topbar-title m-0 min-w-0 flex-1 truncate text-[15px]/[1.3] font-semibold text-fg',
          brand && 'max-md:sr-only',
        )}
      >
        {title}
      </p>
      {actions && (
        <div
          className={cn(
            'ui-topbar-actions flex shrink-0 flex-nowrap items-center justify-end gap-2',
            // one size for every icon button on a phone (a 44px target at least; 48px with a touch
            // screen, which this descendant rule would otherwise shrink the buttons' own 48px to)
            'max-md:gap-1 max-md:[&_button]:min-h-11 max-md:[&_button]:min-w-11',
            'max-md:pointer-coarse:[&_button]:min-h-12 max-md:pointer-coarse:[&_button]:min-w-12',
          )}
        >
          {actions}
        </div>
      )}
    </header>
  );
}

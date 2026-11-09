import { lazy, type ReactNode, Suspense, useCallback, useState } from 'react';
// not the '~/core/agent' barrel: that also exports the thread, which draws charts, and the Shell is on every page's first load
import { setAskOpen, useAsk } from '~/core/agent/ask';
import { useAuth } from '~/core/auth';
import { appFeatures } from '~/core/config';
import { useLocalStorage, useMediaQuery } from '~/core/hooks';
import { hrefFor } from '~/core/router';
import { useSettings } from '~/core/settings';
import {
  ApiStatusBadge,
  AppShell,
  Banner,
  Brand,
  Button,
  buttonAttrs,
  Cluster,
  CommandPalette,
  CommandPaletteButton,
  Icon,
  type SectionDef,
  SegmentedControl,
  Show,
  Sidebar,
  type Skin,
  ThemeToggle,
  Topbar,
  useAppTheme,
} from '~/core/ui';
import { AdminMenu } from './AdminMenu';
import { useCommands } from './commands';
import { NotificationsMenu } from './NotificationsMenu';
import { OfflineBanner } from './OfflineBanner';
import { ROUTES, type RouteDef } from './routes';
import { ShortcutsHelp } from './ShortcutsHelp';
import { useShortcuts } from './shortcuts';
import { UserMenu } from './UserMenu';
import { ViewAsBanner } from './ViewAsBanner';

/* The frame every page sits in: the sidebar from the route table (collapsible to an icon rail,
   remembered; a drawer under 768px), and the topbar with the page name, the search button, the
   API status, the appearance controls, the admin menu (admins only), the notification bell and the
   user menu, with the Ask button first (on every page but the Assistant itself). A non-admin
   never sees the Admin group or the admin menu.

   It also owns the things that must outlive a page change: the command palette (⌘K), the
   keyboard-shortcut help (`?`), the shortcut listener (`g h`, `[`, `a`, ...) and the Ask panel
   (AskPanel.tsx), so its chat survives closing it. */
/* The Ask panel pulls in the assistant's charts, tables and flow diagrams, so it is its own chunk:
   fetched when the Ask button is hovered or focused (or on a first open by shortcut), and mounted
   only once it has been opened. It stays mounted after that, so its chat survives closing it. */
const loadAskPanel = () => import('./AskPanel');
const AskPanel = lazy(() => loadAskPanel().then((m) => ({ default: m.AskPanel })));

function toSection(r: RouteDef): SectionDef {
  return { id: r.id, title: r.title, href: hrefFor(r.path), icon: r.icon };
}

const MAIN = ROUTES.filter((r) => r.group === 'main').map(toSection);
const ADMIN = ROUTES.filter((r) => r.group === 'admin').map(toSection);

const SKIN_OPTIONS = [
  { value: 'enterprise', label: 'Enterprise' },
  { value: 'glass', label: 'Glass' },
] as const;

/* The name in the topbar: the page, or "Admin / Users" for an admin page. The page's own
   <h1> is the heading; this is the "where am I" line. */
function trail(route: RouteDef): ReactNode {
  if (route.group !== 'admin') return route.title;
  return (
    <>
      Admin <span aria-hidden="true">/</span> {route.title}
    </>
  );
}

export function Shell({ route, children }: { route: RouteDef; children: ReactNode }) {
  const { theme, toggleTheme, skin, setSkin } = useAppTheme();
  const { isAdmin } = useAuth();
  const { workspaceName, maintenance } = useSettings();
  const [collapsed, setCollapsed] = useLocalStorage('app-sidebar-collapsed', false);
  const [paletteOpen, setPaletteOpen] = useState(false);
  const [helpOpen, setHelpOpen] = useState(false);
  const commands = useCommands();
  const canAsk = route.id !== 'assistant';
  const { open: askOpen } = useAsk();
  const [askMounted, setAskMounted] = useState(false);
  if (askOpen && !askMounted) setAskMounted(true);
  // Search is a plain icon button on a phone, like the bell and the person beside it
  const roomy = useMediaQuery('(min-width: 640px)');

  useShortcuts({
    onToggleSidebar: useCallback(() => setCollapsed((c) => !c), [setCollapsed]),
    onHelp: useCallback(() => setHelpOpen(true), []),
    ...(canAsk ? { onAsk: () => setAskOpen(true) } : {}),
  });

  const sections = isAdmin
    ? [{ items: MAIN }, { label: 'Admin', items: ADMIN }]
    : [{ items: MAIN }];

  return (
    <>
      <AppShell
        brand={<Brand compact name={workspaceName} />}
        collapsed={collapsed}
        onCollapsedChange={setCollapsed}
        sidebar={<Sidebar sections={sections} current={route.id} />}
        topbar={
          <Topbar
            title={trail(route)}
            actions={
              <>
                {canAsk && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => setAskOpen(true)}
                    onPointerEnter={loadAskPanel}
                    onFocus={loadAskPanel}
                  >
                    <Icon name="sparkles" size={16} />
                    Ask
                  </Button>
                )}
                <CommandPaletteButton
                  onClick={() => setPaletteOpen(true)}
                  {...(roomy ? {} : ({ variant: 'ghost', size: 'icon' } as const))}
                />
                <Show from="sm">
                  <ApiStatusBadge />
                </Show>
                <Cluster gap={1} nowrap data-appearance-controls>
                  <Show from="lg">
                    <SegmentedControl
                      label="Theme"
                      size="sm"
                      options={SKIN_OPTIONS}
                      value={skin}
                      onValueChange={(v) => setSkin(v as Skin)}
                    />
                  </Show>
                  <ThemeToggle theme={theme} onToggle={toggleTheme} />
                </Cluster>
                {isAdmin && <AdminMenu />}
                {appFeatures.notifications && <NotificationsMenu />}
                <UserMenu />
              </>
            }
          />
        }
        banner={
          <>
            <ViewAsBanner />
            <OfflineBanner />
            {isAdmin && maintenance.enabled && (
              <Banner
                tone="warning"
                title="Maintenance mode is on."
                action={
                  <a href={hrefFor('/admin/settings')} {...buttonAttrs('outline', 'sm')}>
                    Open settings
                  </a>
                }
              >
                Only admins can use the app.
              </Banner>
            )}
          </>
        }
      >
        {children}
      </AppShell>
      <CommandPalette
        open={paletteOpen}
        onOpenChange={setPaletteOpen}
        commands={commands}
        recentKey="app-recent-commands"
      />
      <ShortcutsHelp open={helpOpen} onClose={() => setHelpOpen(false)} />
      {canAsk && askMounted && (
        <Suspense fallback={null}>
          <AskPanel route={route} />
        </Suspense>
      )}
    </>
  );
}

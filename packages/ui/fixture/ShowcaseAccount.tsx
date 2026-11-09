/* The account parts on the showcase page (wired into Showcase.tsx with one line), so the browser
   a11y gate covers them in every skin and mode: the notification bell (open), a grouped
   notification list and its empty state, the session list, the avatar picker idle and uploading,
   the password strength meter with its checklist, and the banner in each tone. Server-rendered,
   so every value is fixed and every handler a no-op. */
import {
  AvatarPicker,
  Banner,
  Button,
  NotificationBell,
  type NotificationEntry,
  NotificationList,
  PanelHeader,
  PasswordStrength,
  SessionList,
} from '../src/index';

const noop = () => {};
const NOW = '2026-10-12T12:00:00Z';
const ITEMS: NotificationEntry[] = [
  {
    id: 'n1',
    title: 'Invoice 1042 was paid',
    body: 'Acme Ltd paid £1,200.00 by bank transfer. The receipt has been filed and the account is up to date.',
    createdAt: '2026-10-12T11:40:00Z',
    tone: 'success',
  },
  {
    id: 'n2',
    title: 'New sign-in from Firefox on Linux',
    createdAt: '2026-10-12T09:10:00Z',
    tone: 'warning',
  },
  {
    id: 'n3',
    title: 'Weekly report is ready',
    body: 'Your report for 5 to 11 October is available.',
    createdAt: '2026-10-11T08:00:00Z',
    readAt: '2026-10-11T09:00:00Z',
    tone: 'info',
  },
  {
    id: 'n4',
    title: 'Welcome to the app',
    createdAt: '2026-09-01T08:00:00Z',
    readAt: '2026-09-01T08:30:00Z',
  },
];
const SESSIONS = [
  {
    id: 's1',
    current: true,
    ip: '203.0.113.7',
    lastSeenAt: '2026-10-12T11:59:00Z',
    userAgent:
      'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0.0.0 Safari/537.36',
  },
  {
    id: 's2',
    ip: '198.51.100.23',
    lastSeenAt: '2026-10-10T18:30:00Z',
    userAgent:
      'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
  },
  { id: 's3', ip: null, lastSeenAt: '2026-09-20T07:00:00Z', userAgent: null },
];

export function AccountShowcase() {
  return (
    <section
      aria-label="Account parts"
      style={{ display: 'flex', flexDirection: 'column', gap: 16 }}
    >
      <PanelHeader title="Account parts" />
      <div style={{ display: 'flex', flexDirection: 'column', gap: 8 }}>
        <Banner tone="info" title="Heads up." onDismiss={noop}>
          A new version is available.
        </Banner>
        <Banner
          tone="warning"
          title="Maintenance tonight."
          action={
            <Button size="sm" variant="outline">
              Details
            </Button>
          }
        >
          The app will be read-only from 22:00 to 22:30.
        </Banner>
        <Banner tone="danger" onDismiss={noop}>
          You are offline. Changes are not being saved.
        </Banner>
      </div>
      <div style={{ display: 'flex', gap: 16, alignItems: 'flex-start', minHeight: 520 }}>
        <NotificationBell
          items={ITEMS}
          unreadCount={2}
          now={NOW}
          viewAllHref="/notifications"
          onMarkRead={noop}
          onMarkAllRead={noop}
          onSelect={noop}
          defaultOpen
          group
        />
        <div style={{ flex: 1, minWidth: 0, display: 'flex', flexDirection: 'column', gap: 16 }}>
          <NotificationList items={ITEMS} now={NOW} group onMarkRead={noop} onSelect={noop} />
          <NotificationList items={[]} />
        </div>
      </div>
      <SessionList sessions={SESSIONS} now={NOW} onRevoke={noop} onRevokeOthers={noop} />
      <AvatarPicker name="Ada Lovelace" src="/avatar.png" onSave={noop} onRemove={noop} />
      <AvatarPicker name="Grace Hopper" uploading progress={40} error="The upload failed." />
      <PasswordStrength value="correct Horse 9 battery" requirements />
      <PasswordStrength value="abc" requirements />
    </section>
  );
}

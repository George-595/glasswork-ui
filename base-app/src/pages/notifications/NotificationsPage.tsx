import { param, useUrlState } from '~/core/router';
import { Page, Tabs } from '~/core/ui';
import { InboxTab } from './InboxTab';
import { PreferencesTab } from './PreferencesTab';

/* Notifications: the inbox (newest first, grouped by day, live) and the preferences (which kinds
   reach you in the app and by email). The tab is in the address (/notifications?tab=preferences),
   so a link can point at the preferences. */
const URL_SCHEMA = { tab: param.string('inbox') };

export default function NotificationsPage() {
  const [url, setUrl] = useUrlState(URL_SCHEMA);
  const tab = url.tab === 'preferences' ? 'preferences' : 'inbox';
  return (
    <Page
      title="Notifications"
      description="What happened, as it happens, and how you want to hear about it."
    >
      <Tabs
        label="Notifications sections"
        value={tab}
        onValueChange={(id) => setUrl({ tab: id })}
        tabs={[
          { id: 'inbox', label: 'Inbox', content: <InboxTab /> },
          { id: 'preferences', label: 'Preferences', content: <PreferencesTab /> },
        ]}
      />
    </Page>
  );
}

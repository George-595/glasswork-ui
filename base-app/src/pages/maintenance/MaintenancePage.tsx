import { useAuth } from '~/core/auth';
import { useSettings } from '~/core/settings';
import { Button, Page, StatusPage } from '~/core/ui';

/* What a non-admin sees while maintenance mode is on: the message the admin wrote (or the default
   one), a way to check again, and a way to sign out (to come back as an admin). The server already
   answers 503 `maintenance` to everything but sign-in, so this page is the client catching up. It
   renders without the shell: there is nowhere to go. */
export const MAINTENANCE_TITLE = 'We’ll be back soon';

export default function MaintenancePage() {
  const { maintenance, refresh } = useSettings();
  const { logout } = useAuth();
  return (
    <Page title={MAINTENANCE_TITLE} titleHidden>
      <StatusPage
        icon="wrench"
        title={MAINTENANCE_TITLE}
        description={maintenance.message}
        primaryAction={<Button onClick={() => void refresh()}>Check again</Button>}
        secondaryAction={
          <Button variant="outline" onClick={() => void logout()}>
            Sign out
          </Button>
        }
      />
    </Page>
  );
}

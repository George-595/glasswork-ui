import { useAuth } from '~/core/auth';
import { Link } from '~/core/router';
import { Button, buttonAttrs, Page, ShaderAccent, StatusPage, useAppTheme } from '~/core/ui';

/* Shown inside the shell when a signed-in user opens an admin page their role does not allow.
   It is not a sign-in prompt: the user is signed in, just not allowed here. The secondary action
   signs them out, which lands on the sign-in page, so an administrator can take over. */
export default function NotAuthorisedPage() {
  const { logout } = useAuth();
  const { skin } = useAppTheme();
  return (
    <Page title="Not authorised" titleHidden>
      <StatusPage
        code="403"
        icon="shield"
        title="You don't have access to this page"
        description="Your account is signed in, but its role does not allow this area. Ask an administrator if you need it."
        backdrop={
          skin === 'glass' ? <ShaderAccent preset="glass-caustics" intensity={0.4} /> : undefined
        }
        primaryAction={
          <Link to="/" {...buttonAttrs('primary', 'md')}>
            Go home
          </Link>
        }
        secondaryAction={
          <Button variant="outline" onClick={() => void logout()}>
            Sign in as someone else
          </Button>
        }
      />
    </Page>
  );
}

import { Link } from '~/core/router';
import { Button, buttonAttrs, Page, ShaderAccent, StatusPage, useAppTheme } from '~/core/ui';

/* Shown for any address with no page. Two ways out: the overview, or one step back in the
   browser's history. In the glass skin a quiet shader accent glows behind the message. */
export default function NotFoundPage() {
  const { skin } = useAppTheme();
  return (
    <Page title="Page not found" titleHidden>
      <StatusPage
        code="404"
        icon="search"
        title="We can't find that page"
        description="The address may be mistyped, or the page has moved or no longer exists."
        backdrop={
          skin === 'glass' ? <ShaderAccent preset="aurora-noise" intensity={0.4} /> : undefined
        }
        primaryAction={
          <Link to="/" {...buttonAttrs('primary', 'md')}>
            Go home
          </Link>
        }
        secondaryAction={
          <Button variant="outline" onClick={() => window.history.back()}>
            Go back
          </Button>
        }
      />
    </Page>
  );
}

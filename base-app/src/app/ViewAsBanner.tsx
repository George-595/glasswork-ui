import { useState } from 'react';
import { useAuth } from '~/core/auth';
import { Banner, Button, toast } from '~/core/ui';
import { ROLE_LABELS } from '~/core/utils';

/* The warning on every screen while an admin or an editor is viewing the app as a lower role:
   "You're viewing as a Viewer. Switch back to Admin", one tap, never hidden, and mounted by the
   shell so it is on the maintenance page too. Nothing is drawn when the person is themself.

   What they do while viewing as is real (it is logged under their own name with the role they
   acted as), so the second sentence says so. */
export function ViewAsBanner() {
  const { actingRole, realRole, viewAs } = useAuth();
  const [busy, setBusy] = useState(false);
  if (!actingRole || !realRole) return null;

  const back = () => {
    setBusy(true);
    viewAs(null)
      .catch(() => toast.error('Could not switch back. Please try again.'))
      .finally(() => setBusy(false));
  };

  return (
    <Banner
      tone="warning"
      title={`You're viewing as ${/^[aeiou]/i.test(ROLE_LABELS[actingRole]) ? 'an' : 'a'} ${ROLE_LABELS[actingRole]}.`}
      data-view-as-banner=""
      action={
        <Button variant="outline" size="sm" loading={busy} onClick={back}>
          Switch back to {ROLE_LABELS[realRole]}
        </Button>
      }
    >
      What you do here is real.
    </Banner>
  );
}

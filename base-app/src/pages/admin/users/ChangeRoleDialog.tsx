import { type FormEvent, useState } from 'react';
import type { Role, User } from '~/core/api';
import { Button, Dialog, Notice, RadioCards, Stack } from '~/core/ui';
import { ROLE_HINT, ROLE_LABEL, ROLES } from './labels';

/* "Change role…": a small dialog with the roles as cards (each says what it can do). The page owns the request
   and passes it as `onSave`; while it runs the dialog cannot be dismissed, and
   a rejection (the server's last-admin rule, say) is shown inline in an alert
   with the choice kept. It starts on the chosen user's current role. */
export interface ChangeRoleDialogProps {
  user: User | null;
  onClose: () => void;
  onSave: (user: User, role: Role) => Promise<void>;
}

const FORM_ID = 'change-role-form';
const ROLE_OPTIONS = ROLES.map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
  description: ROLE_HINT[r],
}));

function asRole(value: string): Role {
  return ROLES.find((r) => r === value) ?? 'viewer';
}

export function ChangeRoleDialog({ user, onClose, onSave }: ChangeRoleDialogProps) {
  const [role, setRole] = useState<Role>(user?.role ?? 'viewer');
  const [saving, setSaving] = useState(false);
  const [failure, setFailure] = useState<string | null>(null);
  // A different user starts from their own role with no old error (state adjusted in render,
  // so the dialog is never painted with the last person's choice).
  const [shownFor, setShownFor] = useState<User | null>(user);
  if (user && user !== shownFor) {
    setShownFor(user);
    setRole(user.role);
    setFailure(null);
  }

  async function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (!user || saving) return;
    if (role === user.role) {
      onClose();
      return;
    }
    setSaving(true);
    setFailure(null);
    try {
      await onSave(user, role);
      setSaving(false);
      onClose();
    } catch (err) {
      setSaving(false);
      setFailure(err instanceof Error && err.message ? err.message : 'Something went wrong.');
    }
  }

  return (
    <Dialog
      open={user !== null}
      onClose={onClose}
      dismissible={!saving}
      title="Change role"
      description={user ? `${user.name} · ${user.email}` : undefined}
      footer={
        <>
          <Button variant="outline" size="sm" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" size="sm" form={FORM_ID} disabled={saving}>
            {saving ? 'Saving…' : 'Save role'}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit}>
        <Stack>
          <RadioCards
            legend="Role"
            columns={1}
            options={ROLE_OPTIONS}
            value={role}
            onValueChange={(value) => setRole(asRole(value))}
          />
          {failure && <Notice tone="danger">{failure}</Notice>}
        </Stack>
      </form>
    </Dialog>
  );
}

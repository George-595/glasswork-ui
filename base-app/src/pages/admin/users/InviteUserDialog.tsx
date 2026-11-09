import { type FormEvent, useEffect, useRef, useState } from 'react';
import type { ApiError, Role } from '~/core/api';
import { Button, Checkbox, Dialog, FormField, Input, Notice, RadioCards, Stack } from '~/core/ui';
import { ROLE_HINT, ROLE_LABEL, ROLES } from './labels';

/* The invite form in a Dialog. Validation runs on submit (the form is noValidate,
   so the browser's bubbles never race ours). The first invalid field gets focus.
   The page owns the request: while `sending` the submit is disabled, a 409
   email_taken answer lands on the Email field, and any other failure is an
   inline alert. Fields are kept on failure; the page remounts the dialog (key) on each
   open, so a new invite always starts empty. */
export interface InviteInput {
  name: string;
  email: string;
  role: Role;
  welcome: boolean;
}

export interface InviteUserDialogProps {
  open: boolean;
  onClose: () => void;
  onInvite: (input: InviteInput) => void;
  sending: boolean;
  error: ApiError | null;
}

const ROLE_OPTIONS = ROLES.map((r) => ({
  value: r,
  label: ROLE_LABEL[r],
  description: ROLE_HINT[r],
}));
const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
const FORM_ID = 'invite-user-form';
const EMAIL_TAKEN = 'An account with this email already exists.';

interface Errors {
  name?: string;
  email?: string;
}

function asRole(value: string): Role {
  return ROLES.find((r) => r === value) ?? 'viewer';
}

export function InviteUserDialog({
  open,
  onClose,
  onInvite,
  sending,
  error,
}: InviteUserDialogProps) {
  const nameRef = useRef<HTMLInputElement>(null);
  const emailRef = useRef<HTMLInputElement>(null);

  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [role, setRole] = useState<Role>('viewer');
  const [welcome, setWelcome] = useState(true);
  const [errors, setErrors] = useState<Errors>({});

  const emailTaken = error?.status === 409 && error.code === 'email_taken';
  const emailError = errors.email ?? (emailTaken ? EMAIL_TAKEN : undefined);
  const formError = error && !emailTaken ? error.message : null;

  // showModal() (in Dialog) runs first, as a child effect; focus then lands inside the modal
  useEffect(() => {
    if (open) nameRef.current?.focus();
  }, [open]);

  useEffect(() => {
    if (emailTaken) emailRef.current?.focus();
  }, [emailTaken]);

  function handleSubmit(e: FormEvent<HTMLFormElement>) {
    e.preventDefault();
    if (sending) return;
    const cleanName = name.trim();
    const cleanEmail = email.trim();
    const next: Errors = {};
    if (cleanName === '') next.name = 'Enter a name.';
    if (cleanEmail === '') next.email = 'Enter an email address.';
    else if (!EMAIL_PATTERN.test(cleanEmail))
      next.email = 'Enter an email address like name@example.com.';
    setErrors(next);
    if (next.name) {
      nameRef.current?.focus();
      return;
    }
    if (next.email) {
      emailRef.current?.focus();
      return;
    }
    onInvite({ name: cleanName, email: cleanEmail, role, welcome });
  }

  return (
    <Dialog
      open={open}
      onClose={onClose}
      dismissible={!sending}
      title="Invite user"
      description="Invited users show as Invited until they accept."
      footer={
        <>
          <Button variant="ghost" onClick={onClose} disabled={sending}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} disabled={sending}>
            Send invite
          </Button>
        </>
      }
    >
      <form id={FORM_ID} noValidate onSubmit={handleSubmit}>
        <Stack>
          <FormField label="Name" error={errors.name}>
            <Input
              ref={nameRef}
              name="name"
              autoComplete="name"
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
            />
          </FormField>
          <FormField label="Email" error={emailError}>
            <Input
              ref={emailRef}
              type="email"
              name="email"
              autoComplete="email"
              required
              value={email}
              onChange={(e) => setEmail(e.target.value)}
            />
          </FormField>
          <RadioCards
            legend="Role"
            name="role"
            columns={1}
            options={ROLE_OPTIONS}
            value={role}
            onValueChange={(value) => setRole(asRole(value))}
          />
          <Checkbox
            name="welcome"
            checked={welcome}
            onChange={(e) => setWelcome(e.target.checked)}
            label="Send welcome email"
          />
          {formError && <Notice tone="danger">{formError}</Notice>}
        </Stack>
      </form>
    </Dialog>
  );
}

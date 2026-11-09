import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api, useApiQuery } from '~/core/api';
import { useAuth } from '~/core/auth';
import { config } from '~/core/config';
import { Link, navigate, useHashSecret } from '~/core/router';
import {
  AuthScreen,
  Button,
  buttonAttrs,
  Cluster,
  FormField,
  Input,
  LoadingRegion,
  NewPasswordField,
  Notice,
  SkeletonText,
  Stack,
} from '~/core/ui';

/* Accept an invitation: `/accept-invite#token=…` from the invite email. Public (no shell).

   - The token is in the fragment, which no server ever sees, so a server render draws the
     "Checking your link…" screen and the browser reads the token once it has mounted
     (`useHashSecret`), then takes it out of the address bar and history.
   - The token is looked at first (GET /api/auth/invite/:token, which spends nothing) to greet
     the person by email: "Join <app> as <email>". An unknown, used or expired link is one
     answer, never told apart, with a way back to sign in.
   - The name is prefilled and editable; the password is chosen with the strength meter. The
     server applies the real policy; its refusals land under the password (or name) field.
   - Success: the server has set the session cookie, so the page adopts the user and goes home. */
const INVALID = 'This link is invalid or has expired.';
type FieldName = 'name' | 'password';

export default function AcceptInvitePage() {
  const { adopt } = useAuth();
  const secret = useHashSecret('token');
  const token = secret ?? '';

  const query = useApiQuery(
    () =>
      secret === null
        ? new Promise<never>(() => {}) // the browser has not read the address yet
        : secret === ''
          ? Promise.reject(new ApiError(400, 'invalid_token', INVALID))
          : api.inviteInfo(secret),
    secret ?? '\0pending',
  );
  const [name, setName] = useState<string | null>(null);
  const [password, setPassword] = useState('');
  const [errors, setErrors] = useState<Partial<Record<FieldName, string>>>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const [sending, setSending] = useState(false);
  const nameField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (failures > 0) summary.current?.focus();
  }, [failures]);

  if (query.status === 'loading') {
    return (
      <AuthScreen
        title="Accept your invitation"
        description="Checking your link…"
        form={
          <LoadingRegion label="your invitation">
            <SkeletonText lines={3} />
          </LoadingRegion>
        }
      />
    );
  }

  const invalid =
    spent || (query.status === 'error' && (query.error.code === 'invalid_token' || token === ''));
  if (invalid) {
    return (
      <AuthScreen
        title="This link is invalid or has expired"
        description="Invitation links work once and stop working after a week. Ask the person who invited you to send a new one."
        form={
          <Cluster>
            <Link to="/" {...buttonAttrs('primary', 'md')}>
              Go to sign in
            </Link>
          </Cluster>
        }
      />
    );
  }
  if (query.status === 'error') {
    return (
      <AuthScreen
        title="Accept your invitation"
        notice={<Notice tone="danger">{query.error.message}</Notice>}
        form={
          <Cluster>
            <Button variant="primary" onClick={query.reload}>
              Try again
            </Button>
          </Cluster>
        }
      />
    );
  }

  const { email, name: invitedName } = query.data.invite;
  const shownName = name ?? invitedName;

  const fail = (next: Partial<Record<FieldName, string>>, message: string | null) => {
    setErrors(next);
    setFormError(message);
    setFailures((n) => n + 1);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    if (shownName.trim() === '') {
      fail({ name: 'Enter your name.' }, null);
      nameField.current?.focus();
      return;
    }
    if (password === '') {
      fail({ password: 'Choose a password.' }, null);
      passwordField.current?.focus();
      return;
    }
    setSending(true);
    setErrors({});
    setFormError(null);
    try {
      const res = await api.acceptInvite({ token, name: shownName.trim(), password });
      adopt(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'invalid_token') setSpent(true);
      else if (code === 'invalid_name')
        fail({ name: err instanceof Error ? err.message : '' }, null);
      else if (code.startsWith('password_')) {
        fail({ password: err instanceof Error ? err.message : '' }, null);
        passwordField.current?.focus();
      } else fail({}, err instanceof Error ? err.message : 'Something went wrong. Try again.');
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthScreen
      title="Accept your invitation"
      description={`Join ${config.appName} as ${email}.`}
      notice={
        formError ? (
          <Notice ref={summary} tone="danger" tabIndex={-1}>
            {formError}
          </Notice>
        ) : undefined
      }
      form={
        <form onSubmit={onSubmit} noValidate aria-busy={sending}>
          <Stack gap={4}>
            <FormField label="Email">
              <Input type="email" name="email" autoComplete="username" readOnly value={email} />
            </FormField>
            <FormField label="Your name" error={errors.name}>
              <Input
                ref={nameField}
                name="name"
                autoComplete="name"
                required
                value={shownName}
                onChange={(e) => {
                  setName(e.target.value);
                  setErrors((prev) => ({ ...prev, name: undefined }));
                }}
              />
            </FormField>
            <NewPasswordField
              ref={passwordField}
              value={password}
              error={errors.password}
              onChange={(value) => {
                setPassword(value);
                setErrors((prev) => ({ ...prev, password: undefined }));
              }}
            />
            <Button type="submit" variant="primary" size="lg" loading={sending}>
              {sending ? 'Joining…' : 'Join'}
            </Button>
          </Stack>
        </form>
      }
    />
  );
}

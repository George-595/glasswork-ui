import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '~/core/api';
import { useAuth } from '~/core/auth';
import { Link, navigate, useHashSecret } from '~/core/router';
import {
  AuthScreen,
  Button,
  buttonAttrs,
  Cluster,
  LoadingRegion,
  NewPasswordField,
  Notice,
  SkeletonText,
  Stack,
} from '~/core/ui';

/* Choose a new password: `/reset-password#token=…` from the reset email. Public (no shell).

   The token is in the fragment, which no server ever sees: a server render draws a loading
   screen, and the browser reads the token once mounted (`useHashSecret`), then removes it from the
   address bar and history. There is no way to
   look at a reset token without spending it, so a bad link shows on submit: the one generic
   "invalid or expired" screen, with a way to ask again. Success: every other session of the
   account has been signed out by the server, this browser is signed in fresh (cookie set), and
   the page adopts the user and goes home. */
export default function ResetPasswordPage() {
  const { adopt } = useAuth();
  const secret = useHashSecret('token');
  const token = secret ?? '';

  const [password, setPassword] = useState('');
  const [fieldError, setFieldError] = useState<string | undefined>();
  const [formError, setFormError] = useState<string | null>(null);
  const [spent, setSpent] = useState(false);
  const [sending, setSending] = useState(false);
  const passwordField = useRef<HTMLInputElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const [failures, setFailures] = useState(0);

  useEffect(() => {
    if (failures > 0) summary.current?.focus();
  }, [failures]);

  if (secret === null) {
    return (
      <AuthScreen
        title="Choose a new password"
        description="Checking your link…"
        form={
          <LoadingRegion label="your link">
            <SkeletonText lines={3} />
          </LoadingRegion>
        }
      />
    );
  }

  if (token === '' || spent) {
    return (
      <AuthScreen
        title="This link is invalid or has expired"
        description="Reset links work once and stop working after an hour. Ask for a new one."
        form={
          <Cluster>
            <Link to="/forgot-password" {...buttonAttrs('primary', 'md')}>
              Request a new link
            </Link>
            <Link to="/" {...buttonAttrs('outline', 'md')}>
              Go to sign in
            </Link>
          </Cluster>
        }
      />
    );
  }

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    if (password === '') {
      setFieldError('Choose a password.');
      passwordField.current?.focus();
      return;
    }
    setSending(true);
    setFieldError(undefined);
    setFormError(null);
    try {
      const res = await api.resetPassword({ token, password });
      adopt(res.user);
      navigate('/', { replace: true });
    } catch (err) {
      const code = err instanceof ApiError ? err.code : '';
      if (code === 'invalid_token') setSpent(true);
      else if (code.startsWith('password_')) {
        setFieldError(err instanceof Error ? err.message : undefined);
        passwordField.current?.focus();
      } else {
        setFormError(err instanceof Error ? err.message : 'Something went wrong. Try again.');
        setFailures((n) => n + 1);
      }
    } finally {
      setSending(false);
    }
  };

  return (
    <AuthScreen
      title="Choose a new password"
      description="You'll be signed out everywhere else."
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
            <NewPasswordField
              ref={passwordField}
              label="New password"
              value={password}
              error={fieldError}
              onChange={(value) => {
                setPassword(value);
                setFieldError(undefined);
              }}
            />
            <Button type="submit" variant="primary" size="lg" loading={sending}>
              {sending ? 'Saving…' : 'Save password'}
            </Button>
          </Stack>
        </form>
      }
    />
  );
}

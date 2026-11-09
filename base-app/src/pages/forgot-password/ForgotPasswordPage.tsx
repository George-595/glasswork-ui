import { type FormEvent, useEffect, useRef, useState } from 'react';
import { ApiError, api } from '~/core/api';
import { Link } from '~/core/router';
import {
  AuthScreen,
  Button,
  buttonAttrs,
  Cluster,
  FormField,
  Input,
  Notice,
  Stack,
} from '~/core/ui';

/* Ask for a reset link: `/forgot-password`. Public (no shell).

   The server answers 202 the same way whether or not the address has an account, and this
   page says the same thing every time ("If an account exists, we've emailed a link"): nothing
   on screen tells a registered address from an unregistered one. Only two things differ and
   neither depends on the address: asking too often (429) and a network failure, both shown as
   an error so the person can try again. */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

export default function ForgotPasswordPage() {
  const [email, setEmail] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [asked, setAsked] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const emailField = useRef<HTMLInputElement>(null);
  const message = useRef<HTMLDivElement>(null);

  useEffect(() => {
    emailField.current?.focus();
  }, []);
  useEffect(() => {
    if (asked !== null) message.current?.focus();
  }, [asked]);

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const address = email.trim();
    if (!EMAIL_SHAPE.test(address)) {
      setError(
        address === ''
          ? 'Enter your email address.'
          : 'Enter an email address like name@example.com.',
      );
      emailField.current?.focus();
      return;
    }
    setSending(true);
    setError(null);
    try {
      await api.forgotPassword({ email: address });
      setAsked(address);
    } catch (err) {
      setError(
        err instanceof ApiError && err.status === 429
          ? err.message
          : 'We could not send that request. Check your connection and try again.',
      );
    } finally {
      setSending(false);
    }
  };

  if (asked !== null) {
    return (
      <AuthScreen
        title="Check your email"
        notice={
          <Notice ref={message} tone="success" tabIndex={-1}>
            If an account exists for {asked}, we've emailed a link to reset the password. It works
            for one hour.
          </Notice>
        }
        description="The email can take a few minutes. Look in your spam folder too."
        form={
          <Cluster>
            <Link to="/" {...buttonAttrs('primary', 'md')}>
              Back to sign in
            </Link>
            <Button variant="outline" onClick={() => setAsked(null)}>
              Use a different email
            </Button>
          </Cluster>
        }
      />
    );
  }

  return (
    <AuthScreen
      title="Forgot your password?"
      description="Enter your email and we'll send you a link to choose a new one."
      form={
        <form onSubmit={onSubmit} noValidate aria-busy={sending}>
          <Stack gap={4}>
            <FormField label="Email" error={error ?? undefined}>
              <Input
                ref={emailField}
                type="email"
                name="email"
                autoComplete="email"
                required
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  setError(null);
                }}
              />
            </FormField>
            <Button type="submit" variant="primary" size="lg" loading={sending}>
              {sending ? 'Sending…' : 'Send reset link'}
            </Button>
          </Stack>
        </form>
      }
      footer={<Link to="/">Back to sign in</Link>}
    />
  );
}

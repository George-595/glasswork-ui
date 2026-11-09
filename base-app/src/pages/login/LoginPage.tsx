import { type FormEvent, type KeyboardEvent, useEffect, useRef, useState } from 'react';
import { api, useApiQuery } from '~/core/api';
import { useAuth } from '~/core/auth';
import { config } from '~/core/config';
import { useOnline } from '~/core/hooks';
import { Link } from '~/core/router';
import {
  AuthLayout,
  Badge,
  Banner,
  Brand,
  Button,
  buttonAttrs,
  Cluster,
  Code,
  FeedItem,
  FeedList,
  FormField,
  type IconName,
  Input,
  Notice,
  Panel,
  PasswordInput,
  Section,
  Stack,
  Text,
  useAppTheme,
  useInitialFocus,
} from '~/core/ui';
import { OFFLINE, signInMessage } from './messages';

/* The sign-in page. The app shows it, with no shell, whenever nobody is signed in, at any
   address. Once the sign-in works the app shows the page the user first asked for.

   Two looks on one structure, both from the kit's AuthLayout. Enterprise: a calm two-column
   panel (brand and features, the form beside it; one column on a phone). Glass: sea glass,
   the form on a frosted glass pebble lying on sunlit paper with coloured pebbles around it,
   the brand reduced to a mark above it.

   Form behaviour, in the order a user meets it:
   - the email is focused on mount with a mouse or keyboard (on a phone the keyboard waits for a
     tap);
   - the password has a Show/Hide button (it keeps focus, the field keeps its value) and a
     Caps Lock hint, read from key events: the FormField ties it to the field with
     aria-describedby, and a polite status line says it aloud;
   - a failed attempt (empty field, malformed email, or the server saying no) shows ONE error
     summary and moves focus to it. Field problems are also written under their field and each
     summary entry focuses its field. Native validation is off (noValidate) so the wording and
     the focus are ours;
   - while the request is in flight the button says "Signing in…" and is aria-disabled, not
     disabled, so focus stays on it and a second press is ignored; the fields go read-only (not
     disabled: a disabled field drops the phone's keyboard and the password manager's fill);
   - offline: a warning above the form says so, and a submit still tries (navigator.onLine can be
     wrong) and, if it fails, says "You're offline" rather than "wrong password". */
const EMAIL_SHAPE = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;

const FEATURES: readonly { icon: IconName; text: string }[] = [
  { icon: 'chart', text: 'Live tables and charts on one calm dashboard' },
  { icon: 'shield', text: 'Server-side sessions and role-based access' },
  { icon: 'sun', text: 'Light, dark and glass looks, accessible in all of them' },
];

type FieldName = 'email' | 'password';
type FieldErrors = Partial<Record<FieldName, string>>;

function validate(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (email.trim() === '') errors.email = 'Enter your email address.';
  else if (!EMAIL_SHAPE.test(email.trim()))
    errors.email = 'Enter an email address like name@example.com.';
  if (password === '') errors.password = 'Enter your password.';
  return errors;
}

export default function LoginPage() {
  const { login } = useAuth();
  const { skin } = useAppTheme();
  const online = useOnline();
  const emailField = useRef<HTMLInputElement>(null);
  const passwordField = useRef<HTMLInputElement>(null);
  const submitButton = useRef<HTMLButtonElement>(null);
  const summary = useRef<HTMLDivElement>(null);
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [capsOn, setCapsOn] = useState(false);
  const [sending, setSending] = useState(false);
  const [fieldErrors, setFieldErrors] = useState<FieldErrors>({});
  const [serverError, setServerError] = useState<string | null>(null);
  // bumps on every failed attempt, so the summary takes focus again even if its text is unchanged
  const [failures, setFailures] = useState(0);

  // Development only: the server sends who to sign in as (never in production), and the
  // client build double-checks it is a dev build before showing it.
  const me = useApiQuery(() => api.me());
  const devSignIn = import.meta.env.DEV && me.status === 'success' ? me.data.devSignIn : undefined;

  useEffect(() => {
    document.title = `Sign in · ${config.appName}`;
  }, []);
  useInitialFocus(emailField);

  useEffect(() => {
    if (failures > 0) summary.current?.focus();
  }, [failures]);

  const fail = (errors: FieldErrors, server: string | null) => {
    setFieldErrors(errors);
    setServerError(server);
    setFailures((n) => n + 1);
  };

  const onSubmit = async (e: FormEvent<HTMLFormElement>) => {
    e.preventDefault();
    if (sending) return;
    const errors = validate(email, password);
    if (Object.keys(errors).length > 0) {
      fail(errors, null);
      return;
    }
    setSending(true);
    setFieldErrors({});
    setServerError(null);
    try {
      await login(email.trim(), password);
    } catch (err) {
      fail({}, signInMessage(err, navigator.onLine));
    } finally {
      // also when a superseded login resolves without throwing: never leave the button stuck
      setSending(false);
    }
  };

  const readCaps = (e: KeyboardEvent<HTMLInputElement>) => {
    setCapsOn(e.getModifierState('CapsLock'));
  };

  // Typing in a field clears that field's own error.
  const clearError = (field: FieldName) => {
    if (fieldErrors[field]) setFieldErrors((prev) => ({ ...prev, [field]: undefined }));
  };

  const fillDev = () => {
    if (!devSignIn) return;
    setEmail(devSignIn.adminEmail);
    setFieldErrors({});
    setServerError(null);
    if (devSignIn.password) {
      setPassword(devSignIn.password);
      submitButton.current?.focus();
    } else {
      passwordField.current?.focus();
    }
  };

  const listed = (['email', 'password'] as const).filter((f) => fieldErrors[f]);
  const hasSummary = listed.length > 0 || serverError !== null;

  return (
    <AuthLayout
      seaGlass={skin === 'glass'}
      brand={<Brand />}
      aside={
        <Stack gap={4}>
          <Text size="display" weight="semibold">
            Your work, in one calm place.
          </Text>
          <FeedList aria-label={`About ${config.appName}`}>
            {FEATURES.map((f) => (
              <FeedItem key={f.text} icon={f.icon} title={f.text} />
            ))}
          </FeedList>
        </Stack>
      }
      title="Sign in"
      description="Welcome back. Use your account to continue."
      notice={
        <>
          {!online && (
            <Banner tone="warning" title="Offline">
              {OFFLINE}
            </Banner>
          )}
          {hasSummary && (
            <Notice ref={summary} tone="danger" tabIndex={-1}>
              {serverError ? (
                serverError
              ) : (
                <>
                  <Text size="small" weight="semibold">
                    Check the following
                  </Text>
                  <Stack gap={1} align="start">
                    {listed.map((f) => (
                      <Button
                        key={f}
                        type="button"
                        variant="link"
                        size="sm"
                        onClick={() =>
                          (f === 'email' ? emailField : passwordField).current?.focus()
                        }
                      >
                        {fieldErrors[f]}
                      </Button>
                    ))}
                  </Stack>
                </>
              )}
            </Notice>
          )}
          {devSignIn && (
            <Panel variant="sunken">
              <Section
                title="Development sign-in"
                level={2}
                titleSize={4}
                gap={2}
                actions={<Badge variant="warning">Development only</Badge>}
              >
                <Text size="small">
                  Email: <Code>{devSignIn.adminEmail}</Code>
                </Text>
                <Text size="small">
                  Password:{' '}
                  {devSignIn.password ? (
                    <Code>{devSignIn.password}</Code>
                  ) : (
                    <>
                      your <Code>ADMIN_PASSWORD</Code> in <Code>apps/base-app/.env</Code>
                    </>
                  )}
                </Text>
                <Cluster>
                  <Button type="button" variant="outline" size="sm" onClick={fillDev}>
                    Fill dev login
                  </Button>
                </Cluster>
              </Section>
            </Panel>
          )}
        </>
      }
      form={
        <form onSubmit={onSubmit} noValidate aria-busy={sending}>
          <Stack gap={4}>
            <FormField label="Email" error={fieldErrors.email}>
              <Input
                ref={emailField}
                type="email"
                name="email"
                // "username" is what password managers key on; the email IS the username here
                autoComplete="username"
                inputMode="email"
                autoCapitalize="none"
                autoCorrect="off"
                spellCheck={false}
                required
                readOnly={sending}
                value={email}
                onChange={(e) => {
                  setEmail(e.target.value);
                  clearError('email');
                }}
              />
            </FormField>
            <FormField
              label="Password"
              error={fieldErrors.password}
              description={capsOn ? 'Caps Lock is on.' : undefined}
            >
              <PasswordInput
                ref={passwordField}
                name="password"
                autoComplete="current-password"
                required
                readOnly={sending}
                value={password}
                onChange={(e) => {
                  setPassword(e.target.value);
                  clearError('password');
                }}
                onKeyDown={readCaps}
                onKeyUp={readCaps}
                onBlur={() => setCapsOn(false)}
              />
            </FormField>
            {/* always mounted, so a screen reader hears the hint when it appears */}
            <Text role="status" className="sr-only">
              {capsOn ? 'Caps Lock is on.' : ''}
            </Text>
            <Button ref={submitButton} type="submit" variant="primary" size="xl" loading={sending}>
              {sending ? 'Signing in…' : 'Sign in'}
            </Button>
          </Stack>
        </form>
      }
      footer={
        <Link to="/forgot-password" {...buttonAttrs('link', 'sm')}>
          Forgot password?
        </Link>
      }
    />
  );
}

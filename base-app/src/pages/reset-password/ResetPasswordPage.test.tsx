import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '~/core/auth';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole } from '~/test/dom';
import { locationNow } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import ResetPasswordPage from './ResetPasswordPage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  window.history.replaceState(null, '', '/');
});

const SAM = { id: 'u1', name: 'Sam Jones', email: 'sam@example.com', role: 'viewer' as const };

function Probe() {
  const { user } = useAuth();
  return <p>{user ? `signed in as ${user.name}` : 'signed out'}</p>;
}

async function mount(hash: string, routes: Parameters<typeof mockApi>[0] = {}) {
  window.history.replaceState(null, '', hash);
  const api = mockApi({ user: null, ...routes });
  view = await render(
    <AuthProvider>
      <ResetPasswordPage />
      <Probe />
    </AuthProvider>,
  );
  await flush(4);
  return api;
}

const password = () => {
  const el = document.querySelector<HTMLInputElement>('input[name="new-password"]');
  if (!el) throw new Error('no password field');
  return el;
};
const submit = async (value: string) => {
  await changeValue(password(), value);
  await click(getByRole(document.body, 'button', 'Save password'));
  await flush(4);
};

describe('ResetPasswordPage', () => {
  it('asks for a new password and takes the token out of the address', async () => {
    await mount('/reset-password#token=tok9');
    expect(document.querySelector('h1')?.textContent).toBe('Choose a new password');
    expect(password().getAttribute('autocomplete')).toBe('new-password');
    expect(locationNow()).toBe('/reset-password');
    expect(window.location.href).not.toContain('tok9');
  });

  it('without a token it is the generic invalid screen, with a way to ask again', async () => {
    await mount('/reset-password');
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
    expect(getByRole(document.body, 'link', 'Request a new link').getAttribute('href')).toBe(
      '/forgot-password',
    );
    expect(getByRole(document.body, 'link', 'Go to sign in').getAttribute('href')).toBe('/');
  });

  it('saves the password, signs in and goes home', async () => {
    let sent: unknown;
    await mount('/reset-password#token=tok9', {
      routes: {
        'POST /api/auth/reset-password': (req) => {
          sent = req.body;
          return { body: { ok: true, user: SAM } };
        },
      },
    });
    await submit('quiet-harbour-lamp-4721');
    expect(sent).toEqual({ token: 'tok9', password: 'quiet-harbour-lamp-4721' });
    expect(document.body.textContent).toContain('signed in as Sam Jones');
    expect(locationNow()).toBe('/');
  });

  it('shows a policy refusal under the field and keeps the link usable', async () => {
    await mount('/reset-password#token=tok9', {
      routes: {
        'POST /api/auth/reset-password': {
          status: 400,
          body: {
            ok: false,
            error: { code: 'password_too_short', message: 'Use at least 10 characters.' },
          },
        },
      },
    });
    await submit('short');
    expect(document.body.textContent).toContain('Use at least 10 characters.');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    expect(document.querySelector('h1')?.textContent).toBe('Choose a new password');
  });

  it('an expired or used link ends on the invalid screen', async () => {
    await mount('/reset-password#token=tok9', {
      routes: {
        'POST /api/auth/reset-password': {
          status: 400,
          body: {
            ok: false,
            error: { code: 'invalid_token', message: 'This link is invalid or has expired.' },
          },
        },
      },
    });
    await submit('quiet-harbour-lamp-4721');
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
  });

  it('has no axe violations', async () => {
    await mount('/reset-password#token=tok9');
    expect(formatViolations(await runAxe())).toBe('');
  });
});

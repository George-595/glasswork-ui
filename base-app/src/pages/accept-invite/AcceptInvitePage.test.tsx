import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider, useAuth } from '~/core/auth';
import { config } from '~/core/config';
import { formatViolations, runAxe } from '~/test/axe';
import { changeValue, click, getByRole } from '~/test/dom';
import { locationNow } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import AcceptInvitePage from './AcceptInvitePage';

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  window.history.replaceState(null, '', '/');
});

const SAM = { id: 'u1', name: 'Sam Jones', email: 'sam@example.com', role: 'viewer' as const };
const INVALID = {
  status: 400,
  body: {
    ok: false,
    error: { code: 'invalid_token', message: 'This link is invalid or has expired.' },
  },
};

function Probe() {
  const { user } = useAuth();
  return <p>{user ? `signed in as ${user.name}` : 'signed out'}</p>;
}

async function mount(hash: string, routes: Parameters<typeof mockApi>[0] = { user: null }) {
  window.history.replaceState(null, '', hash);
  const api = mockApi({ user: null, ...routes });
  view = await render(
    <AuthProvider>
      <AcceptInvitePage />
      <Probe />
    </AuthProvider>,
  );
  await flush(4);
  return api;
}

const invite = {
  'GET /api/auth/invite/tok123': {
    body: { ok: true, invite: { name: 'Sam', email: 'sam@example.com' } },
  },
};
const password = () => {
  const el = document.querySelector<HTMLInputElement>('input[name="new-password"]');
  if (!el) throw new Error('no password field');
  return el;
};

describe('AcceptInvitePage', () => {
  it('greets the invitee by email, prefills the name and takes the token out of the address', async () => {
    await mount('/accept-invite#token=tok123', { user: null, routes: invite });
    expect(document.querySelector('h1')?.textContent).toBe('Accept your invitation');
    expect(document.body.textContent).toContain(`Join ${config.appName} as sam@example.com.`);
    expect(getByRole(document.body, 'textbox', 'Your name')).toHaveProperty('value', 'Sam');
    const email = document.querySelector<HTMLInputElement>('input[name="email"]');
    expect(email?.readOnly).toBe(true);
    expect(email?.value).toBe('sam@example.com');
    expect(password().getAttribute('autocomplete')).toBe('new-password');
    expect(locationNow()).toBe('/accept-invite');
    expect(window.location.href).not.toContain('tok123');
  });

  it('shows the generic invalid screen for a bad link, with a way to sign in', async () => {
    await mount('/accept-invite#token=old', {
      user: null,
      routes: { 'GET /api/auth/invite/old': INVALID },
    });
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
    expect(getByRole(document.body, 'link', 'Go to sign in').getAttribute('href')).toBe('/');
    expect(document.querySelector('input')).toBeNull();
  });

  it('treats a missing token like an invalid one without calling the server', async () => {
    const api = await mount('/accept-invite');
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
    expect(api.calls.filter((c) => c.includes('/api/auth/invite'))).toEqual([]);
  });

  it('joins: sends token, name and password, signs the user in and goes home', async () => {
    let sent: unknown;
    await mount('/accept-invite#token=tok123', {
      user: null,
      routes: {
        ...invite,
        'POST /api/auth/accept-invite': (req) => {
          sent = req.body;
          return { body: { ok: true, user: SAM } };
        },
      },
    });
    await changeValue(getByRole(document.body, 'textbox', 'Your name'), 'Sam Jones');
    await changeValue(password(), 'quiet-harbour-lamp-4721');
    await click(getByRole(document.body, 'button', 'Join'));
    await flush(4);
    expect(sent).toEqual({
      token: 'tok123',
      name: 'Sam Jones',
      password: 'quiet-harbour-lamp-4721',
    });
    expect(document.body.textContent).toContain('signed in as Sam Jones');
    expect(locationNow()).toBe('/');
  });

  it("puts the server's password refusal under the password field and keeps the form", async () => {
    await mount('/accept-invite#token=tok123', {
      user: null,
      routes: {
        ...invite,
        'POST /api/auth/accept-invite': {
          status: 400,
          body: {
            ok: false,
            error: { code: 'password_common', message: 'That password is too common.' },
          },
        },
      },
    });
    await changeValue(password(), 'password123');
    await click(getByRole(document.body, 'button', 'Join'));
    await flush(4);
    expect(document.body.textContent).toContain('That password is too common.');
    expect(password().getAttribute('aria-invalid')).toBe('true');
    expect(document.activeElement).toBe(password());
    expect(document.body.textContent).toContain('signed out');
  });

  it('asks for a password before calling the server', async () => {
    const api = await mount('/accept-invite#token=tok123', { user: null, routes: invite });
    await click(getByRole(document.body, 'button', 'Join'));
    expect(document.body.textContent).toContain('Choose a password.');
    expect(api.calls).not.toContain('POST /api/auth/accept-invite');
  });

  it('a link spent between looking and joining ends on the invalid screen', async () => {
    await mount('/accept-invite#token=tok123', {
      user: null,
      routes: { ...invite, 'POST /api/auth/accept-invite': INVALID },
    });
    await changeValue(password(), 'quiet-harbour-lamp-4721');
    await click(getByRole(document.body, 'button', 'Join'));
    await flush(4);
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
  });

  it('has no axe violations', async () => {
    await mount('/accept-invite#token=tok123', { user: null, routes: invite });
    const violations = await runAxe();
    expect(formatViolations(violations)).toBe('');
  });
});

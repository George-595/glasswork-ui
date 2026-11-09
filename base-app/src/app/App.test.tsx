/* The auth gate through the real App: loading, signed out, sign-in, sign-out, and the admin rules. */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { changeValue, click, getAllByRole, getByRole } from '~/test/dom';
import { locationNow, setLocation } from '~/test/location';
import { ADMIN, mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { App } from './App';
import { loadSignedIn } from './SignedInGate';

// The signed-in app is its own chunk (SignedInGate.tsx). The browser has it fetched before it hydrates;
// load it once up front so a test's first render finds it, instead of racing its first transform.
beforeAll(loadSignedIn);

function app() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>
  );
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

/* Mount the app at a hash, then let the session and the page settle. */
async function mount(hash: string) {
  setLocation(hrefFor(hash));
  view = await render(app());
  await flush(8);
  return view;
}

function passwordField(): HTMLInputElement {
  const el = document.querySelector<HTMLInputElement>('input[type="password"]');
  if (!el) throw new Error('no password field');
  return el;
}

async function signIn(email: string, password: string) {
  await changeValue(getByRole(document.body, 'textbox', 'Email'), email);
  await changeValue(passwordField(), password);
  await click(getByRole(document.body, 'button', 'Sign in'));
  await flush(8);
}

/* A lazily loaded page arrives after an import, which can take a while the first time. */
async function untilHeading(text: string): Promise<void> {
  for (let i = 0; i < 150 && document.querySelector('h1')?.textContent !== text; i++) {
    await flush(1);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('App auth gate', () => {
  it('shows a loading skeleton while the session is read', async () => {
    const api = mockApi({ delay: true });
    setLocation(hrefFor('/'));
    view = await render(app());
    await flush(2);

    const region = getByRole(document.body, 'group', 'Loading your session');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('input[type="password"]')).toBeNull();

    api.release();
    await flush(8);
    expect(document.querySelector('[aria-label="Loading your session"]')).toBeNull();
  });

  it('shows the sign-in page, and no shell, when nobody is signed in', async () => {
    mockApi({ user: null });
    await mount('/table');

    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
    expect(getByRole(document.body, 'textbox', 'Email')).toBe(document.activeElement);
    expect(document.querySelector('.ui-sidebar')).toBeNull();
  });

  it('a successful sign-in shows the shell on the page the user first asked for', async () => {
    let signedIn = false;
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': () => {
          signedIn = true;
          return { body: { ok: true, user: ADMIN } };
        },
        'GET /api/auth/me': () => ({ body: { ok: true, user: signedIn ? ADMIN : null } }),
        'GET /api/transactions': () =>
          signedIn
            ? { body: { ok: true, transactions: [] } }
            : {
                status: 401,
                body: { ok: false, error: { code: 'unauthenticated', message: 'x' } },
              },
      },
    });
    await mount('/table');
    await signIn(ADMIN.email, 'correct-horse');

    expect(getByRole(document.body, 'button', ADMIN.name)).toBeTruthy();
    expect(locationNow()).toBe('/table');
    expect(document.querySelector('.ui-sidebar')).not.toBeNull();
    expect(document.querySelector('h1')?.textContent).not.toBe('Sign in');
  });

  it('an invalid sign-in shows the alert and stays on the sign-in page', async () => {
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': {
          status: 401,
          body: { ok: false, error: { code: 'invalid_credentials', message: 'Nope.' } },
        },
      },
    });
    await mount('/');
    await signIn(ADMIN.email, 'wrong');

    const alert = getByRole(document.body, 'alert');
    expect(alert.textContent).toBe("That email or password isn't right.");
    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
  });

  it('signing out returns to the sign-in page', async () => {
    mockApi();
    await mount('/');
    await click(getByRole(document.body, 'button', ADMIN.name));
    await click(getByRole(document.body, 'menuitem', 'Sign out'));
    await flush(8);

    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
  });
});

describe('App admin rules', () => {
  it('an admin sees the Admin group and the Admin menu', async () => {
    mockApi();
    await mount('/');

    const groups = Array.from(document.querySelectorAll('.ui-sidebar-group-label'));
    expect(groups.map((g) => g.textContent)).toContain('Admin');
    expect(getAllByRole(document.body, 'button', 'Admin')).toHaveLength(1);
  });

  it('a viewer sees no Admin menu and no Admin group', async () => {
    mockApi({ user: VIEWER });
    await mount('/');

    const groups = Array.from(document.querySelectorAll('.ui-sidebar-group-label'));
    expect(groups.map((g) => g.textContent)).not.toContain('Admin');
    expect(getAllByRole(document.body, 'button', 'Admin')).toHaveLength(0);
    expect(getByRole(document.body, 'button', VIEWER.name)).toBeTruthy();
  });

  it('a viewer on an admin route gets Not authorised inside the shell', async () => {
    mockApi({ user: VIEWER });
    await mount('/admin/users');

    expect(document.querySelector('h1')?.textContent).toBe('Not authorised');
    expect(document.querySelector('.ui-sidebar')).not.toBeNull();
    expect(document.querySelector('.ui-page-layout')).not.toBeNull();
  });

  it('shows a public page in place of the sign-in page when signed out, and offers the link from sign-in', async () => {
    mockApi({ user: null });
    await mount('/forgot-password');
    await untilHeading('Forgot your password?');
    expect(document.querySelector('h1')?.textContent).toBe('Forgot your password?');
    expect(document.querySelector('.ui-sidebar')).toBeNull();
    await view?.unmount();

    mockApi({ user: null });
    await mount('/');
    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
    expect(getByRole(document.body, 'link', 'Forgot password?').getAttribute('href')).toBe(
      '/forgot-password',
    );
  });

  it('shows a public page even to someone already signed in, with no shell', async () => {
    mockApi({ user: ADMIN });
    await mount('/reset-password');
    await untilHeading('This link is invalid or has expired');
    expect(document.querySelector('h1')?.textContent).toBe('This link is invalid or has expired');
    expect(document.querySelector('.ui-sidebar')).toBeNull();
  });

  it('has Account in the user menu', async () => {
    mockApi({ user: ADMIN });
    await mount('/');
    const trigger = getByRole(document.body, 'button', ADMIN.name);
    await click(trigger);
    await flush(2);
    await click(getByRole(document.body, 'menuitem', 'Account'));
    await untilHeading('Account');
    expect(locationNow()).toBe('/account');
    expect(document.querySelector('h1')?.textContent).toBe('Account');
  });
});

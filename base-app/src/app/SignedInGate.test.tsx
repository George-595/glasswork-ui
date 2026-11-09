/* The signed-in app is its own file (SignedInGate.tsx): a signed-out visitor never fetches it,
   someone who signs in sees the loading screen while it arrives, and a browser that fetched it
   before hydrating draws the shell on the very first render. This file never preloads it (the
   other App tests do), so the first test sees the module as a visitor's browser would. */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { changeValue, click, getByRole } from '~/test/dom';
import { setLocation } from '~/test/location';
import { ADMIN, mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { App } from './App';
import { loadInitialRoute } from './prefetch';
import { loadSignedIn } from './SignedInGate';

// the factory runs when something first imports the module
const imported = vi.hoisted(() => ({ signedIn: false }));
vi.mock('./SignedIn', async (importOriginal) => {
  imported.signedIn = true;
  return importOriginal();
});

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

async function untilShell(): Promise<void> {
  for (let i = 0; i < 150 && !document.querySelector('.ui-shell'); i++) {
    await flush(1);
    await new Promise((r) => setTimeout(r, 20));
  }
}

describe('the signed-in app is loaded only for someone signed in', () => {
  it('a signed-out visitor sees the sign-in page and never imports it', async () => {
    mockApi({ user: null });
    setLocation(hrefFor('/table'));
    view = await render(app());
    await flush(8);
    expect(document.querySelector('h1')?.textContent).toBe('Sign in');
    expect(imported.signedIn).toBe(false);
  });

  it('the first-screen loader fetches it for someone signed in, and only then', async () => {
    await loadInitialRoute('/table', false);
    await loadInitialRoute('/forgot-password', true); // a public page has no shell
    expect(imported.signedIn).toBe(false);
    await loadInitialRoute('/table', true);
    expect(imported.signedIn).toBe(true);
  });

  it('signing in brings up the shell', async () => {
    let signedIn = false;
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': () => {
          signedIn = true;
          return { body: { ok: true, user: ADMIN } };
        },
        'GET /api/auth/me': () => ({ body: { ok: true, user: signedIn ? ADMIN : null } }),
      },
    });
    setLocation(hrefFor('/'));
    view = await render(app());
    await flush(8);
    await changeValue(getByRole(document.body, 'textbox', 'Email'), ADMIN.email);
    await changeValue(
      document.querySelector('input[type="password"]') as HTMLInputElement,
      'correct horse battery',
    );
    await click(getByRole(document.body, 'button', 'Sign in'));
    await untilShell();
    expect(imported.signedIn).toBe(true);
    expect(document.querySelector('.ui-shell')).not.toBeNull();
  });

  it('once loaded, a visitor’s first render draws the shell at once (no loading screen)', async () => {
    await loadSignedIn();
    mockApi();
    setLocation(hrefFor('/tool-1'));
    view = await render(app());
    await flush(3);
    expect(document.querySelector('[aria-label="Loading your workspace"]')).toBeNull();
    expect(document.querySelector('.ui-shell')).not.toBeNull();
  });
});

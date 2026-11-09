import { act, useEffect } from 'react';
import { describe, expect, it } from 'vitest';
import { ApiError } from '~/core/api';
import { ADMIN, mockApi, VIEWER } from '~/test/mockApi';
import { flush, render } from '~/test/render';
import { AuthProvider, type AuthState } from './AuthProvider';
import { useAuth } from './useAuth';

/* A probe that prints the auth state and hands the latest state to the test through `box`. */
const box: { current: AuthState | null } = { current: null };
function Probe() {
  const auth = useAuth();
  useEffect(() => {
    box.current = auth;
  });
  return (
    <p data-testid="state">
      {auth.status}|{auth.user?.role ?? 'none'}|{String(auth.isAdmin)}
    </p>
  );
}

function state(container: HTMLElement): string {
  return container.querySelector('[data-testid="state"]')?.textContent ?? '';
}

async function mount() {
  const view = await render(
    <AuthProvider>
      <Probe />
    </AuthProvider>,
  );
  await flush();
  return view;
}

describe('AuthProvider', () => {
  it('starts loading, then reads /api/auth/me once and reports the admin', async () => {
    const api = mockApi();
    const view = await mount();
    expect(state(view.container)).toBe('signed-in|admin|true');
    expect(api.calls.filter((c) => c === 'GET /api/auth/me')).toHaveLength(1);
    await view.unmount();
  });

  it('reports signed-out when /api/auth/me has no user', async () => {
    mockApi({ user: null });
    const view = await mount();
    expect(state(view.container)).toBe('signed-out|none|false');
    await view.unmount();
  });

  it('reports a non-admin as signed in but not admin', async () => {
    mockApi({ user: VIEWER });
    const view = await mount();
    expect(state(view.container)).toBe('signed-in|viewer|false');
    await view.unmount();
  });

  it('treats an unreachable API as signed out', async () => {
    const view = await mount(); // no mockApi: fetch rejects
    expect(state(view.container)).toBe('signed-out|none|false');
    await view.unmount();
  });

  it('login signs in with the returned user', async () => {
    mockApi({
      user: null,
      routes: { 'POST /api/auth/login': { body: { ok: true, user: ADMIN } } },
    });
    const view = await mount();
    await act(async () => {
      await box.current?.login(ADMIN.email, 'secret');
    });
    expect(state(view.container)).toBe('signed-in|admin|true');
    await view.unmount();
  });

  it('login throws the ApiError and stays signed out', async () => {
    mockApi({
      user: null,
      routes: {
        'POST /api/auth/login': {
          status: 401,
          body: { ok: false, error: { code: 'invalid_credentials', message: 'Nope.' } },
        },
      },
    });
    const view = await mount();
    let caught: unknown;
    await act(async () => {
      try {
        await box.current?.login(ADMIN.email, 'wrong');
      } catch (err) {
        caught = err;
      }
    });
    expect(caught).toBeInstanceOf(ApiError);
    expect((caught as ApiError).code).toBe('invalid_credentials');
    expect(state(view.container)).toBe('signed-out|none|false');
    await view.unmount();
  });

  it('logout returns to signed-out even when the request fails', async () => {
    mockApi({
      routes: {
        'POST /api/auth/logout': {
          status: 500,
          body: { ok: false, error: { code: 'x', message: 'y' } },
        },
      },
    });
    const view = await mount();
    expect(state(view.container)).toBe('signed-in|admin|true');
    await act(async () => {
      await box.current?.logout();
    });
    expect(state(view.container)).toBe('signed-out|none|false');
    await view.unmount();
  });

  it('re-checks the session when the window regains focus', async () => {
    const api = mockApi();
    const view = await mount();
    api.fetch.mockClear();
    api.calls.length = 0;
    // The session has ended on the server; the next check must see it.
    api.fetch.mockImplementation(
      async () => new Response(JSON.stringify({ ok: true, user: null })),
    );
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush();
    expect(state(view.container)).toBe('signed-out|none|false');
    await view.unmount();
  });
});

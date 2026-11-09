import { act, useEffect } from 'react';
import { afterEach, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { mockApi, VIEWER } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { SettingsProvider, type SettingsState, useSettings } from './SettingsProvider';

let seen: SettingsState | null = null;
function Probe() {
  const settings = useSettings();
  useEffect(() => {
    seen = settings;
  });
  return <p>{settings.workspaceName}</p>;
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
  seen = null;
});

const withAuth = (
  <AuthProvider>
    <SettingsProvider>
      <Probe />
    </SettingsProvider>
  </AuthProvider>
);

describe('SettingsProvider', () => {
  it('returns the defaults, and fetches nothing, without a provider', async () => {
    const api = mockApi();
    view = await render(<Probe />);
    expect(seen?.workspaceName).toBe('Base app');
    expect(seen?.maintenance).toEqual({ enabled: false, message: '' });
    expect(seen?.status).toBe('idle');
    expect(api.calls).toHaveLength(0);
  });

  it('reads the settings once the user is signed in, and not before', async () => {
    const api = mockApi({ user: null });
    view = await render(withAuth);
    await flush(6);
    expect(api.calls).not.toContain('GET /api/settings');
    expect(seen?.status).toBe('idle');
  });

  it('loads the public settings for a signed-in user', async () => {
    mockApi({
      user: VIEWER,
      settings: {
        'workspace.name': 'Acme HQ',
        'maintenance.enabled': true,
        'maintenance.message': 'Soon',
      },
    });
    view = await render(withAuth);
    await flush(6);
    expect(seen).toMatchObject({
      status: 'ready',
      workspaceName: 'Acme HQ',
      maintenance: { enabled: true, message: 'Soon' },
    });
  });

  it('reads again when the window regains focus', async () => {
    const api = mockApi();
    view = await render(withAuth);
    await flush(6);
    api.settings['workspace.name'] = 'Renamed';
    await act(async () => {
      window.dispatchEvent(new Event('focus'));
    });
    await flush(4);
    expect(seen?.workspaceName).toBe('Renamed');
  });

  it('keeps the last good values when a read fails', async () => {
    let fail = false;
    mockApi({
      settings: { 'workspace.name': 'Acme HQ' },
      routes: {
        'GET /api/settings': () =>
          fail
            ? { status: 500, body: { ok: false, error: { code: 'internal_error', message: 'x' } } }
            : {
                body: {
                  ok: true,
                  settings: {
                    'workspace.name': 'Acme HQ',
                    'maintenance.enabled': false,
                    'maintenance.message': '',
                  },
                },
              },
      },
    });
    view = await render(withAuth);
    await flush(6);
    fail = true;
    await act(async () => {
      await seen?.refresh();
    });
    expect(seen).toMatchObject({ status: 'ready', workspaceName: 'Acme HQ' });
  });

  it('save() stores through PUT and the new values show at once', async () => {
    const api = mockApi();
    view = await render(withAuth);
    await flush(6);
    await act(async () => {
      await seen?.save({ 'workspace.name': 'Acme HQ' });
    });
    expect(api.calls).toContain('PUT /api/settings');
    expect(seen?.workspaceName).toBe('Acme HQ');
  });

  it('save() rejects with the API error and changes nothing', async () => {
    mockApi({
      routes: {
        'PUT /api/settings': {
          status: 400,
          body: {
            ok: false,
            error: { code: 'invalid_setting', message: 'Enter the workspace name.' },
          },
        },
      },
    });
    view = await render(withAuth);
    await flush(6);
    let error: unknown;
    await act(async () => {
      await seen?.save({ 'workspace.name': '' }).catch((e: unknown) => {
        error = e;
      });
    });
    expect(error).toMatchObject({ code: 'invalid_setting', status: 400 });
    expect(seen?.workspaceName).toBe('Base app');
  });
});

/* Maintenance mode and the workspace name through the real App: what a non-admin sees while it is
   on, what an admin sees, and how the client finds out (the settings, a 503 from any call). */
import { afterEach, beforeAll, describe, expect, it } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { SettingsProvider } from '~/core/settings';
import { ThemeProvider } from '~/core/ui';
import { formatViolations, runAxe } from '~/test/axe';
import { click, getByRole } from '~/test/dom';
import { setLocation } from '~/test/location';
import { mockApi, VIEWER } from '~/test/mockApi';
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
        <SettingsProvider>
          <App />
        </SettingsProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}

let view: Rendered | null = null;
afterEach(async () => {
  await view?.unmount();
  view = null;
});

async function mount(hash = '/', opts: Parameters<typeof render>[1] = {}) {
  setLocation(hrefFor(hash));
  view = await render(app(), opts);
  await flush(8);
}

const ON = { 'maintenance.enabled': true, 'maintenance.message': 'Back at 3pm, sorry!' } as const;
const banner = () => document.querySelector<HTMLElement>('.ui-banner');
const backSoon = () => document.body.textContent?.includes('We’ll be back soon') ?? false;

describe('maintenance mode, as a non-admin', () => {
  it('replaces the app with the "back soon" page and the admin’s message, with no shell', async () => {
    mockApi({ user: VIEWER, settings: ON });
    await mount();
    expect(document.querySelector('h1')?.textContent).toBe('We’ll be back soon');
    expect(document.body.textContent).toContain('Back at 3pm, sorry!');
    expect(document.querySelector('.ui-sidebar')).toBeNull();
    expect(document.querySelectorAll('main')).toHaveLength(1);
    expect(document.querySelector('main')?.id).toBe('main');
  });

  it('"Check again" brings the app back once maintenance is over', async () => {
    const api = mockApi({ user: VIEWER, settings: ON });
    await mount();
    expect(backSoon()).toBe(true);
    api.settings['maintenance.enabled'] = false;
    await click(getByRole(document.body, 'button', 'Check again'));
    await flush(8);
    expect(backSoon()).toBe(false);
    expect(document.querySelector('.ui-sidebar')).not.toBeNull();
  });

  it('can sign out from it', async () => {
    const api = mockApi({ user: VIEWER, settings: ON });
    await mount();
    await click(getByRole(document.body, 'button', 'Sign out'));
    await flush(4);
    expect(api.calls).toContain('POST /api/auth/logout');
  });

  it('sees the app normally when maintenance is off, with no banner', async () => {
    mockApi({ user: VIEWER });
    await mount();
    expect(backSoon()).toBe(false);
    expect(document.querySelector('.ui-sidebar')).not.toBeNull();
    expect(banner()).toBeNull();
  });

  it('is moved to the page by a 503 maintenance from any call (the switch was flipped under them)', async () => {
    const api = mockApi({
      user: VIEWER,
      routes: {
        'GET /api/activity': {
          status: 503,
          body: { ok: false, error: { code: 'maintenance', message: 'Back at 3pm, sorry!' } },
        },
      },
    });
    api.settings['maintenance.enabled'] = false;
    // the server turns it on between the first read and the page's own request
    const original = api.fetch.getMockImplementation();
    let turnedOn = false;
    api.fetch.mockImplementation(async (input, init) => {
      if (String(input).endsWith('/api/activity') && !turnedOn) {
        turnedOn = true;
        Object.assign(api.settings, ON);
      }
      return (original as typeof fetch)(input, init);
    });
    await mount('/');
    expect(backSoon()).toBe(true);
    expect(document.body.textContent).toContain('Back at 3pm, sorry!');
  });
});

describe('maintenance mode, as an admin', () => {
  it('keeps the app and warns with a banner that links to the settings', async () => {
    mockApi({ settings: ON });
    await mount();
    expect(backSoon()).toBe(false);
    expect(document.querySelector('.ui-sidebar')).not.toBeNull();
    const b = banner() as HTMLElement;
    expect(b.textContent).toContain('Maintenance mode is on.');
    expect(b.textContent).toContain('Only admins can use the app.');
    expect(b.getAttribute('role')).toBe('status');
    const link = b.querySelector('a') as HTMLAnchorElement;
    expect(link.textContent).toBe('Open settings');
    expect(link.getAttribute('href')).toBe(hrefFor('/admin/settings'));
  });

  it('shows no banner when it is off', async () => {
    mockApi();
    await mount();
    expect(banner()).toBeNull();
  });
});

describe('the workspace name', () => {
  it('replaces the app name in the sidebar', async () => {
    mockApi({ settings: { 'workspace.name': 'Acme HQ' } });
    await mount();
    expect(document.querySelector('.ui-sidebar')?.textContent).toContain('Acme HQ');
  });

  it('falls back to the app name while the settings are unknown', async () => {
    mockApi({
      routes: {
        'GET /api/settings': {
          status: 500,
          body: { ok: false, error: { code: 'internal_error', message: 'x' } },
        },
      },
    });
    await mount();
    expect(document.querySelector('.ui-sidebar')?.textContent).toContain('Base app');
  });
});

describe('a11y maintenance', () => {
  for (const skin of ['enterprise', 'glass'] as const) {
    for (const mode of ['light', 'dark'] as const) {
      it(`back soon page · ${skin} · ${mode}`, async () => {
        mockApi({ user: VIEWER, settings: ON });
        await mount('/', { skin, mode });
        expect(backSoon()).toBe(true);
        expect(formatViolations(await runAxe())).toBe('');
      });

      it(`admin banner · ${skin} · ${mode}`, async () => {
        mockApi({ settings: ON });
        await mount('/', { skin, mode });
        expect(banner()).not.toBeNull();
        expect(formatViolations(await runAxe())).toBe('');
      });
    }
  }
});

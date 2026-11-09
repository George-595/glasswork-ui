/* A page's file that cannot be fetched, through the real App: the loading fallback, the one
   automatic reload after a deploy, and the plain-words screens (online and offline). */
import { act } from 'react';
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { AuthProvider } from '~/core/auth';
import { hrefFor } from '~/core/router';
import { ThemeProvider } from '~/core/ui';
import { click, getByRole, queryByText } from '~/test/dom';
import { setLocation } from '~/test/location';
import { mockApi } from '~/test/mockApi';
import { flush, type Rendered, render } from '~/test/render';
import { App } from './App';
import { resetChunkRecovery } from './chunk-errors';
import { reloadApp } from './reload';
import { PUBLIC_ROUTES, ROUTES } from './routes';
import { loadSignedIn } from './SignedInGate';

vi.mock('./reload', () => ({ reloadApp: vi.fn<() => void>() }));

const GONE =
  'Failed to fetch dynamically imported module: https://app.test/assets/ToolOnePage-3f9a.js';

// The signed-in app is its own chunk (SignedInGate.tsx). The browser has it fetched before it hydrates;
// load it once up front so a test's first render finds it, instead of racing its first transform.
beforeAll(loadSignedIn);

let view: Rendered | null = null;

beforeEach(() => {
  resetChunkRecovery();
  sessionStorage.clear();
  vi.mocked(reloadApp).mockClear();
  vi.spyOn(console, 'error').mockImplementation(() => {});
});

afterEach(async () => {
  await view?.unmount();
  view = null;
  vi.restoreAllMocks();
});

const route = (id: string) => {
  const found = [...ROUTES, ...PUBLIC_ROUTES].find((r) => r.id === id);
  if (!found) throw new Error(`no route ${id}`);
  return found;
};

async function mount(hash: string) {
  setLocation(hrefFor(hash));
  view = await render(
    <ThemeProvider>
      <AuthProvider>
        <App />
      </AuthProvider>
    </ThemeProvider>,
  );
  await flush(8);
}

async function setOnline(online: boolean) {
  await act(async () => {
    vi.spyOn(navigator, 'onLine', 'get').mockReturnValue(online);
    window.dispatchEvent(new Event(online ? 'online' : 'offline'));
  });
}

const text = () => document.body.textContent ?? '';

describe('while a page loads', () => {
  it('shows a page skeleton in a loading region, not a bare "Loading…"', async () => {
    // each test uses its own route: React.lazy remembers what its first load did
    vi.spyOn(route('account'), 'load').mockReturnValue(new Promise(() => {}));
    mockApi();
    await mount('/account');
    const region = getByRole(document.body, 'group', 'Loading the page');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(region.closest('main')).not.toBeNull(); // inside the shell: the frame does not jump
    expect(text()).not.toContain('Loading…');
  });

  it('a public page gets the sign-in layout with a skeleton, as the session gate does', async () => {
    vi.spyOn(route('reset-password'), 'load').mockReturnValue(new Promise(() => {}));
    mockApi({ user: null });
    await mount('/reset-password');
    const region = getByRole(document.body, 'group', 'Loading the page');
    expect(region.getAttribute('aria-busy')).toBe('true');
    expect(document.querySelector('.ui-sidebar')).toBeNull();
  });
});

describe('a page file that is gone (a new version was deployed)', () => {
  it('reloads the app once, and keeps the skeleton up meanwhile instead of an error', async () => {
    vi.spyOn(route('graphs'), 'load').mockRejectedValue(new TypeError(GONE));
    mockApi();
    await mount('/graphs');
    expect(reloadApp).toHaveBeenCalledTimes(1);
    expect(sessionStorage.getItem('app-chunk-reload-at')).not.toBeNull();
    expect(queryByText(document.body, 'This page could not be shown.')).toBeNull();
    expect(queryByText(document.body, 'The app has been updated.')).toBeNull();
    expect(getByRole(document.body, 'group', 'Loading the page')).toBeTruthy();
  });

  it('after a reload that did not help, says so in plain words with a big Reload button', async () => {
    sessionStorage.setItem('app-chunk-reload-at', String(Date.now()));
    vi.spyOn(route('table'), 'load').mockRejectedValue(new TypeError(GONE));
    mockApi();
    await mount('/table');
    expect(reloadApp).not.toHaveBeenCalled();
    expect(text()).toContain('The app has been updated.');
    expect(text()).toContain('Reload to carry on.');
    // the browser's wording is for the log, not the person using it
    expect(text()).not.toContain('dynamically imported module');
    expect(text()).not.toContain('ToolOnePage-3f9a.js');
    expect(console.error).toHaveBeenCalledWith(
      expect.stringContaining('table'),
      expect.objectContaining({ message: GONE }),
    );

    await click(getByRole(document.body, 'button', 'Reload'));
    expect(reloadApp).toHaveBeenCalledTimes(1);
  });
});

describe('a page file that cannot be fetched offline', () => {
  it('says the screen needs a connection the first time, and Try again waits for it', async () => {
    await setOnline(false);
    const load = vi.spyOn(route('views'), 'load').mockRejectedValue(new TypeError(GONE));
    mockApi();
    await mount('/views');
    expect(reloadApp).not.toHaveBeenCalled(); // a reload offline would lose the app
    expect(text()).toContain('This screen needs a connection to open the first time.');
    expect(text()).not.toContain('dynamically imported module');
    const retry = getByRole(document.body, 'button', 'Try again') as HTMLButtonElement;
    expect(retry.disabled).toBe(true);

    await setOnline(true);
    expect((getByRole(document.body, 'button', 'Try again') as HTMLButtonElement).disabled).toBe(
      false,
    );

    load.mockRestore(); // the connection is back: the real file loads
    await click(getByRole(document.body, 'button', 'Try again'));
    for (let i = 0; i < 100 && !document.querySelector('h1'); i++) {
      await flush(1);
      await new Promise((r) => setTimeout(r, 20));
    }
    expect(document.querySelector('h1')?.textContent).toBe('Views');
  });
});

describe('a fault in the page itself', () => {
  it('keeps its message and Try again', async () => {
    vi.spyOn(route('tool-1'), 'load').mockRejectedValue(new Error('Boom from the page.'));
    mockApi();
    await mount('/tool-1');
    expect(reloadApp).not.toHaveBeenCalled();
    expect(text()).toContain('This page could not be shown.');
    expect(text()).toContain('Boom from the page.');
    expect(getByRole(document.body, 'button', 'Try again')).toBeTruthy();
  });
});

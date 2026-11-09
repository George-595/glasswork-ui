import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  installIntentPrefetch,
  prefetchWhenIdle,
  preloadInitialRoute,
  routesToPrefetch,
} from './prefetch';
import { ROUTES } from './routes';
import { reloadScreen } from './screens';

afterEach(() => {
  vi.restoreAllMocks();
  document.body.innerHTML = '';
});

const route = (id: string) => {
  const found = ROUTES.find((r) => r.id === id);
  if (!found) throw new Error(`no route ${id}`);
  return found;
};
/* Prefetching goes through the route's screen (screens.tsx), which keeps a loaded page: a fresh
   screen per spy, so each test sees its own fetch. */
const spyLoad = (id: string) => {
  const spy = vi.spyOn(route(id), 'load').mockResolvedValue({ default: () => null });
  reloadScreen(route(id));
  return spy;
};

describe('routesToPrefetch', () => {
  it('gives a non-admin every page that needs no admin role, once each', () => {
    const ids = routesToPrefetch(false).map((r) => r.id);
    expect(ids).toContain('home');
    expect(ids).toContain('account');
    expect(ids).not.toContain('admin-settings');
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('adds the admin pages for an admin', () => {
    expect(routesToPrefetch(true).map((r) => r.id)).toContain('admin-settings');
  });
});

describe('preloadInitialRoute', () => {
  it('starts the page the address names, and a public page for its address', () => {
    const graphs = spyLoad('graphs');
    preloadInitialRoute('/graphs?range=7');
    expect(graphs).toHaveBeenCalledTimes(1);
  });

  it('swallows a failed fetch: the real load reports it', async () => {
    const graphs = vi.spyOn(route('graphs'), 'load').mockRejectedValue(new TypeError('x'));
    reloadScreen(route('graphs'));
    preloadInitialRoute('/graphs');
    await new Promise((r) => setTimeout(r, 0));
    expect(graphs).toHaveBeenCalled();
    // an unhandled rejection would fail the run: vitest reports it as an error
  });
});

describe('prefetchWhenIdle', () => {
  const now = {
    settle: () => Promise.resolve(),
    idle: () => Promise.resolve(),
    saveData: () => false,
  };
  const tick = () => new Promise((r) => setTimeout(r, 0));

  it('fetches the routes one after the other', async () => {
    const order: string[] = [];
    let release: () => void = () => {};
    const slow = {
      id: 'test-slow',
      load: () =>
        new Promise<{ default: () => null }>((resolve) => {
          order.push('slow');
          release = () => resolve({ default: () => null });
        }),
    };
    const quick = {
      id: 'test-quick',
      load: () => {
        order.push('quick');
        return Promise.resolve({ default: () => null });
      },
    };
    prefetchWhenIdle([slow, quick], now);
    await tick();
    expect(order).toEqual(['slow']); // the second waits for the first
    release();
    await tick();
    expect(order).toEqual(['slow', 'quick']);
  });

  it('stops when cancelled', async () => {
    const load = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockResolvedValue({ default: () => null });
    const cancel = prefetchWhenIdle(
      [
        { id: 'test-a', load },
        { id: 'test-b', load },
      ],
      now,
    );
    cancel();
    await tick();
    expect(load).not.toHaveBeenCalled();
  });

  it('fetches nothing on Data Saver', async () => {
    const load = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockResolvedValue({ default: () => null });
    prefetchWhenIdle([{ id: 'test-a', load }], { ...now, saveData: () => true });
    await tick();
    expect(load).not.toHaveBeenCalled();
  });

  it('carries on past a page that fails to fetch', async () => {
    const load = vi
      .fn<() => Promise<{ default: () => null }>>()
      .mockResolvedValue({ default: () => null });
    prefetchWhenIdle(
      [
        { id: 'test-gone', load: () => Promise.reject(new TypeError('gone')) },
        { id: 'test-a', load },
      ],
      now,
    );
    await tick();
    await tick();
    expect(load).toHaveBeenCalledTimes(1);
  });
});

describe('installIntentPrefetch', () => {
  const press = (el: Element) =>
    el.dispatchEvent(new Event('pointerdown', { bubbles: true, cancelable: true }));

  it('fetches the page behind a link from the first touch', () => {
    const graphs = spyLoad('graphs');
    document.body.innerHTML =
      '<a href="/graphs"><span id="in">Graphs</span></a><a href="/nope" id="bad">x</a>';
    const remove = installIntentPrefetch();
    press(document.getElementById('in') as Element);
    expect(graphs).toHaveBeenCalledTimes(1);
    const notFound = vi.spyOn(ROUTES[0] as (typeof ROUTES)[number], 'load');
    press(document.getElementById('bad') as Element);
    expect(notFound).not.toHaveBeenCalled(); // an unknown address fetches nothing
    remove();
    press(document.getElementById('in') as Element);
    expect(graphs).toHaveBeenCalledTimes(1);
  });

  it('ignores controls that are not links and links that leave the app', () => {
    const home = spyLoad('home');
    document.body.innerHTML =
      '<label id="l"><span>Name</span><input type="text"></label><a id="out" href="https://example.test/">out</a>';
    const remove = installIntentPrefetch();
    press(document.querySelector('#l span') as Element);
    press(document.getElementById('out') as Element);
    expect(home).not.toHaveBeenCalled();
    remove();
  });
});

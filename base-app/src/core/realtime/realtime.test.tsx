import { act } from 'react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FakeEventSource } from '~/test/fakeEventSource';
import { render } from '~/test/render';
import { backoffDelay, RealtimeProvider, useEventStream, useRealtimeStatus } from './index';

const FakeSource = FakeEventSource;
type FakeSource = FakeEventSource;

const live = () => FakeSource.all.filter((s) => !s.closed);
const latest = () => FakeSource.all[FakeSource.all.length - 1] as FakeSource;

function Probe({ onEvent, onResync }: { onEvent: (d: unknown) => void; onResync: () => void }) {
  const status = useRealtimeStatus();
  useEventStream('notification', onEvent);
  useEventStream('resync', onResync);
  return <p data-testid="status">{status}</p>;
}
const status = (c: HTMLElement) => c.querySelector('[data-testid="status"]')?.textContent;

function setHidden(hidden: boolean) {
  Object.defineProperty(document, 'hidden', { configurable: true, value: hidden });
  document.dispatchEvent(new Event('visibilitychange'));
}

async function mount(props: Partial<Parameters<typeof RealtimeProvider>[0]> = {}) {
  const onEvent = vi.fn<(data: unknown) => void>();
  const onResync = vi.fn<() => void>();
  const view = await render(
    <RealtimeProvider
      createEventSource={(url) => new FakeSource(url)}
      random={() => 1}
      backoff={{ baseMs: 1000, maxMs: 8000 }}
      {...props}
    >
      <Probe onEvent={onEvent} onResync={onResync} />
    </RealtimeProvider>,
  );
  return { ...view, onEvent, onResync };
}

beforeEach(() => {
  FakeSource.all = [];
  vi.useFakeTimers();
});
afterEach(() => {
  vi.useRealTimers();
  setHidden(false);
});

describe('backoffDelay', () => {
  it('doubles up to the cap, with jitter between half and all of it', () => {
    const o = { baseMs: 1000, maxMs: 30_000 };
    expect([0, 1, 2, 3, 4, 5, 6].map((n) => backoffDelay(n, o, () => 1))).toEqual([
      1000, 2000, 4000, 8000, 16_000, 30_000, 30_000,
    ]);
    expect(backoffDelay(3, o, () => 0)).toBe(4000);
    expect(backoffDelay(3, o, () => 0.5)).toBe(6000);
    expect(backoffDelay(500, o, () => 1)).toBe(30_000);
  });
});

describe('RealtimeProvider', () => {
  it('opens GET /api/events and is open after ready', async () => {
    const { container, unmount } = await mount();
    expect(live()).toHaveLength(1);
    expect(latest().url).toBe('/api/events');
    expect(status(container)).toBe('connecting');
    await act(async () => latest().emit('ready', { time: 'x' }));
    expect(status(container)).toBe('open');
    await unmount();
    expect(live()).toHaveLength(0);
  });

  it('delivers parsed events to listeners, only the ones named', async () => {
    const { onEvent, onResync, unmount } = await mount();
    const source = latest();
    expect(source.listensTo('notification')).toBe(true);
    await act(async () => source.emit('ready'));
    await act(async () =>
      source.emit('notification', { notification: { id: 'n1' }, unreadCount: 3 }),
    );
    expect(onEvent).toHaveBeenCalledWith({ notification: { id: 'n1' }, unreadCount: 3 });
    expect(onResync).not.toHaveBeenCalled(); // not on the first connect
    await unmount();
  });

  it('hands over the raw text when the data is not JSON', async () => {
    const { onEvent, unmount } = await mount();
    await act(async () => latest().emit('notification', 'plain words'));
    expect(onEvent).toHaveBeenCalledWith('plain words');
    await unmount();
  });

  it('reconnects with backoff after an error and fires resync once it is back', async () => {
    const { container, onResync, unmount } = await mount();
    await act(async () => latest().emit('ready'));
    const first = latest();
    await act(async () => first.fail());
    expect(first.closed).toBe(true);
    expect(status(container)).toBe('reconnecting');
    expect(FakeSource.all).toHaveLength(1);

    await act(async () => void vi.advanceTimersByTime(999));
    expect(FakeSource.all).toHaveLength(1);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(2);

    // it fails again before getting ready: the wait doubles
    await act(async () => latest().fail());
    await act(async () => void vi.advanceTimersByTime(1999));
    expect(FakeSource.all).toHaveLength(2);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(3);

    expect(onResync).not.toHaveBeenCalled();
    await act(async () => latest().emit('ready'));
    expect(status(container)).toBe('open');
    expect(onResync).toHaveBeenCalledTimes(1);

    // a good connection resets the wait to the first step
    await act(async () => latest().fail());
    await act(async () => void vi.advanceTimersByTime(1000));
    expect(FakeSource.all).toHaveLength(4);
    await unmount();
  });

  it('caps the wait', async () => {
    const { unmount } = await mount();
    for (let i = 0; i < 8; i++) {
      await act(async () => latest().fail());
      await act(async () => void vi.advanceTimersByTime(8000));
    }
    const count = FakeSource.all.length;
    await act(async () => latest().fail());
    await act(async () => void vi.advanceTimersByTime(7999));
    expect(FakeSource.all).toHaveLength(count);
    await act(async () => void vi.advanceTimersByTime(1));
    expect(FakeSource.all).toHaveLength(count + 1);
    await unmount();
  });

  it('ignores an error from a source it already replaced', async () => {
    const { unmount } = await mount();
    const old = latest();
    await act(async () => old.fail());
    await act(async () => void vi.advanceTimersByTime(1000));
    expect(FakeSource.all).toHaveLength(2);
    await act(async () => old.fail());
    await act(async () => void vi.advanceTimersByTime(10_000));
    expect(FakeSource.all).toHaveLength(2);
    await unmount();
  });

  it('closes a tab hidden for longer than the grace, and resumes with a resync when it is visible', async () => {
    const { container, onResync, unmount } = await mount({ hiddenGraceMs: 60_000 });
    await act(async () => latest().emit('ready'));

    // a short absence keeps the stream
    await act(async () => setHidden(true));
    await act(async () => void vi.advanceTimersByTime(30_000));
    await act(async () => setHidden(false));
    expect(live()).toHaveLength(1);
    expect(status(container)).toBe('open');

    // a long one closes it
    await act(async () => setHidden(true));
    await act(async () => void vi.advanceTimersByTime(60_000));
    expect(live()).toHaveLength(0);
    expect(status(container)).toBe('paused');
    // and nothing reconnects while hidden
    await act(async () => void vi.advanceTimersByTime(120_000));
    expect(FakeSource.all).toHaveLength(1);

    await act(async () => setHidden(false));
    expect(live()).toHaveLength(1);
    await act(async () => latest().emit('ready'));
    expect(status(container)).toBe('open');
    expect(onResync).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('keeps one grace timer: two hidden events then visible never pause a visible tab', async () => {
    const { container, unmount } = await mount({ hiddenGraceMs: 60_000 });
    await act(async () => latest().emit('ready'));
    await act(async () => setHidden(true));
    await act(async () => setHidden(true)); // the browser says hidden twice (a freeze, a prerender)
    await act(async () => setHidden(false));
    await act(async () => void vi.advanceTimersByTime(120_000));
    expect(live()).toHaveLength(1);
    expect(status(container)).toBe('open');
    await unmount();
  });

  it('a tab hidden while waiting to reconnect pauses, and does not reconnect until it is seen', async () => {
    // the first retry is due after 1 s; the grace runs out first
    const { container, unmount } = await mount({ hiddenGraceMs: 500 });
    await act(async () => latest().fail());
    expect(status(container)).toBe('reconnecting');
    await act(async () => setHidden(true));
    await act(async () => void vi.advanceTimersByTime(500));
    expect(status(container)).toBe('paused');
    await act(async () => void vi.advanceTimersByTime(60_000));
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(FakeSource.all).toHaveLength(1);
    await act(async () => setHidden(false));
    expect(live()).toHaveLength(1);
    expect(status(container)).toBe('reconnecting');
    await unmount();
  });

  it('reconnects at once when the network comes back', async () => {
    const { unmount } = await mount();
    await act(async () => latest().fail());
    expect(FakeSource.all).toHaveLength(1);
    await act(async () => void window.dispatchEvent(new Event('online')));
    expect(FakeSource.all).toHaveLength(2);
    await unmount();
  });

  it('a listener added after the stream opened is attached to it', async () => {
    const seen = vi.fn<(data: unknown) => void>();
    function Late() {
      useEventStream('notifications.read', seen);
      return null;
    }
    function Host({ late }: { late: boolean }) {
      return (
        <RealtimeProvider createEventSource={(url) => new FakeSource(url)}>
          {late && <Late />}
        </RealtimeProvider>
      );
    }
    const view = await render(<Host late={false} />);
    expect(latest().listensTo('notifications.read')).toBe(false);
    await view.rerender(<Host late />);
    expect(latest().listensTo('notifications.read')).toBe(true);
    await act(async () => latest().emit('notifications.read', { unreadCount: 0 }));
    expect(seen).toHaveBeenCalledWith({ unreadCount: 0 });
    await view.unmount();
  });

  it('stops listening when a component unmounts', async () => {
    const seen = vi.fn<(data: unknown) => void>();
    function Late() {
      useEventStream('notification', seen);
      return null;
    }
    function Host({ on }: { on: boolean }) {
      return (
        <RealtimeProvider createEventSource={(url) => new FakeSource(url)}>
          {on && <Late />}
        </RealtimeProvider>
      );
    }
    const view = await render(<Host on />);
    await view.rerender(<Host on={false} />);
    await act(async () => latest().emit('notification', {}));
    expect(seen).not.toHaveBeenCalled();
    await view.unmount();
  });
});

describe('when switched off (a host that cannot hold a stream open)', () => {
  it('opens nothing, stays closed and never retries', async () => {
    const { container, unmount } = await mount({ enabled: false });
    expect(FakeSource.all).toHaveLength(0);
    expect(status(container)).toBe('closed');
    await act(async () => vi.advanceTimersByTimeAsync(120_000));
    expect(FakeSource.all).toHaveLength(0);
    await unmount();
  });
});

describe('switched off, screens still refresh (STATE-07)', () => {
  it('sends resync when the connection comes back', async () => {
    const { onResync, unmount } = await mount({ enabled: false });
    expect(onResync).not.toHaveBeenCalled();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(onResync).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('sends resync when the app is looked at again after a minute hidden, not after a glance away', async () => {
    const { onResync, unmount } = await mount({ enabled: false });
    await act(async () => setHidden(true));
    await act(async () => vi.advanceTimersByTimeAsync(10_000));
    await act(async () => setHidden(false));
    expect(onResync).not.toHaveBeenCalled();
    await act(async () => setHidden(true));
    await act(async () => vi.advanceTimersByTimeAsync(61_000));
    await act(async () => setHidden(false));
    expect(onResync).toHaveBeenCalledTimes(1);
    await unmount();
  });

  it('with the stream on, leaves resync to the stream', async () => {
    const { onResync, unmount } = await mount();
    await act(async () => {
      window.dispatchEvent(new Event('online'));
    });
    expect(onResync).not.toHaveBeenCalled();
    await unmount();
  });
});

describe('without a provider', () => {
  it('is closed and silent', async () => {
    function Alone() {
      const status = useRealtimeStatus();
      useEventStream('notification', () => {});
      return <p data-testid="status">{status}</p>;
    }
    const view = await render(<Alone />);
    expect(status(view.container)).toBe('closed');
    await view.unmount();
  });
});

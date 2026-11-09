import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  createMemoryEventBus,
  createRealtimeHub,
  type EventEnvelope,
  type EventSink,
} from './events.ts';

/* A fake response stream: records what it was sent, and closes like openSse's writer does. */
function fakeSink(opts: { slow?: boolean } = {}) {
  const abort = new AbortController();
  const sent: { event?: string; id?: string; data: unknown }[] = [];
  const release: (() => void)[] = [];
  const sink: EventSink & { sent: typeof sent; leave(): void } = {
    sent,
    send(message) {
      sent.push(message);
      return opts.slow ? new Promise<void>((resolve) => release.push(resolve)) : Promise.resolve();
    },
    close() {
      abort.abort();
    },
    get closed() {
      return abort.signal.aborted;
    },
    signal: abort.signal,
    leave() {
      abort.abort();
    },
  };
  return sink;
}

const names = (s: ReturnType<typeof fakeSink>) => s.sent.map((m) => m.event);
const info = (userId: string, sessionId = `s-${userId}`, role: 'admin' | 'viewer' = 'viewer') => ({
  userId,
  sessionId,
  role,
});

let hub: ReturnType<typeof createRealtimeHub> | undefined;
afterEach(() => {
  hub?.close();
  hub = undefined;
  vi.useRealTimers();
});

describe('RealtimeHub', () => {
  it('sends ready first, then delivers a user their events with rising ids', () => {
    hub = createRealtimeHub();
    const a = fakeSink();
    hub.connect(a, info('ann'));
    hub.publish('ann', 'notification', { n: 1 });
    hub.publish('ann', 'notification', { n: 2 });
    expect(names(a)).toEqual(['ready', 'notification', 'notification']);
    expect(a.sent[1]).toMatchObject({ data: { n: 1 } });
    const ids = a.sent.slice(1).map((m) => Number(m.id));
    expect(ids[1]).toBeGreaterThan(ids[0] ?? 0);
  });

  it('delivers to every tab of the user and to nobody else', () => {
    hub = createRealtimeHub();
    const tab1 = fakeSink();
    const tab2 = fakeSink();
    const other = fakeSink();
    hub.connect(tab1, info('ann', 's1'));
    hub.connect(tab2, info('ann', 's2'));
    hub.connect(other, info('bob'));
    hub.publish('ann', 'x', 1);
    expect(names(tab1)).toEqual(['ready', 'x']);
    expect(names(tab2)).toEqual(['ready', 'x']);
    expect(names(other)).toEqual(['ready']);
  });

  it('broadcast reaches everyone; publishToAdmins only admins, following role changes', () => {
    hub = createRealtimeHub();
    const admin = fakeSink();
    const viewer = fakeSink();
    hub.connect(admin, info('ada', 's-ada', 'admin'));
    hub.connect(viewer, info('vic'));
    hub.broadcast('maintenance', { on: true });
    hub.publishToAdmins('audit', {});
    expect(names(admin)).toEqual(['ready', 'maintenance', 'audit']);
    expect(names(viewer)).toEqual(['ready', 'maintenance']);

    hub.setRole('vic', 'admin');
    hub.setRole('ada', 'viewer');
    hub.publishToAdmins('again', {});
    expect(names(viewer)).toEqual(['ready', 'maintenance', 'again']);
    expect(names(admin)).toEqual(['ready', 'maintenance', 'audit']);
  });

  it('a session viewing as a lower role gets no admin-only events, and a role change keeps it there', () => {
    hub = createRealtimeHub();
    const real = fakeSink();
    const viewing = fakeSink();
    hub.connect(real, info('ada', 's-real', 'admin'));
    hub.connect(viewing, info('ada', 's-view', 'admin'));
    hub.setSessionRole('s-view', 'viewer', 'viewer');
    hub.publishToAdmins('audit', {});
    expect(names(real)).toEqual(['ready', 'audit']);
    expect(names(viewing)).toEqual(['ready']);
    // someone changes Ada's real role (admin to admin here, then back): the viewing stream stays lower
    hub.setRole('ada', 'admin');
    hub.publishToAdmins('again', {});
    expect(names(viewing)).toEqual(['ready']);
    // switching back restores the real role
    hub.setSessionRole('s-view', 'admin', null);
    hub.publishToAdmins('back', {});
    expect(names(viewing)).toEqual(['ready', 'back']);
    // a stream that opens while a session is viewing as starts at that role
    const later = fakeSink();
    hub.connect(later, { ...info('ada', 's-later', 'viewer'), actingRole: 'viewer' });
    hub.publishToAdmins('last', {});
    expect(names(later)).toEqual(['ready']);
  });

  it('removes a stream when the client leaves, and sends it nothing more', () => {
    hub = createRealtimeHub();
    const a = fakeSink();
    hub.connect(a, info('ann'));
    expect(hub.count('ann')).toBe(1);
    a.leave();
    expect(hub.count('ann')).toBe(0);
    expect(hub.count()).toBe(0);
    hub.publish('ann', 'x', 1);
    expect(names(a)).toEqual(['ready']);
  });

  it('closes the oldest stream beyond the per-user limit', () => {
    hub = createRealtimeHub({ maxConnectionsPerUser: 2 });
    const [one, two, three] = [fakeSink(), fakeSink(), fakeSink()];
    hub.connect(one, info('ann', 's1'));
    hub.connect(two, info('ann', 's2'));
    hub.connect(three, info('ann', 's3'));
    expect(one.closed).toBe(true);
    expect(two.closed).toBe(false);
    expect(three.closed).toBe(false);
    expect(hub.count('ann')).toBe(2);
    // the limit is per user
    hub.connect(fakeSink(), info('bob'));
    expect(hub.count('ann')).toBe(2);
    expect(hub.count()).toBe(3);
  });

  it('disconnectSession closes only that session; disconnectUser closes all of the user', () => {
    hub = createRealtimeHub();
    const s1a = fakeSink();
    const s1b = fakeSink();
    const s2 = fakeSink();
    const bob = fakeSink();
    hub.connect(s1a, info('ann', 's1'));
    hub.connect(s1b, info('ann', 's1'));
    hub.connect(s2, info('ann', 's2'));
    hub.connect(bob, info('bob'));
    expect(hub.disconnectSession('s1')).toBe(2);
    expect([s1a.closed, s1b.closed, s2.closed]).toEqual([true, true, false]);
    expect(hub.disconnectUser('ann')).toBe(1);
    expect(s2.closed).toBe(true);
    expect(bob.closed).toBe(false);
    expect(hub.disconnectUser('nobody')).toBe(0);
    expect(hub.count()).toBe(1);
  });

  it('cuts a stream that cannot keep up, and keeps the others', async () => {
    hub = createRealtimeHub({ maxPending: 3 });
    const slow = fakeSink({ slow: true });
    const fast = fakeSink();
    hub.connect(slow, info('ann', 's1'));
    hub.connect(fast, info('ann', 's2'));
    for (let i = 0; i < 6; i++) {
      hub.publish('ann', 'x', i);
      await Promise.resolve(); // a healthy sink's send has settled by now
    }
    expect(slow.closed).toBe(true);
    expect(fast.closed).toBe(false);
    expect(fast.sent).toHaveLength(7);
    expect(hub.count('ann')).toBe(1);
  });

  it('survives a sink whose send rejects', async () => {
    const errors: unknown[] = [];
    hub = createRealtimeHub({ onError: (e) => errors.push(e) });
    const broken = fakeSink();
    broken.send = () => Promise.reject(new Error('socket gone'));
    const ok = fakeSink();
    hub.connect(broken, info('ann', 's1'));
    hub.connect(ok, info('ann', 's2'));
    hub.publish('ann', 'x', 1);
    await new Promise((r) => setTimeout(r, 0));
    expect(errors.length).toBeGreaterThan(0);
    expect(names(ok)).toEqual(['ready', 'x']);
  });

  it('closes streams whose session is no longer valid, and keeps them through an error', async () => {
    vi.useFakeTimers();
    const errors: unknown[] = [];
    hub = createRealtimeHub({ revalidateMs: 1000, onError: (e) => errors.push(e) });
    let valid = true;
    let fail = false;
    const a = fakeSink();
    hub.connect(a, {
      ...info('ann'),
      stillValid: async () => {
        if (fail) throw new Error('db down');
        return valid;
      },
    });
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.closed).toBe(false);
    fail = true;
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.closed).toBe(false);
    expect(errors).toHaveLength(1);
    fail = false;
    valid = false;
    await vi.advanceTimersByTimeAsync(1000);
    expect(a.closed).toBe(true);
    expect(hub.count()).toBe(0);
  });

  it('close() ends every stream', () => {
    hub = createRealtimeHub();
    const a = fakeSink();
    const b = fakeSink();
    hub.connect(a, info('ann'));
    hub.connect(b, info('bob'));
    hub.close();
    expect(a.closed && b.closed).toBe(true);
    expect(hub.count()).toBe(0);
  });
});

describe('EventBus seam', () => {
  it('a hub delivers what ANY publisher puts on the shared bus', () => {
    // Two hubs over one bus stand in for two server processes behind a cross-process bus.
    const bus = createMemoryEventBus();
    const first = createRealtimeHub({ bus });
    const second = createRealtimeHub({ bus });
    const onFirst = fakeSink();
    const onSecond = fakeSink();
    first.connect(onFirst, info('ann', 's1'));
    second.connect(onSecond, info('ann', 's2'));
    first.publish('ann', 'notification', { from: 'first' });
    expect(names(onFirst)).toEqual(['ready', 'notification']);
    expect(names(onSecond)).toEqual(['ready', 'notification']);
    first.close();
    second.close();
  });

  it('a bus that throws does not throw into the publisher', () => {
    const errors: unknown[] = [];
    const bus = createMemoryEventBus();
    bus.publish = () => {
      throw new Error('bus down');
    };
    hub = createRealtimeHub({ bus, onError: (e) => errors.push(e) });
    expect(() => hub?.publish('ann', 'x')).not.toThrow();
    expect(errors).toHaveLength(1);
  });

  it('hands subscribers the envelope as published', () => {
    const bus = createMemoryEventBus();
    const seen: EventEnvelope[] = [];
    const off = bus.subscribe((e) => seen.push(e));
    bus.publish({ id: 1, audience: { to: 'all' }, event: 'x', data: 1 });
    off();
    bus.publish({ id: 2, audience: { to: 'all' }, event: 'x', data: 2 });
    expect(seen.map((e) => e.id)).toEqual([1]);
  });
});

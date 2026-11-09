import { createContext, type ReactNode, useEffect, useMemo, useState } from 'react';
import { config } from '~/core/config';

/* RealtimeProvider — the one server-sent event stream (EventSource on GET /api/events, with the
   session cookie) for the signed-in app, shared by everything that listens through
   useEventStream(). Mount it once, inside the signed-in part of the app.

   What it does:
   - Opens the stream, and reports `status`: connecting → open; after a drop, reconnecting (with
     exponential backoff and jitter, reset by the first `ready` of a new connection); paused while
     the tab has been hidden for longer than `hiddenGraceMs`; closed when unmounted or without a provider.
   - We reconnect ourselves, not with EventSource's built-in retry: the built-in one gives up for
     good on an HTTP error (a 401 after the session ended, a 503 during a deploy) and cannot back
     off. So any error closes the source and schedules the next attempt here.
   - Nothing is replayed by the server. After any gap (a drop, or the tab sleeping) the next
     `ready` fires a synthetic `resync` event: a consumer refetches what it shows. useEventStream('resync', …).
   - A hidden tab keeps its stream for `hiddenGraceMs` (default 5 minutes: short switches are free),
     then closes it so a forgotten background tab does not hold a server connection (browsers allow six
     per origin over HTTP/1.1); coming back reopens it and resyncs. Going online again reconnects at once.
   - Handlers receive the parsed JSON `data` (or the raw text when it is not JSON). */
export type RealtimeStatus = 'connecting' | 'open' | 'reconnecting' | 'paused' | 'closed';

/** The part of EventSource this uses (a fake in tests). */
export interface EventSourceLike {
  addEventListener(type: string, listener: (event: MessageEvent<string>) => void): void;
  close(): void;
}

export interface RealtimeContextValue {
  status: RealtimeStatus;
  /** Listens for one event name. `resync` is synthetic: it fires after the stream came back from a gap. Returns the unsubscribe. */
  subscribe(event: string, handler: (data: unknown) => void): () => void;
}

export const RealtimeContext = createContext<RealtimeContextValue>({
  status: 'closed',
  subscribe: () => () => {},
});

export interface BackoffOptions {
  baseMs?: number;
  maxMs?: number;
}

/** Full-jitter-ish exponential backoff: between half and all of min(max, base * 2^attempt). */
export function backoffDelay(
  attempt: number,
  { baseMs = 1000, maxMs = 30_000 }: BackoffOptions = {},
  random: () => number = Math.random,
): number {
  const ceiling = Math.min(maxMs, baseMs * 2 ** Math.min(attempt, 20));
  return Math.round(ceiling * (0.5 + random() * 0.5));
}

export interface RealtimeProviderProps {
  children: ReactNode;
  /** Defaults to `${config.apiBase}/events`. */
  url?: string;
  /** Tests pass a fake. */
  createEventSource?: (url: string) => EventSourceLike;
  /** Open the stream at all. Default `config.realtime` (off with VITE_REALTIME=off, as on Vercel,
      where a function cannot hold a stream open): the status stays `closed` and nothing is
      requested, so each open tab does not poll a 503 all day. */
  enabled?: boolean;
  /** How long a hidden tab keeps its stream. Default 5 minutes. */
  hiddenGraceMs?: number;
  /** With the stream off: how long hidden before coming back refetches. Default 60 s. */
  staleAfterMs?: number;
  backoff?: BackoffOptions;
  random?: () => number;
}

const defaultCreate = (url: string): EventSourceLike =>
  new EventSource(url, { withCredentials: true });

/* The listeners, kept outside React state so adding one does not re-render. `attach` is set by the
   running connection: it hooks a new event name onto the open source. */
function createHub() {
  const handlers = new Map<string, Set<(data: unknown) => void>>();
  let attach: (event: string) => void = () => {};
  const hub = {
    handlers,
    setAttach(fn: (event: string) => void): void {
      attach = fn;
    },
    dispatch(event: string, data: unknown): void {
      for (const handler of handlers.get(event) ?? []) handler(data);
    },
    subscribe(event: string, handler: (data: unknown) => void): () => void {
      const set = handlers.get(event) ?? new Set();
      set.add(handler);
      handlers.set(event, set);
      attach(event);
      return () => {
        set.delete(handler);
      };
    },
  };
  return hub;
}

export function RealtimeProvider({
  children,
  url = `${config.apiBase}/events`,
  enabled = config.realtime,
  createEventSource = defaultCreate,
  hiddenGraceMs = 5 * 60_000,
  staleAfterMs = 60_000,
  backoff,
  random = Math.random,
}: RealtimeProviderProps) {
  const [status, setStatus] = useState<RealtimeStatus>(enabled ? 'connecting' : 'closed');
  // One hub per mount: the handlers live outside React state so a new listener does not re-render.
  const [hub] = useState(createHub);

  /* With the stream off (Vercel) nothing would ever say "refetch": a phone that went offline and
     came back, or an app left in the background all morning, would keep showing old numbers
     with no sign they are old. So the same `resync` is sent when the connection comes
     back and when the app is looked at again after a while hidden; every screen that refetches
     on a resync (useEventStream('resync', ...), the notifications) then quietly refreshes. */
  useEffect(() => {
    if (enabled) return;
    let hiddenAt: number | null = document.hidden ? Date.now() : null;
    const resync = () => hub.dispatch('resync', undefined);
    const onVisibility = (): void => {
      if (document.hidden) {
        hiddenAt = Date.now();
        return;
      }
      const away = hiddenAt === null ? 0 : Date.now() - hiddenAt;
      hiddenAt = null;
      if (away >= staleAfterMs) resync();
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', resync);
    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', resync);
    };
  }, [enabled, hub, staleAfterMs]);

  useEffect(() => {
    if (!enabled) return;
    /* The connection is one explicit state machine (`phase`), and every change goes through
       `enter`, which first lets go of what the old phase held (its source or its timer), so a
       phase never leaks a source or a timer into the next one:

         live ──error──▶ waiting ──timer / online──▶ live
         live | waiting ──hidden past the grace──▶ paused ──visible──▶ live
         any ──unmount──▶ stopped (final)

       `live` is connecting until its source says `ready`, then open. Two facts ride alongside:
       `attempt` (the backoff step, reset by a `ready` or a fresh start) and `needsResync` (a gap
       happened, so the next `ready` fires `resync`). The grace timer is not a phase: it is the
       pending hidden → paused transition, and there is only ever one. */
    type Phase =
      | { kind: 'live'; source: EventSourceLike; attached: Set<string>; ready: boolean }
      | { kind: 'waiting'; timer: ReturnType<typeof setTimeout> }
      | { kind: 'paused' }
      | { kind: 'stopped' };
    let phase: Phase = { kind: 'paused' }; // replaced by the first live() below
    let attempt = 0;
    let needsResync = false;
    let hiddenTimer: ReturnType<typeof setTimeout> | undefined;

    const statusOf = (p: Phase): RealtimeStatus => {
      switch (p.kind) {
        case 'live':
          return p.ready ? 'open' : needsResync ? 'reconnecting' : 'connecting';
        case 'waiting':
          return 'reconnecting';
        case 'paused':
          return 'paused';
        case 'stopped':
          return 'closed';
      }
    };

    const enter = (next: Phase): void => {
      if (phase.kind === 'live') phase.source.close();
      if (phase.kind === 'waiting') clearTimeout(phase.timer);
      phase = next;
      setStatus(statusOf(next));
    };

    const listen = (event: string): void => {
      if (phase.kind !== 'live' || phase.attached.has(event) || event === 'resync') return;
      phase.attached.add(event);
      const mine = phase;
      mine.source.addEventListener(event, (e) => {
        if (phase !== mine) return; // a message from a source we already let go of
        let data: unknown = e.data;
        try {
          data = JSON.parse(e.data);
        } catch {
          // not JSON: hand over the text
        }
        if (event === 'ready' && !mine.ready) {
          attempt = 0;
          mine.ready = true;
          setStatus('open');
          if (needsResync) {
            needsResync = false;
            hub.dispatch('resync', undefined);
          }
        }
        hub.dispatch(event, data);
      });
    };
    hub.setAttach(listen);

    const live = (): void => {
      const mine: Phase = {
        kind: 'live',
        source: createEventSource(url),
        attached: new Set(),
        ready: false,
      };
      enter(mine);
      listen('ready');
      for (const event of hub.handlers.keys()) listen(event);
      mine.source.addEventListener('error', () => {
        if (phase !== mine) return;
        needsResync = true;
        enter({
          kind: 'waiting',
          timer: setTimeout(live, backoffDelay(attempt++, backoff, random)),
        });
      });
    };

    const onVisibility = (): void => {
      clearTimeout(hiddenTimer);
      hiddenTimer = undefined;
      if (document.hidden) {
        hiddenTimer = setTimeout(() => {
          hiddenTimer = undefined;
          if (phase.kind !== 'live' && phase.kind !== 'waiting') return;
          needsResync = true;
          enter({ kind: 'paused' });
        }, hiddenGraceMs);
        return;
      }
      if (phase.kind === 'paused') {
        attempt = 0;
        live();
      }
    };
    const onOnline = (): void => {
      // The network is back: do not wait out the backoff.
      if (phase.kind === 'waiting') {
        attempt = 0;
        live();
      }
    };
    document.addEventListener('visibilitychange', onVisibility);
    window.addEventListener('online', onOnline);

    live();
    if (document.hidden) onVisibility();

    return () => {
      document.removeEventListener('visibilitychange', onVisibility);
      window.removeEventListener('online', onOnline);
      clearTimeout(hiddenTimer);
      hub.setAttach(() => {});
      enter({ kind: 'stopped' });
    };
  }, [enabled, url, createEventSource, hiddenGraceMs, backoff, random, hub]);

  const value = useMemo<RealtimeContextValue>(
    () => ({ status, subscribe: hub.subscribe }),
    [status, hub],
  );
  return <RealtimeContext.Provider value={value}>{children}</RealtimeContext.Provider>;
}

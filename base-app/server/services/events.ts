import { createHash } from 'node:crypto';
import { effectiveRole } from '../../lib/roles.ts';
import type { Role, SessionUser } from '../../shared/api.ts';
import type { DbClient } from '../infra/db/types.ts';
import { createRepositories } from '../repositories/index.ts';

/* The realtime hub: who is connected, and a way to tell them something.

   Two parts, so that going from one server process to several is a change in ONE place:

   - EventBus is the transport between processes. publish() puts an envelope on it, and every
     process delivers what it hears to ITS connected clients. createMemoryEventBus() is the one
     process implementation (publish calls the subscribers directly). A second process needs a
     bus that crosses processes: Postgres LISTEN/NOTIFY (payloads are limited to 8000 bytes, so
     send ids and refetch) or Redis pub/sub behind the same two methods. Nothing else changes.
   - RealtimeHub keeps the connections (by user, session and role) and does the fan-out.

   No replay. Event ids count up inside one process, but a client that reconnects is NOT sent what
   it missed: it refetches its state (the client fires a `resync`). That is deliberate. Replay needs
   a buffer per user, and a buffer that survives a restart or lives on another instance, which is
   a second source of truth next to the database. Everything delivered here is a hint that
   something changed ("a notification arrived, the unread count is 4"); the database has the facts,
   and "refetch on reconnect" is correct whatever was lost: a dropped socket, a restart, a deploy.

   The hub knows nothing about HTTP. A connection is an EventSink, which infra/http/sse.ts's
   SseWriter satisfies as it is. */

export type Audience =
  | { readonly to: 'user'; readonly userId: string }
  | { readonly to: 'admins' }
  | { readonly to: 'all' };

export interface EventEnvelope {
  /** Counts up inside one process; informational (see "No replay"). */
  readonly id: number;
  readonly audience: Audience;
  readonly event: string;
  readonly data: unknown;
}

/** The transport between server processes. See the note at the top of this file. */
export interface EventBus {
  publish(envelope: EventEnvelope): void;
  /** Every envelope any process publishes, this one included. Returns the unsubscribe. */
  subscribe(handler: (envelope: EventEnvelope) => void): () => void;
}

export function createMemoryEventBus(): EventBus {
  const handlers = new Set<(envelope: EventEnvelope) => void>();
  return {
    publish(envelope) {
      for (const handler of handlers) handler(envelope);
    },
    subscribe(handler) {
      handlers.add(handler);
      return () => handlers.delete(handler);
    },
  };
}

/** What a connection needs from a response stream. infra/http's SseWriter satisfies it. */
export interface EventSink {
  send(message: { event?: string; id?: string; data: unknown }): Promise<void>;
  close(): void;
  readonly closed: boolean;
  readonly signal: AbortSignal;
}

export interface ConnectionInfo {
  userId: string;
  /** The EFFECTIVE role: the lower role the session views as, else the real one. */
  role: Role;
  /** The lower role this session views as, if any (docs/V2-UX.md 2.6 B). */
  actingRole?: Role | null;
  /** The sessions row this stream belongs to: ending the session ends the stream. */
  sessionId: string;
  /** Asked once in a while; false ends the stream (a session revoked, expired or suspended
      without anyone calling disconnectSession). */
  stillValid?: () => Promise<boolean>;
}

/** What the rest of the server may do with the hub. */
export interface RealtimeHub {
  /** To one user's open streams (all their tabs). */
  publish(userId: string, event: string, data?: unknown): void;
  /** To every open stream of every admin. */
  publishToAdmins(event: string, data?: unknown): void;
  /** To everyone connected. */
  broadcast(event: string, data?: unknown): void;
  /** Registers a stream, sends it `ready`, and removes it when the client leaves. Returns a function that closes it. */
  connect(sink: EventSink, info: ConnectionInfo): () => void;
  /** Closes the streams of one session (sign-out, "sign out that device"). Returns how many. */
  disconnectSession(sessionId: string): number;
  /** Closes every stream of one user (suspension, password change). Returns how many. */
  disconnectUser(userId: string): number;
  /** A user's role changed: their open streams now count as that role for `publishToAdmins`
      (a stream whose session views as a lower role keeps counting as that lower one). */
  setRole(userId: string, role: Role): void;
  /** A session started or stopped viewing as a lower role: its streams count as `role` (the
      effective one) from now on, so an admin viewing as a volunteer gets no admin-only events. */
  setSessionRole(sessionId: string, role: Role, actingRole: Role | null): void;
  /** How many streams are open, in total or for one user. */
  count(userId?: string): number;
  /** Closes everything and stops the timers (shutdown, tests). */
  close(): void;
}

export interface RealtimeHubOptions {
  bus?: EventBus;
  /** The most streams one user may hold; opening another closes their oldest. Default 5. */
  maxConnectionsPerUser?: number;
  /** A stream with more than this many unsettled sends (a socket that is not draining) is closed as too slow; it resyncs on reconnect. A synchronous burst counts too, so keep it generous. Default 256. */
  maxPending?: number;
  /** How often `stillValid` is asked of every stream. Default 60 s; 0 never. */
  revalidateMs?: number;
  /** Where hub problems go. */
  onError?: (err: unknown) => void;
}

interface Connection {
  readonly key: number;
  readonly sink: EventSink;
  readonly userId: string;
  readonly sessionId: string;
  readonly stillValid: (() => Promise<boolean>) | undefined;
  /** The effective role. */
  role: Role;
  acting: Role | null;
  pending: number;
}

export function createRealtimeHub(opts: RealtimeHubOptions = {}): RealtimeHub {
  const bus = opts.bus ?? createMemoryEventBus();
  const maxPerUser = opts.maxConnectionsPerUser ?? 5;
  const maxPending = opts.maxPending ?? 256;
  const revalidateMs = opts.revalidateMs ?? 60_000;
  const onError = opts.onError ?? (() => {});

  const connections = new Map<number, Connection>();
  const byUser = new Map<string, Set<number>>();
  const bySession = new Map<string, Set<number>>();
  let nextKey = 0;
  let nextEventId = 0;
  let timer: ReturnType<typeof setInterval> | undefined;

  const index = (map: Map<string, Set<number>>, id: string, key: number): void => {
    const set = map.get(id) ?? new Set<number>();
    set.add(key);
    map.set(id, set);
  };
  const unindex = (map: Map<string, Set<number>>, id: string, key: number): void => {
    const set = map.get(id);
    set?.delete(key);
    if (set?.size === 0) map.delete(id);
  };

  function remove(conn: Connection): void {
    if (!connections.delete(conn.key)) return;
    unindex(byUser, conn.userId, conn.key);
    unindex(bySession, conn.sessionId, conn.key);
    if (connections.size === 0) stopTimer();
  }

  function dropConnection(conn: Connection): void {
    remove(conn);
    conn.sink.close();
  }

  function send(conn: Connection, message: { event: string; id?: string; data: unknown }): void {
    conn.pending += 1;
    conn.sink
      .send(message)
      .catch(onError)
      .finally(() => {
        conn.pending -= 1;
      });
  }

  function deliver(conn: Connection, envelope: EventEnvelope): void {
    if (conn.sink.closed) {
      remove(conn);
      return;
    }
    // A slow reader must not make us hold its events forever: cut it, it resyncs on reconnect.
    if (conn.pending >= maxPending) {
      dropConnection(conn);
      return;
    }
    send(conn, { event: envelope.event, id: String(envelope.id), data: envelope.data });
  }

  // Everything that is published, here or (with another bus) on another process, arrives here.
  bus.subscribe((envelope) => {
    const { audience } = envelope;
    if (audience.to === 'user') {
      for (const key of byUser.get(audience.userId) ?? []) {
        const conn = connections.get(key);
        if (conn) deliver(conn, envelope);
      }
      return;
    }
    for (const conn of connections.values()) {
      if (audience.to === 'all' || conn.role === 'admin') deliver(conn, envelope);
    }
  });

  const publish = (audience: Audience, event: string, data: unknown): void => {
    nextEventId += 1;
    try {
      bus.publish({ id: nextEventId, audience, event, data });
    } catch (err) {
      onError(err);
    }
  };

  function startTimer(): void {
    if (timer || revalidateMs <= 0) return;
    timer = setInterval(() => {
      for (const conn of connections.values()) {
        if (!conn.stillValid) continue;
        conn.stillValid().then(
          (ok) => {
            if (!ok) dropConnection(conn);
          },
          // A database blip must not sign everyone out: keep the stream, ask again next round.
          onError,
        );
      }
    }, revalidateMs);
    timer.unref();
  }
  function stopTimer(): void {
    clearInterval(timer);
    timer = undefined;
  }

  const closeAll = (keys: Iterable<number> | undefined): number => {
    let n = 0;
    for (const key of keys ?? []) {
      const conn = connections.get(key);
      if (!conn) continue;
      dropConnection(conn);
      n += 1;
    }
    return n;
  };

  return {
    publish: (userId, event, data = {}) => publish({ to: 'user', userId }, event, data),
    publishToAdmins: (event, data = {}) => publish({ to: 'admins' }, event, data),
    broadcast: (event, data = {}) => publish({ to: 'all' }, event, data),

    connect(sink, info) {
      // At the limit, the oldest stream (the lowest key) makes room.
      const mine = byUser.get(info.userId);
      while (mine && mine.size >= maxPerUser) {
        const oldest = mine.values().next().value;
        const conn = oldest === undefined ? undefined : connections.get(oldest);
        if (!conn) break;
        dropConnection(conn);
      }
      nextKey += 1;
      const conn: Connection = {
        key: nextKey,
        sink,
        userId: info.userId,
        sessionId: info.sessionId,
        stillValid: info.stillValid,
        role: info.role,
        acting: info.actingRole ?? null,
        pending: 0,
      };
      connections.set(conn.key, conn);
      index(byUser, conn.userId, conn.key);
      index(bySession, conn.sessionId, conn.key);
      startTimer();

      const leave = (): void => remove(conn);
      if (sink.signal.aborted) leave();
      else sink.signal.addEventListener('abort', leave, { once: true });

      // The first event tells the client it is connected (and when, by the server's clock).
      send(conn, { event: 'ready', data: { time: new Date().toISOString() } });
      return () => dropConnection(conn);
    },

    disconnectSession: (sessionId) => closeAll(bySession.get(sessionId)),
    disconnectUser: (userId) => closeAll(byUser.get(userId)),
    setRole(userId, role) {
      for (const key of byUser.get(userId) ?? []) {
        const conn = connections.get(key);
        if (conn) conn.role = effectiveRole(role, conn.acting);
      }
    },
    setSessionRole(sessionId, role, actingRole) {
      for (const key of bySession.get(sessionId) ?? []) {
        const conn = connections.get(key);
        if (conn) {
          conn.role = role;
          conn.acting = actingRole;
        }
      }
    },
    count: (userId) => (userId === undefined ? connections.size : (byUser.get(userId)?.size ?? 0)),
    close() {
      closeAll([...connections.keys()]);
      stopTimer();
    },
  };
}

/* The service the stream route uses: finds which session a token belongs to, and wires the
   stream to the hub with a way to re-check that the session still lives. */
export interface EventsServiceDeps {
  hub: RealtimeHub;
  /** The auth service's authenticate(): null once the session is revoked, expired or suspended. */
  authenticate: (token: string | undefined) => Promise<SessionUser | null>;
}

const hashToken = (token: string): string => createHash('sha256').update(token).digest('hex');

export function createEventsService(db: DbClient, deps: EventsServiceDeps) {
  const repos = createRepositories(db);
  return {
    /** Registers an open stream for a signed-in user. A token that is not one of the user's sessions closes it. */
    async attach(args: { token: string; user: SessionUser; sink: EventSink }): Promise<void> {
      const { token, user, sink } = args;
      const session = await repos.sessions.find(hashToken(token));
      if (!session || session.userId !== user.id) {
        sink.close();
        return;
      }
      deps.hub.connect(sink, {
        userId: user.id,
        role: user.role,
        actingRole: user.actingRole ?? null,
        sessionId: session.id,
        stillValid: async () => (await deps.authenticate(token)) !== null,
      });
    },
  };
}
export type EventsService = ReturnType<typeof createEventsService>;

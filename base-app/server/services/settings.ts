import type { SessionUser, SettingKey, SettingsValues } from '../../shared/api.ts';
import type { DbClient, DbExecutor } from '../infra/db/types.ts';
import { newId } from '../lib/ids.ts';
import { createRepositories } from '../repositories/index.ts';
import { ServiceError } from './errors.ts';

/* Server-side settings: a typed registry (key -> default, who may see it, how to validate it)
   over the app_settings table, one JSON value per key.

   - `public` keys are sent to every signed-in user (GET /api/settings); `admin` keys only to
     admins. The registry below has three public keys; add a key by adding a line here and its
     type to SettingsValues in shared/api.ts.
   - A stored value that no longer validates (a hand-edited row) reads as the default.
   - Reads come from a small in-memory snapshot of the whole table, refreshed after `cacheMs`
     (2 s) and dropped at once by an update in this process. The maintenance gate asks on every
     request, so it must not cost a query each time. Another instance sees a change within
     `cacheMs`, which is fine for a switch an admin flips by hand.
   - An update is one transaction (the rows and one `settings.update` audit event) and then, in
     this process, a `settings` event through the injected `publish` to every signed-in user
     ('*'). The event carries the public settings only. */

export const DEFAULT_MAINTENANCE_MESSAGE =
  'We are making some improvements and will be back soon. Thank you for your patience.';
export const WORKSPACE_NAME_MAX = 60;
export const MAINTENANCE_MESSAGE_MAX = 300;

export type SettingVisibility = 'public' | 'admin';

export interface SettingDef<T> {
  default: T;
  visibility: SettingVisibility;
  /** Returns the clean value, or throws SettingError with a message fit to show. */
  parse: (raw: unknown) => T;
}

export class SettingError extends Error {}

export type SettingsRegistry = { [K in SettingKey]: SettingDef<SettingsValues[K]> };

const text = (name: string, min: number, max: number) => (raw: unknown) => {
  if (typeof raw !== 'string') throw new SettingError(`${name} must be text.`);
  const value = raw.trim();
  if (value.length < min) throw new SettingError(`Enter ${name.toLowerCase()}.`);
  if (value.length > max) throw new SettingError(`${name} can be at most ${max} characters.`);
  return value;
};

export const SETTINGS: SettingsRegistry = {
  'workspace.name': {
    default: 'Base app',
    visibility: 'public',
    parse: text('The workspace name', 1, WORKSPACE_NAME_MAX),
  },
  'maintenance.enabled': {
    default: false,
    visibility: 'public',
    parse: (raw) => {
      if (typeof raw !== 'boolean') throw new SettingError('Maintenance mode must be on or off.');
      return raw;
    },
  },
  'maintenance.message': {
    default: DEFAULT_MAINTENANCE_MESSAGE,
    visibility: 'public',
    // empty means "the default message", so every reader gets words to show
    parse: (raw) =>
      text('The maintenance message', 0, MAINTENANCE_MESSAGE_MAX)(raw) ||
      DEFAULT_MAINTENANCE_MESSAGE,
  },
};

/** Sends an event to one user, or to every signed-in user with target '*'. The realtime hub
    (services/events.ts) satisfies it; main.ts wires it, tests pass a fake. */
export type Publish = (target: string, event: string, data: unknown) => void;

export interface SettingsOptions {
  now?: () => Date;
  publish?: Publish;
  registry?: SettingsRegistry;
  cacheMs?: number;
}

export function createSettingsService(db: DbClient, opts: SettingsOptions = {}) {
  const now = opts.now ?? (() => new Date());
  const registry = opts.registry ?? SETTINGS;
  const cacheMs = opts.cacheMs ?? 2_000;
  const repos = createRepositories(db);
  const keys = Object.keys(registry) as SettingKey[];

  let snapshot: { at: number; values: SettingsValues } | null = null;

  /* `exec` is the caller's transaction when it has one: on SQLite a transaction holds the
     only connection, so a read through the client from inside it would wait for itself. */
  async function load(exec?: DbExecutor): Promise<SettingsValues> {
    const t = now().getTime();
    if (snapshot && t - snapshot.at < cacheMs) return snapshot.values;
    const source = exec ? createRepositories(exec) : repos;
    const stored = new Map((await source.appSettings.list()).map((r) => [r.key, r.value]));
    const values = {} as Record<string, unknown>;
    for (const key of keys) {
      const def = registry[key] as SettingDef<unknown>;
      let value = def.default;
      const raw = stored.get(key);
      if (raw !== undefined) {
        try {
          value = def.parse(JSON.parse(raw));
        } catch {
          // a row that no longer validates: the default
        }
      }
      values[key] = value;
    }
    snapshot = { at: t, values: values as SettingsValues };
    return snapshot.values;
  }

  const visibleTo = (values: SettingsValues, admin: boolean): Partial<SettingsValues> =>
    Object.fromEntries(
      keys.filter((k) => admin || registry[k].visibility === 'public').map((k) => [k, values[k]]),
    ) as Partial<SettingsValues>;

  return {
    /** The settings this viewer may see. */
    async forViewer(role: SessionUser['role']): Promise<Partial<SettingsValues>> {
      return visibleTo(await load(), role === 'admin');
    },

    async get<K extends SettingKey>(key: K): Promise<SettingsValues[K]> {
      return (await load())[key];
    },

    /** The workspace name. Pass the transaction you are in, if any (see `load`). */
    async workspaceName(exec?: DbExecutor): Promise<string> {
      return (await load(exec))['workspace.name'];
    },

    /** Whether maintenance mode is on, and what to tell people. Cheap enough for every request. */
    async maintenance(): Promise<{ enabled: boolean; message: string }> {
      const v = await load();
      return {
        enabled: v['maintenance.enabled'],
        message: v['maintenance.message'] || DEFAULT_MAINTENANCE_MESSAGE,
      };
    },

    /** Validates and stores the keys in `body`, audits it, and tells every signed-in user.
        All or nothing: one bad value stores none. */
    async update(
      body: Partial<Record<string, unknown>>,
      actor: SessionUser,
      ip: string,
    ): Promise<Partial<SettingsValues>> {
      const entries = Object.entries(body).filter(([, v]) => v !== undefined);
      if (entries.length === 0) {
        throw new ServiceError('invalid', 'invalid_body', 'Send at least one setting.');
      }
      const clean: [SettingKey, unknown][] = [];
      for (const [key, raw] of entries) {
        if (!keys.includes(key as SettingKey)) {
          throw new ServiceError(
            'invalid',
            'invalid_setting',
            `Unknown setting "${key.slice(0, 60)}".`,
            key,
          );
        }
        try {
          clean.push([
            key as SettingKey,
            (registry[key as SettingKey] as SettingDef<unknown>).parse(raw),
          ]);
        } catch (err) {
          if (!(err instanceof SettingError)) throw err;
          throw new ServiceError('invalid', 'invalid_setting', err.message, key);
        }
      }

      const at = now();
      await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        for (const [key, value] of clean) {
          await r.appSettings.set(key, JSON.stringify(value), at, actor.id);
        }
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'settings.update',
          target: clean.map(([k]) => k).join(', '),
          ip,
          outcome: 'success',
          detail: JSON.stringify(
            Object.fromEntries(clean.filter(([k]) => registry[k].visibility === 'public')),
          ),
        });
      });
      snapshot = null;

      // After the commit: a rolled-back change must never reach a browser.
      const after = await load();
      const publicChanged = clean.some(([k]) => registry[k].visibility === 'public');
      if (publicChanged && opts.publish) {
        opts.publish('*', 'settings', visibleTo(after, false));
      }
      return visibleTo(after, true);
    },
  };
}
export type SettingsService = ReturnType<typeof createSettingsService>;

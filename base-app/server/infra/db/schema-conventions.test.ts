import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { introspect, type TableInfo } from './introspect.ts';
import { openTestDb, TEST_TARGETS, type TestDb } from './test-databases.ts';

/* The schema held to its own rules (ENGINEERING §7 "Database design"), by reading the LIVE
   schema back from each database after the migrations ran, not by reading the migration
   text. Runs on SQLite always; on Postgres and MySQL when TEST_POSTGRES_URL / TEST_MYSQL_URL
   are set (`npm run test:db`). Adding a table or column that breaks a rule fails here. */

/* Every nullable column, with the reason null means something. Adding to this list is a
   deliberate act: it needs a reason. A column here that is no longer nullable fails too. */
const NULLABLE: Record<string, string> = {
  'users.password_hash': 'an invited user has not set a password yet',
  'users.avatar_file_id': 'no avatar uploaded',
  'users.last_active_at': 'never signed in',
  'sessions.user_agent': 'a client that sent none',
  'sessions.ip': 'address unknown',
  'sessions.revoked_at': 'null = still live',
  'sessions.acting_role': 'null = the person is themself (View as)',
  'auth_tokens.used_at': 'null = not yet spent',
  'audit_events.actor_user_id': 'no account (failed sign-in) or the account was deleted',
  'audit_events.ip': 'not an HTTP-originated event',
  'audit_events.detail': 'most events need no detail',
  'notifications.body': 'a title can stand alone',
  'notifications.link': 'not every notification points somewhere',
  'notifications.read_at': 'null = unread',
  'jobs.locked_at': 'null = not running',
  'jobs.locked_by': 'null = not running',
  'jobs.last_error': 'null = no failure yet',
  'jobs.dedupe_key': 'null = never deduplicated',
  'outbound_emails.body_html': 'a plain-text-only message',
  'outbound_emails.provider_message_id': 'known only after the provider accepts it',
  'outbound_emails.error': 'null = no failure',
  'outbound_emails.sent_at': 'null = not sent yet',
  'app_settings.updated_by_user_id': 'changed by the system, or the user was deleted',
  'files.owner_user_id': 'the owner was deleted; the file is kept until cleaned up',
  'agent_conversations.pending': 'null = no action waiting for approval',
  'agent_messages.model': 'a user message has no model',
  'agent_messages.input_tokens': 'a user message has no token count',
  'agent_messages.output_tokens': 'a user message has no token count',
};

/* Columns whose values come from a fixed list must have ck_<table>_<column>. Open vocabularies
   registered in code (notifications.kind, jobs.kind...) are not listed. */
const ENUM_COLUMNS = ['status', 'role', 'purpose', 'outcome', 'category', 'unit', 'action'];
const ENUM_EXTRA = ['activity.kind', 'saved_views.tool'];

const TIMESTAMP_TYPE: Record<string, { type: string; precision: number | null }> = {
  postgres: { type: 'timestamp with time zone', precision: 3 },
  mysql: { type: 'datetime', precision: 3 },
  sqlite: { type: 'text', precision: null },
};

const hasColumn = (tables: TableInfo[], table: string, col: string): boolean =>
  tables.find((x) => x.name === table)?.columns.some((c) => c.name === col) ?? false;

const MAX_NAME = 63; // Postgres identifiers; MySQL allows 64

for (const target of TEST_TARGETS) {
  describe.skipIf(!target.available)(`schema conventions (${target.driver})`, () => {
    let t: TestDb;
    let tables: TableInfo[];
    const driver = target.driver;
    /** One line per broken rule, so a failure names every offender at once. */
    const broken = (check: (table: TableInfo) => string[]): string[] => tables.flatMap(check);

    beforeAll(async () => {
      t = await openTestDb(target);
      tables = await introspect(t.db);
    }, 60_000);
    afterAll(async () => {
      await t?.close();
    });

    it('has the expected tables', () => {
      expect(tables.map((x) => x.name).toSorted()).toEqual(
        [
          'activity',
          'agent_conversations',
          'agent_messages',
          'app_settings',
          'audit_events',
          'auth_tokens',
          'files',
          'jobs',
          'kpis',
          'notification_preferences',
          'notifications',
          'outbound_emails',
          'revenue_daily',
          'saved_views',
          'schema_migrations',
          'sessions',
          'signups_monthly',
          'transactions',
          'users',
        ].toSorted(),
      );
    });

    it('names are snake_case and at most 63 characters (Postgres limit)', () => {
      const snake = /^[a-z][a-z0-9_]*$/;
      expect(
        broken((table) => [
          ...(snake.test(table.name) ? [] : [`table ${table.name}`]),
          ...table.columns
            .filter((c) => !snake.test(c.name))
            .map((c) => `column ${table.name}.${c.name}`),
          ...[
            ...table.indexes.map((i) => i.name),
            ...table.foreignKeys.map((f) => f.name),
            ...table.checks,
          ]
            .filter((n) => n.length > MAX_NAME)
            .map((n) => `name too long: ${n}`),
        ]),
      ).toEqual([]);
    });

    it('every table has a primary key named pk_<table> (MySQL always calls it PRIMARY)', () => {
      expect(
        broken((table) => {
          const want = driver === 'mysql' ? 'PRIMARY' : `pk_${table.name}`;
          return table.primaryKey?.name === want
            ? []
            : [`${table.name}: pk is ${table.primaryKey?.name ?? 'missing'}, want ${want}`];
        }),
      ).toEqual([]);
    });

    it('every foreign key is named fk_<table>_<columns>', () => {
      expect(
        broken((table) =>
          table.foreignKeys
            .filter((fk) => fk.name !== `fk_${table.name}_${fk.columns.join('_')}`)
            .map((fk) => `${table.name}: ${fk.name}`),
        ),
      ).toEqual([]);
    });

    it('every foreign key says what happens on delete (CASCADE, SET NULL or RESTRICT)', () => {
      expect(
        broken((table) =>
          table.foreignKeys
            .filter((fk) => !['CASCADE', 'SET NULL', 'RESTRICT'].includes(fk.onDelete))
            .map((fk) => `${fk.name}: ${fk.onDelete}`),
        ),
      ).toEqual([]);
    });

    it('every foreign key column leads an index (or the primary key)', () => {
      expect(
        broken((table) =>
          table.foreignKeys
            .filter(
              (fk) =>
                !table.indexes.some((i) => i.columns[0] === fk.columns[0]) &&
                table.primaryKey?.columns[0] !== fk.columns[0],
            )
            .map((fk) => `${table.name}.${fk.columns.join(',')} has no index`),
        ),
      ).toEqual([]);
    });

    it('every index is named ix_<table>_<columns> or uq_<table>_<columns>', () => {
      expect(
        broken((table) =>
          table.indexes
            .filter(
              (i) => i.name !== `${i.unique ? 'uq' : 'ix'}_${table.name}_${i.columns.join('_')}`,
            )
            .map((i) => `${table.name}: ${i.name} on (${i.columns.join(', ')})`),
        ),
      ).toEqual([]);
    });

    it('every check is named ck_<table>_<rule>', () => {
      expect(
        broken((table) =>
          table.checks
            .filter((c) => !new RegExp(`^ck_${table.name}_[a-z0-9_]+$`).test(c))
            .map((c) => `${table.name}: ${c}`),
        ),
      ).toEqual([]);
    });

    it('every enum-like column has a check named for it', () => {
      expect(
        broken((table) =>
          table.columns
            .filter(
              (c) =>
                (ENUM_COLUMNS.includes(c.name) || ENUM_EXTRA.includes(`${table.name}.${c.name}`)) &&
                !table.checks.includes(`ck_${table.name}_${c.name}`),
            )
            .map((c) => `${table.name}.${c.name} has no ck_${table.name}_${c.name}`),
        ),
      ).toEqual([]);
    });

    it('every _at column is the native timestamp type, and only _at columns are', () => {
      const want = TIMESTAMP_TYPE[driver];
      const isTimestamp = (type: string) =>
        type === want?.type || type === 'timestamp without time zone' || type === 'timestamp';
      expect(
        broken((table) =>
          table.columns.flatMap((c) => {
            const label = `${table.name}.${c.name} (${c.type}${c.precision === null ? '' : `(${c.precision})`})`;
            const isAt = c.name.endsWith('_at');
            if (driver === 'sqlite') return isAt && c.type !== 'text' ? [label] : [];
            if (isTimestamp(c.type) !== isAt) return [label];
            return isAt && (c.type !== want?.type || c.precision !== want?.precision)
              ? [label]
              : [];
          }),
        ),
      ).toEqual([]);
    });

    it('no column is nullable unless it is on the reasoned allowlist', () => {
      const actual = tables
        .flatMap((table) =>
          table.columns.filter((c) => c.nullable).map((c) => `${table.name}.${c.name}`),
        )
        .toSorted();
      expect(actual).toEqual(Object.keys(NULLABLE).toSorted());
    });

    it('every table records when a row was made: created_at, or its documented stand-in', () => {
      /* Event and series tables are append-only and carry occurred_at (or the day); the
         key-value tables carry only updated_at; schema_migrations carries applied_at. */
      const standIn: Record<string, string> = {
        activity: 'occurred_at',
        audit_events: 'occurred_at',
        transactions: 'occurred_at',
        revenue_daily: 'day',
        kpis: 'ord',
        signups_monthly: 'ord',
        schema_migrations: 'applied_at',
        notification_preferences: 'updated_at',
        app_settings: 'updated_at',
      };
      expect(
        broken((table) => {
          const col = standIn[table.name] ?? 'created_at';
          return hasColumn(tables, table.name, col) ? [] : [`${table.name} lacks ${col}`];
        }),
      ).toEqual([]);
      // every mutable table also says when it last changed
      expect(
        ['users', 'jobs', 'notification_preferences', 'app_settings'].filter(
          (name) => !hasColumn(tables, name, 'updated_at'),
        ),
      ).toEqual([]);
    });
  });
}

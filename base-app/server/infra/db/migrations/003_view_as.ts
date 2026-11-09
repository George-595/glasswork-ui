import { AUDIT_ACTIONS } from './001_baseline.ts';
import { dialectFor } from './dialect.ts';
import type { Migration } from './types.ts';

/* "View as". An admin may view the app as an editor or a viewer, an editor as a viewer, and the
   server enforces it: the session stores the role being viewed as, and every role check uses
   `effectiveRole = acting_role ?? role`, never higher than the real role.

   1. `sessions.acting_role`: the role this session views as. null = the person's own role. A
      session ends with sign-out, which clears it, so it never outlives the sign-in. Only the two
      roles a person can view as are allowed (an admin cannot "view as" an admin).
      Backward compatible: a nullable column the old code never reads or writes.
   2. The audit log's action list (ck_audit_events_action, the whitelist) gains `view_as.start` and
      `view_as.end`: 001's list, frozen, plus those two. Widening a CHECK is safe for the old code.
      Postgres and MySQL swap the constraint; SQLite cannot alter a CHECK, so it rebuilds the table
      (nothing references audit_events) and re-creates its two indexes. */
const ACTIONS = [...AUDIT_ACTIONS, 'view_as.start', 'view_as.end'] as const;
const list = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ');
const CHECK = `CHECK (action IN (${list(ACTIONS)}))`;
const ACTING = `CHECK (acting_role IN ('editor', 'viewer'))`;

export const migration003: Migration = {
  id: '003_view_as',
  up: (driver) => {
    const d = dialectFor(driver);
    if (driver === 'postgres') {
      return [
        'ALTER TABLE sessions ADD acting_role VARCHAR(16)',
        `ALTER TABLE sessions ADD CONSTRAINT ck_sessions_acting_role ${ACTING}`,
        'ALTER TABLE audit_events DROP CONSTRAINT ck_audit_events_action',
        `ALTER TABLE audit_events ADD CONSTRAINT ck_audit_events_action ${CHECK}`,
      ];
    }
    if (driver === 'mysql') {
      return [
        'ALTER TABLE sessions ADD acting_role VARCHAR(16)',
        `ALTER TABLE sessions ADD CONSTRAINT ck_sessions_acting_role ${ACTING}`,
        'ALTER TABLE audit_events DROP CHECK ck_audit_events_action',
        `ALTER TABLE audit_events ADD CONSTRAINT ck_audit_events_action ${CHECK}`,
      ];
    }
    const columns = `id, occurred_at, actor_user_id, actor_label, action, target, ip, outcome, detail`;
    return [
      `ALTER TABLE sessions ADD COLUMN acting_role VARCHAR(16) CONSTRAINT ck_sessions_acting_role ${ACTING}`,
      `CREATE TABLE audit_events_new (
      id ${d.id} NOT NULL,
      occurred_at ${d.timestamp} NOT NULL,
      actor_user_id ${d.id},
      actor_label VARCHAR(200) NOT NULL,
      action VARCHAR(32) NOT NULL,
      target VARCHAR(254) NOT NULL,
      ip VARCHAR(45),
      outcome VARCHAR(16) NOT NULL,
      detail ${d.text},
      CONSTRAINT pk_audit_events PRIMARY KEY (id),
      CONSTRAINT fk_audit_events_actor_user_id FOREIGN KEY (actor_user_id)
        REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT ck_audit_events_action ${CHECK},
      CONSTRAINT ck_audit_events_outcome CHECK (outcome IN ('success', 'failure'))
    )`,
      `INSERT INTO audit_events_new (${columns}) SELECT ${columns} FROM audit_events`,
      'DROP TABLE audit_events',
      'ALTER TABLE audit_events_new RENAME TO audit_events',
      'CREATE INDEX ix_audit_events_occurred_at ON audit_events (occurred_at)',
      'CREATE INDEX ix_audit_events_actor_user_id ON audit_events (actor_user_id)',
    ];
  },
};

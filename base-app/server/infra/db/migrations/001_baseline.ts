import { type Dialect, dialectFor } from './dialect.ts';
import type { Migration } from './types.ts';

/* The baseline schema. See ../SCHEMA.md for the diagram and every table's purpose, and
   ENGINEERING §7 "Database design" for the rules this file follows:

   - every constraint and index is named: pk_<table>, fk_<table>_<column>, uq_<table>_<cols>,
     ix_<table>_<cols>, ck_<table>_<rule>;
   - uniqueness is a named UNIQUE INDEX (the same statement and the same introspection on
     all three databases; SQLite does not keep names for inline UNIQUE constraints);
   - every NOT NULL unless null means something; every enum-like column has a CHECK;
   - every foreign key has an explicit ON DELETE and an index led by its column;
   - no defaults on timestamps: the application supplies them from its injectable clock.

   The users -> files -> users cycle (avatar_file_id / owner_user_id): users is created first
   without the avatar foreign key. Postgres and MySQL add it with ALTER TABLE once files
   exists. SQLite cannot ALTER ADD CONSTRAINT, but it resolves a REFERENCES target lazily, so
   there the foreign key is declared inline and the missing table is never looked at until
   the first avatar_file_id is written. Same constraint, same name, same ON DELETE. */

const list = (values: readonly string[]): string => values.map((v) => `'${v}'`).join(', ');

export const ROLES = ['admin', 'editor', 'viewer'] as const;
export const USER_STATUSES = ['invited', 'active', 'suspended'] as const;
export const AUDIT_ACTIONS = [
  'login',
  'logout',
  'user.invite',
  'user.resend_invite',
  'user.accept_invite',
  'user.role',
  'user.suspend',
  'user.reactivate',
  'password.forgot',
  'password.reset',
  'password.change',
  'session.revoke',
  'profile.update',
  'settings.update',
  'job.retry',
  'notification.broadcast',
  'file.upload',
  'file.delete',
  'export',
] as const;
export const CATEGORIES = ['Software', 'Hardware', 'Services', 'Travel', 'Office'] as const;
export const TRANSACTION_STATUSES = ['paid', 'pending', 'failed', 'refunded'] as const;
export const ACTIVITY_KINDS = ['payment', 'signup', 'ticket', 'deploy'] as const;
export const KPI_UNITS = ['money', 'count', 'percent'] as const;
export const JOB_STATUSES = ['queued', 'running', 'succeeded', 'failed', 'dead'] as const;
export const EMAIL_STATUSES = ['queued', 'sent', 'failed'] as const;
export const FILE_PURPOSES = ['avatar', 'attachment'] as const;
export const TOKEN_PURPOSES = ['invite', 'password_reset'] as const;

function identity(d: Dialect): string[] {
  const usersAvatarFk = `CONSTRAINT fk_users_avatar_file_id FOREIGN KEY (avatar_file_id)
        REFERENCES files (id) ON DELETE SET NULL`;
  return [
    `CREATE TABLE users (
      id ${d.id} NOT NULL,
      email VARCHAR(254) NOT NULL,
      name VARCHAR(200) NOT NULL,
      role VARCHAR(16) NOT NULL,
      status VARCHAR(16) NOT NULL,
      team VARCHAR(100) NOT NULL,
      password_hash VARCHAR(255),
      avatar_file_id ${d.id},
      last_active_at ${d.timestamp},
      created_at ${d.timestamp} NOT NULL,
      updated_at ${d.timestamp} NOT NULL,
      CONSTRAINT pk_users PRIMARY KEY (id),
      CONSTRAINT ck_users_role CHECK (role IN (${list(ROLES)})),
      CONSTRAINT ck_users_status CHECK (status IN (${list(USER_STATUSES)})),
      CONSTRAINT ck_users_email_lower CHECK (${d.isLowerCase('email')})${
        d.driver === 'sqlite' ? `,\n      ${usersAvatarFk}` : ''
      }
    )`,
    'CREATE UNIQUE INDEX uq_users_email ON users (email)',
    'CREATE INDEX ix_users_avatar_file_id ON users (avatar_file_id)',

    `CREATE TABLE files (
      id ${d.id} NOT NULL,
      owner_user_id ${d.id},
      purpose VARCHAR(16) NOT NULL,
      original_name VARCHAR(255) NOT NULL,
      content_type VARCHAR(127) NOT NULL,
      size_bytes ${d.bigint} NOT NULL,
      sha256 CHAR(64) NOT NULL,
      storage_key VARCHAR(255) NOT NULL,
      created_at ${d.timestamp} NOT NULL,
      CONSTRAINT pk_files PRIMARY KEY (id),
      CONSTRAINT fk_files_owner_user_id FOREIGN KEY (owner_user_id)
        REFERENCES users (id) ON DELETE SET NULL,
      CONSTRAINT ck_files_purpose CHECK (purpose IN (${list(FILE_PURPOSES)})),
      CONSTRAINT ck_files_size_bytes CHECK (size_bytes >= 0)
    )`,
    'CREATE UNIQUE INDEX uq_files_storage_key ON files (storage_key)',
    'CREATE INDEX ix_files_owner_user_id ON files (owner_user_id)',
    ...(d.driver === 'sqlite' ? [] : [`ALTER TABLE users ADD ${usersAvatarFk}`]),

    `CREATE TABLE sessions (
      id ${d.id} NOT NULL,
      token_hash CHAR(64) NOT NULL,
      user_id ${d.id} NOT NULL,
      user_agent VARCHAR(300),
      ip VARCHAR(45),
      created_at ${d.timestamp} NOT NULL,
      last_seen_at ${d.timestamp} NOT NULL,
      expires_at ${d.timestamp} NOT NULL,
      revoked_at ${d.timestamp},
      CONSTRAINT pk_sessions PRIMARY KEY (id),
      CONSTRAINT fk_sessions_user_id FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
    )`,
    'CREATE UNIQUE INDEX uq_sessions_token_hash ON sessions (token_hash)',
    'CREATE INDEX ix_sessions_user_id ON sessions (user_id)',
    'CREATE INDEX ix_sessions_expires_at ON sessions (expires_at)',

    `CREATE TABLE auth_tokens (
      id ${d.id} NOT NULL,
      token_hash CHAR(64) NOT NULL,
      user_id ${d.id} NOT NULL,
      purpose VARCHAR(16) NOT NULL,
      created_at ${d.timestamp} NOT NULL,
      expires_at ${d.timestamp} NOT NULL,
      used_at ${d.timestamp},
      CONSTRAINT pk_auth_tokens PRIMARY KEY (id),
      CONSTRAINT fk_auth_tokens_user_id FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT ck_auth_tokens_purpose CHECK (purpose IN (${list(TOKEN_PURPOSES)}))
    )`,
    'CREATE UNIQUE INDEX uq_auth_tokens_token_hash ON auth_tokens (token_hash)',
    'CREATE INDEX ix_auth_tokens_user_id_purpose ON auth_tokens (user_id, purpose)',

    `CREATE TABLE audit_events (
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
      CONSTRAINT ck_audit_events_action CHECK (action IN (${list(AUDIT_ACTIONS)})),
      CONSTRAINT ck_audit_events_outcome CHECK (outcome IN ('success', 'failure'))
    )`,
    'CREATE INDEX ix_audit_events_occurred_at ON audit_events (occurred_at)',
    'CREATE INDEX ix_audit_events_actor_user_id ON audit_events (actor_user_id)',
  ];
}

function demoData(d: Dialect): string[] {
  return [
    `CREATE TABLE transactions (
      id ${d.id} NOT NULL,
      occurred_at ${d.timestamp} NOT NULL,
      customer VARCHAR(200) NOT NULL,
      description VARCHAR(500) NOT NULL,
      category VARCHAR(16) NOT NULL,
      amount_minor ${d.bigint} NOT NULL,
      currency CHAR(3) NOT NULL,
      status VARCHAR(16) NOT NULL,
      CONSTRAINT pk_transactions PRIMARY KEY (id),
      CONSTRAINT ck_transactions_category CHECK (category IN (${list(CATEGORIES)})),
      CONSTRAINT ck_transactions_status CHECK (status IN (${list(TRANSACTION_STATUSES)})),
      CONSTRAINT ck_transactions_currency CHECK (currency IN ('GBP'))
    )`,
    'CREATE INDEX ix_transactions_occurred_at ON transactions (occurred_at)',
    'CREATE INDEX ix_transactions_customer_occurred_at ON transactions (customer, occurred_at)',
    'CREATE INDEX ix_transactions_status_occurred_at ON transactions (status, occurred_at)',
    'CREATE INDEX ix_transactions_category_occurred_at ON transactions (category, occurred_at)',

    `CREATE TABLE activity (
      id ${d.id} NOT NULL,
      occurred_at ${d.timestamp} NOT NULL,
      actor VARCHAR(200) NOT NULL,
      summary VARCHAR(500) NOT NULL,
      kind VARCHAR(16) NOT NULL,
      CONSTRAINT pk_activity PRIMARY KEY (id),
      CONSTRAINT ck_activity_kind CHECK (kind IN (${list(ACTIVITY_KINDS)}))
    )`,
    'CREATE INDEX ix_activity_occurred_at ON activity (occurred_at)',

    // `day` is a calendar date (YYYY-MM-DD), not an instant: it stays text on every driver.
    `CREATE TABLE revenue_daily (
      day CHAR(10) NOT NULL,
      revenue_minor ${d.bigint} NOT NULL,
      costs_minor ${d.bigint} NOT NULL,
      CONSTRAINT pk_revenue_daily PRIMARY KEY (day),
      CONSTRAINT ck_revenue_daily_amounts CHECK (revenue_minor >= 0 AND costs_minor >= 0)
    )`,

    `CREATE TABLE kpis (
      id VARCHAR(32) NOT NULL,
      ord INTEGER NOT NULL,
      label VARCHAR(100) NOT NULL,
      current_value DOUBLE PRECISION NOT NULL,
      previous_value DOUBLE PRECISION NOT NULL,
      unit VARCHAR(16) NOT NULL,
      trend ${d.text} NOT NULL,
      CONSTRAINT pk_kpis PRIMARY KEY (id),
      CONSTRAINT ck_kpis_unit CHECK (unit IN (${list(KPI_UNITS)}))
    )`,
    'CREATE UNIQUE INDEX uq_kpis_ord ON kpis (ord)',

    `CREATE TABLE signups_monthly (
      ord INTEGER NOT NULL,
      label VARCHAR(16) NOT NULL,
      signups INTEGER NOT NULL,
      CONSTRAINT pk_signups_monthly PRIMARY KEY (ord),
      CONSTRAINT ck_signups_monthly_signups CHECK (signups >= 0)
    )`,
  ];
}

function platform(d: Dialect): string[] {
  return [
    `CREATE TABLE notifications (
      id ${d.id} NOT NULL,
      user_id ${d.id} NOT NULL,
      kind VARCHAR(60) NOT NULL,
      title VARCHAR(200) NOT NULL,
      body ${d.text},
      link VARCHAR(500),
      created_at ${d.timestamp} NOT NULL,
      read_at ${d.timestamp},
      CONSTRAINT pk_notifications PRIMARY KEY (id),
      CONSTRAINT fk_notifications_user_id FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE
    )`,
    'CREATE INDEX ix_notifications_user_id_created_at ON notifications (user_id, created_at)',
    'CREATE INDEX ix_notifications_user_id_read_at ON notifications (user_id, read_at)',

    `CREATE TABLE notification_preferences (
      user_id ${d.id} NOT NULL,
      kind VARCHAR(60) NOT NULL,
      in_app ${d.flag} NOT NULL,
      email ${d.flag} NOT NULL,
      updated_at ${d.timestamp} NOT NULL,
      CONSTRAINT pk_notification_preferences PRIMARY KEY (user_id, kind),
      CONSTRAINT fk_notification_preferences_user_id FOREIGN KEY (user_id)
        REFERENCES users (id) ON DELETE CASCADE,
      CONSTRAINT ck_notification_preferences_in_app CHECK (in_app IN (0, 1)),
      CONSTRAINT ck_notification_preferences_email CHECK (email IN (0, 1))
    )`,

    `CREATE TABLE jobs (
      id ${d.id} NOT NULL,
      kind VARCHAR(100) NOT NULL,
      payload ${d.text} NOT NULL,
      status VARCHAR(16) NOT NULL,
      attempts INTEGER NOT NULL,
      max_attempts INTEGER NOT NULL,
      run_at ${d.timestamp} NOT NULL,
      locked_at ${d.timestamp},
      locked_by VARCHAR(100),
      last_error ${d.text},
      dedupe_key VARCHAR(200),
      created_at ${d.timestamp} NOT NULL,
      updated_at ${d.timestamp} NOT NULL,
      CONSTRAINT pk_jobs PRIMARY KEY (id),
      CONSTRAINT ck_jobs_status CHECK (status IN (${list(JOB_STATUSES)})),
      CONSTRAINT ck_jobs_attempts CHECK (attempts >= 0 AND max_attempts >= 1)
    )`,
    'CREATE UNIQUE INDEX uq_jobs_dedupe_key ON jobs (dedupe_key)',
    'CREATE INDEX ix_jobs_status_run_at ON jobs (status, run_at)',

    `CREATE TABLE outbound_emails (
      id ${d.id} NOT NULL,
      to_address VARCHAR(254) NOT NULL,
      subject VARCHAR(300) NOT NULL,
      template VARCHAR(100) NOT NULL,
      body_text ${d.text} NOT NULL,
      body_html ${d.text},
      status VARCHAR(16) NOT NULL,
      provider VARCHAR(50) NOT NULL,
      provider_message_id VARCHAR(200),
      error ${d.text},
      created_at ${d.timestamp} NOT NULL,
      sent_at ${d.timestamp},
      CONSTRAINT pk_outbound_emails PRIMARY KEY (id),
      CONSTRAINT ck_outbound_emails_status CHECK (status IN (${list(EMAIL_STATUSES)}))
    )`,
    'CREATE INDEX ix_outbound_emails_created_at ON outbound_emails (created_at)',

    // `setting_key`, not `key`: KEY is reserved in MySQL and would need quoting in every statement.
    `CREATE TABLE app_settings (
      setting_key VARCHAR(100) NOT NULL,
      value ${d.text} NOT NULL,
      updated_at ${d.timestamp} NOT NULL,
      updated_by_user_id ${d.id},
      CONSTRAINT pk_app_settings PRIMARY KEY (setting_key),
      CONSTRAINT fk_app_settings_updated_by_user_id FOREIGN KEY (updated_by_user_id)
        REFERENCES users (id) ON DELETE SET NULL
    )`,
    'CREATE INDEX ix_app_settings_updated_by_user_id ON app_settings (updated_by_user_id)',
  ];
}

export const migration001: Migration = {
  id: '001_baseline',
  up: (driver) => {
    const d = dialectFor(driver);
    return [...identity(d), ...demoData(d), ...platform(d)];
  },
};

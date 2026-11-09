import type { Role, User, UserStatus } from '../../shared/api.ts';
import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for users. Repositories map rows to records and back; they hold no
   business rules (those live in services/). password_hash never leaves this
   file except through findCredentialsByEmail, for the auth service. */
type UserRow = {
  id: string;
  name: string;
  email: string;
  role: string;
  status: string;
  team: string;
  created_at: string;
  last_active_at: string | null;
  avatar_file_id: string | null;
};

/* What the wire's `avatarUrl` points at: the file route, which any signed-in user may read for
   an avatar. The id changes with every new picture, so the URL is its own cache key. */
const avatarUrlOf = (fileId: string | null): string | null =>
  fileId === null ? null : `/api/files/${fileId}`;

const COLUMNS = 'id, name, email, role, status, team, created_at, last_active_at, avatar_file_id';
const INSERT_COLUMNS = 'id, name, email, role, status, team, created_at, last_active_at';

function toUser(r: UserRow): User {
  return {
    id: r.id,
    name: r.name,
    email: r.email,
    role: r.role as Role,
    status: r.status as UserStatus,
    team: r.team,
    createdAt: r.created_at,
    // never active yet (an invited user): the wire type wants a time, so show when they were added
    lastActiveAt: r.last_active_at ?? r.created_at,
    avatarUrl: avatarUrlOf(r.avatar_file_id),
  };
}

export function usersRepository(db: DbExecutor) {
  return {
    async list(): Promise<User[]> {
      const rows = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users ORDER BY name`);
      return rows.map(toUser);
    },
    async findById(id: string): Promise<User | null> {
      const [row] = await db.query<UserRow>(`SELECT ${COLUMNS} FROM users WHERE id = ?`, [id]);
      return row ? toUser(row) : null;
    },
    async findCredentialsByEmail(
      email: string,
    ): Promise<{ user: User; passwordHash: string | null } | null> {
      const [row] = await db.query<UserRow & { password_hash: string | null }>(
        `SELECT ${COLUMNS}, password_hash FROM users WHERE email = ?`,
        [email],
      );
      return row ? { user: toUser(row), passwordHash: row.password_hash } : null;
    },
    async count(): Promise<number> {
      const [row] = await db.query<{ n: number | string }>('SELECT COUNT(*) AS n FROM users');
      return Number(row?.n ?? 0);
    },
    async insert(user: User, passwordHash: string | null = null): Promise<void> {
      await db.execute(
        `INSERT INTO users (${INSERT_COLUMNS}, password_hash, updated_at)
         VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
        [
          user.id,
          user.name,
          user.email,
          user.role,
          user.status,
          user.team,
          new Date(user.createdAt),
          new Date(user.lastActiveAt),
          passwordHash,
          new Date(user.createdAt),
        ],
      );
    },
    async setPasswordHash(id: string, passwordHash: string, at: Date): Promise<void> {
      await db.execute('UPDATE users SET password_hash = ?, updated_at = ? WHERE id = ?', [
        passwordHash,
        at,
        id,
      ]);
    },
    async setName(id: string, name: string, at: Date): Promise<void> {
      await db.execute('UPDATE users SET name = ?, updated_at = ? WHERE id = ?', [name, at, id]);
    },
    /** The stored password hash (for checking a current password), or null when none is set. */
    async findPasswordHash(id: string): Promise<string | null> {
      const [row] = await db.query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = ?',
        [id],
      );
      return row?.password_hash ?? null;
    },
    /** The file id behind the user's avatar, or null. */
    async findAvatarFileId(id: string): Promise<string | null> {
      const [row] = await db.query<{ avatar_file_id: string | null }>(
        'SELECT avatar_file_id FROM users WHERE id = ?',
        [id],
      );
      return row?.avatar_file_id ?? null;
    },
    async setRole(id: string, role: Role, at: Date): Promise<void> {
      await db.execute('UPDATE users SET role = ?, updated_at = ? WHERE id = ?', [role, at, id]);
    },
    /* A user's status moves invited → active (accepting the invitation), active | invited →
       suspended, and suspended → active | invited (reactivation). `moveStatus` is the only write:
       it changes the row only while it is still in one of `from`, so two admins (or an admin and
       the person accepting their invitation) racing on the same user cannot overwrite each other.
       False when the row had already moved on. */
    async moveStatus(
      id: string,
      from: readonly UserStatus[],
      to: UserStatus,
      at: Date,
    ): Promise<boolean> {
      if (from.length === 0) return false;
      const r = await db.execute(
        `UPDATE users SET status = ?, updated_at = ? WHERE id = ? AND status IN (${from.map(() => '?').join(', ')})`,
        [to, at, id, ...from],
      );
      return r.rowsAffected === 1;
    },
    /** Points the user at an uploaded avatar, or clears it with null. */
    async setAvatarFileId(id: string, fileId: string | null, at: Date): Promise<void> {
      await db.execute('UPDATE users SET avatar_file_id = ?, updated_at = ? WHERE id = ?', [
        fileId,
        at,
        id,
      ]);
    },
    /** Active admins other than `exceptId`: what "the last admin" is counted against. Inside a
        transaction on Postgres or MySQL the admin rows are locked until it ends (SQLite runs one
        writer at a time already), so two admins demoting each other at once cannot both see
        the other as still there and leave no admin at all. */
    async countActiveAdmins(exceptId: string): Promise<number> {
      const lock = db.driver === 'sqlite' ? '' : ' FOR UPDATE';
      const rows = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE role = 'admin' AND status = 'active'${lock}`,
      );
      return rows.filter((r) => r.id !== exceptId).length;
    },
    /** Ids of the active users (optionally only admins, or all but one), for fan-out notifications. */
    async activeIds(opts: { role?: Role; exceptId?: string } = {}): Promise<string[]> {
      const params: string[] = [];
      let where = "status = 'active'";
      if (opts.role) {
        where += ' AND role = ?';
        params.push(opts.role);
      }
      if (opts.exceptId) {
        where += ' AND id <> ?';
        params.push(opts.exceptId);
      }
      const rows = await db.query<{ id: string }>(
        `SELECT id FROM users WHERE ${where} ORDER BY id`,
        params,
      );
      return rows.map((r) => r.id);
    },
    async hasPassword(id: string): Promise<boolean> {
      const [row] = await db.query<{ password_hash: string | null }>(
        'SELECT password_hash FROM users WHERE id = ?',
        [id],
      );
      return !!row?.password_hash;
    },
    async touchLastActive(id: string, at: Date): Promise<void> {
      await db.execute('UPDATE users SET last_active_at = ? WHERE id = ?', [at, id]);
    },
  };
}
export type UsersRepository = ReturnType<typeof usersRepository>;

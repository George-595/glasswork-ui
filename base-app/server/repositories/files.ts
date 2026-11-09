import type { DbExecutor } from '../infra/db/types.ts';

/* SQL for file metadata. The bytes live in file storage (keyed by `storage_key`); this table
   says who owns them, what they are and what they hashed to. */
export type FilePurpose = 'avatar' | 'attachment';

export interface FileRecord {
  id: string;
  ownerUserId: string | null;
  purpose: FilePurpose;
  originalName: string;
  contentType: string;
  sizeBytes: number;
  sha256: string;
  storageKey: string;
  createdAt: string;
}

type FileRow = {
  id: string;
  owner_user_id: string | null;
  purpose: string;
  original_name: string;
  content_type: string;
  size_bytes: number | string;
  sha256: string;
  storage_key: string;
  created_at: string;
};

const COLUMNS =
  'id, owner_user_id, purpose, original_name, content_type, size_bytes, sha256, storage_key, created_at';

const toFile = (r: FileRow): FileRecord => ({
  id: r.id,
  ownerUserId: r.owner_user_id,
  purpose: r.purpose as FilePurpose,
  originalName: r.original_name,
  contentType: r.content_type,
  sizeBytes: Number(r.size_bytes),
  sha256: r.sha256,
  storageKey: r.storage_key,
  createdAt: r.created_at,
});

export function filesRepository(db: DbExecutor) {
  return {
    async insert(f: Omit<FileRecord, 'createdAt'> & { createdAt: Date }): Promise<void> {
      await db.execute(`INSERT INTO files (${COLUMNS}) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)`, [
        f.id,
        f.ownerUserId,
        f.purpose,
        f.originalName.slice(0, 255),
        f.contentType.slice(0, 127),
        f.sizeBytes,
        f.sha256,
        f.storageKey,
        f.createdAt,
      ]);
    },
    async byId(id: string): Promise<FileRecord | null> {
      const [row] = await db.query<FileRow>(`SELECT ${COLUMNS} FROM files WHERE id = ?`, [id]);
      return row ? toFile(row) : null;
    },
    /** A user's files, newest first. */
    async listForOwner(ownerUserId: string, limit: number): Promise<FileRecord[]> {
      const n = Math.max(1, Math.min(200, Math.floor(limit)));
      const rows = await db.query<FileRow>(
        `SELECT ${COLUMNS} FROM files WHERE owner_user_id = ? ORDER BY created_at DESC, id DESC LIMIT ${n}`,
        [ownerUserId],
      );
      return rows.map(toFile);
    },
    async delete(id: string): Promise<boolean> {
      const r = await db.execute('DELETE FROM files WHERE id = ?', [id]);
      return r.rowsAffected > 0;
    },
  };
}
export type FilesRepository = ReturnType<typeof filesRepository>;

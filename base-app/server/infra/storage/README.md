# server/infra/storage

Where uploaded bytes live. The `files` table (see `db/SCHEMA.md`) says who owns a file and what it
is; this folder says where the bytes are.

- `types.ts` is `FileStorage`: `put(stream)` returns a new random `key` and the size, `get(key)`
  returns a stream, `delete(key)` is idempotent. Nothing else in the app touches a disk path.
- `local.ts` is the local-disk implementation under `UPLOADS_DIR` (default `./data/uploads`,
  gitignored). A key is 32 hex characters made here; the file is `<root>/<aa>/<key>`; every method
  rejects any other shape of key before it becomes a path, so traversal is impossible by
  construction. `put` writes a temp file and renames it, so a failed upload leaves nothing.
- **S3 later:** a second file implementing `FileStorage` (put = multipart upload under a random key,
  get = `GetObject` body, delete = `DeleteObject`), chosen in `main.ts` by an env var. Nothing above
  this folder changes.
- **May import:** Node built-ins only. **Imported by:** `main.ts` (builds it) and, as a type,
  `services/files.ts`.
- Back up `UPLOADS_DIR` with the database: the table rows point at keys in it.

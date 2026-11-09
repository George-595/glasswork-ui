import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import type { SessionUser } from '../../shared/api.ts';
import type { DbClient } from '../infra/db/types.ts';
import { type FileStorage, StorageNotFoundError } from '../infra/storage/index.ts';
import { newId } from '../lib/ids.ts';
import type { FileRecord } from '../repositories/files.ts';
import { createRepositories } from '../repositories/index.ts';
import { ServiceError } from './errors.ts';
import { createRateLimiter } from './rate-limit.ts';

/* Uploaded files: the rules around the bytes (OWASP ASVS V12).

   Avatar upload, in order:
   1. the declared Content-Type must be png, jpeg or webp, and a declared length over the limit is
      refused before a byte is read (413);
   2. the body is streamed through `guard`: a hard byte limit (2 MB, aborting the moment it is
      crossed, not after buffering), a SHA-256 computed on the way, and a magic-byte sniff of the
      first bytes that must agree with the declared type. The filename is never used: the stored
      name is `avatar.<ext>`, the storage key is random;
   3. the bytes are stored, then ONE transaction adds the `files` row, points the user at it,
      removes the previous avatar's row and audits both. If the transaction fails, the new blob is
      removed; after it commits, the old blob is removed (a crash between leaves an orphan blob
      that nothing can read; it costs disk, not safety).
   The image is stored and served byte for byte: no image library, so no decoder to attack. It
   is served with its sniffed type, `nosniff`, a sandboxing CSP and `inline` only for the image
   allowlist (see routes/files.ts).

   Who may read a file: an avatar, any signed-in user; an attachment, only its owner. Anyone else
   gets the same 404 as a file that does not exist. */
export const AVATAR_MAX_BYTES = 2 * 1024 * 1024;
export const IMAGE_TYPES = ['image/png', 'image/jpeg', 'image/webp'] as const;
export type ImageType = (typeof IMAGE_TYPES)[number];
const EXTENSION: Record<ImageType, string> = {
  'image/png': 'png',
  'image/jpeg': 'jpg',
  'image/webp': 'webp',
};
/* The bytes needed to tell all three apart (WebP's "WEBP" sits at offset 8..11). */
const SNIFF_BYTES = 12;

/** The image type the first bytes say, or null. Never trusts a header or a filename. */
export function sniffImage(head: Uint8Array): ImageType | null {
  const b = head;
  if (
    b.length >= 8 &&
    b[0] === 0x89 &&
    b[1] === 0x50 &&
    b[2] === 0x4e &&
    b[3] === 0x47 &&
    b[4] === 0x0d &&
    b[5] === 0x0a &&
    b[6] === 0x1a &&
    b[7] === 0x0a
  ) {
    return 'image/png';
  }
  if (b.length >= 3 && b[0] === 0xff && b[1] === 0xd8 && b[2] === 0xff) return 'image/jpeg';
  if (
    b.length >= 12 &&
    b[0] === 0x52 && // R
    b[1] === 0x49 && // I
    b[2] === 0x46 && // F
    b[3] === 0x46 && // F
    b[8] === 0x57 && // W
    b[9] === 0x45 && // E
    b[10] === 0x42 && // B
    b[11] === 0x50 // P
  ) {
    return 'image/webp';
  }
  return null;
}

/** The media type of a Content-Type header, lower-case, without parameters. */
export function mediaTypeOf(header: string | undefined): string {
  return (header ?? '').split(';')[0]?.trim().toLowerCase() ?? '';
}

const unsupported = () =>
  new ServiceError('unsupported_media', 'unsupported_image', 'Upload a PNG, JPEG or WebP image.');
const tooLarge = (max: number) =>
  new ServiceError(
    'too_large',
    'file_too_large',
    `The image is larger than ${Math.round((max / (1024 * 1024)) * 10) / 10} MB.`,
  );

export interface GuardResult {
  sha256: string;
  size: number;
}

/** Passes the body through while enforcing the byte limit, hashing it and checking its first
    bytes against `declared`. Nothing is yielded before the check passes, so storage never sees
    a body that fails it. `result` is filled when the body ends. */
export function guard(
  body: AsyncIterable<Uint8Array>,
  declared: ImageType,
  maxBytes: number,
  result: GuardResult,
): AsyncIterable<Uint8Array> {
  return (async function* () {
    const hash = createHash('sha256');
    let size = 0;
    let checked = false;
    let held: Buffer[] = [];
    let heldBytes = 0;

    const verify = (): void => {
      if (heldBytes === 0) {
        throw new ServiceError('invalid', 'empty_body', 'The upload was empty.');
      }
      const head = Buffer.concat(held);
      if (sniffImage(head) !== declared) throw unsupported();
    };

    for await (const raw of body) {
      const chunk = Buffer.from(raw.buffer, raw.byteOffset, raw.byteLength);
      size += chunk.length;
      if (size > maxBytes) throw tooLarge(maxBytes);
      hash.update(chunk);
      if (checked) {
        yield chunk;
        continue;
      }
      held.push(chunk);
      heldBytes += chunk.length;
      if (heldBytes >= SNIFF_BYTES) {
        verify();
        checked = true;
        for (const part of held) yield part;
        held = [];
      }
    }
    if (!checked) {
      verify();
      for (const part of held) yield part;
    }
    result.sha256 = hash.digest('hex');
    result.size = size;
  })();
}

export interface FilesServiceOptions {
  storage: FileStorage;
  now?: () => Date;
  maxAvatarBytes?: number;
  /** Uploads allowed per person per hour. */
  uploadsPerHour?: number;
}

export interface OpenedFile {
  file: FileRecord;
  open: () => Promise<Readable>;
}

const notFound = () => new ServiceError('not_found', 'file_not_found', 'No such file.');

export function createFilesService(db: DbClient, opts: FilesServiceOptions) {
  const now = opts.now ?? (() => new Date());
  const { storage } = opts;
  const maxAvatarBytes = opts.maxAvatarBytes ?? AVATAR_MAX_BYTES;
  const uploads = createRateLimiter({
    max: opts.uploadsPerHour ?? 30,
    windowMs: 3_600_000,
    now,
  });
  const repos = createRepositories(db);

  const bestEffortDelete = async (key: string): Promise<void> => {
    try {
      await storage.delete(key);
    } catch {
      // an orphan blob costs disk, nothing else; never fail the request over it
    }
  };

  return {
    /** Stores a new avatar for `actor` and removes the previous one. Returns the new avatar URL. */
    async uploadAvatar(
      actor: SessionUser,
      upload: {
        contentType: string | undefined;
        contentLength: number | undefined;
        body: AsyncIterable<Uint8Array>;
      },
      ip: string,
    ): Promise<string> {
      const declared = mediaTypeOf(upload.contentType);
      if (!(IMAGE_TYPES as readonly string[]).includes(declared)) throw unsupported();
      const type = declared as ImageType;
      if (upload.contentLength !== undefined && upload.contentLength > maxAvatarBytes) {
        throw tooLarge(maxAvatarBytes);
      }
      if (!uploads.hit(actor.id)) {
        throw new ServiceError(
          'rate_limited',
          'too_many_uploads',
          'Too many uploads. Try again later.',
        );
      }

      const measured: GuardResult = { sha256: '', size: 0 };
      const stored = await storage.put(guard(upload.body, type, maxAvatarBytes, measured));

      const fileId = newId();
      try {
        const replaced = await db.transaction(async (tx) => {
          const r = createRepositories(tx);
          const at = now();
          const previousId = await r.users.findAvatarFileId(actor.id);
          await r.files.insert({
            id: fileId,
            ownerUserId: actor.id,
            purpose: 'avatar',
            originalName: `avatar.${EXTENSION[type]}`,
            contentType: type,
            sizeBytes: measured.size,
            sha256: measured.sha256,
            storageKey: stored.key,
            createdAt: at,
          });
          await r.users.setAvatarFileId(actor.id, fileId, at);
          await r.audit.insert({
            id: newId(),
            at: at.toISOString(),
            actorUserId: actor.id,
            actor: actor.name,
            action: 'file.upload',
            target: `avatar (${type}, ${measured.size} bytes)`,
            ip,
            outcome: 'success',
          });
          const previous = previousId ? await r.files.byId(previousId) : null;
          if (previous) {
            await r.files.delete(previous.id);
            await r.audit.insert({
              id: newId(),
              at: at.toISOString(),
              actorUserId: actor.id,
              actor: actor.name,
              action: 'file.delete',
              target: 'previous avatar',
              ip,
              outcome: 'success',
            });
          }
          return previous;
        });
        if (replaced) await bestEffortDelete(replaced.storageKey);
      } catch (err) {
        await bestEffortDelete(stored.key);
        throw err;
      }
      return `/api/files/${fileId}`;
    },

    /** Removes the avatar (row and bytes). Nothing to remove is not an error. */
    async removeAvatar(actor: SessionUser, ip: string): Promise<void> {
      const removed = await db.transaction(async (tx) => {
        const r = createRepositories(tx);
        const currentId = await r.users.findAvatarFileId(actor.id);
        if (!currentId) return null;
        const at = now();
        const current = await r.files.byId(currentId);
        await r.users.setAvatarFileId(actor.id, null, at);
        if (current) await r.files.delete(current.id);
        await r.audit.insert({
          id: newId(),
          at: at.toISOString(),
          actorUserId: actor.id,
          actor: actor.name,
          action: 'file.delete',
          target: 'avatar',
          ip,
          outcome: 'success',
        });
        return current;
      });
      if (removed) await bestEffortDelete(removed.storageKey);
    },

    /** A file the viewer may read, with a function that opens its bytes. 404 `file_not_found`
        for a missing file and for one the viewer may not read, alike. */
    async open(viewer: SessionUser, id: string): Promise<OpenedFile> {
      const file = id.length <= 64 ? await repos.files.byId(id) : null;
      if (!file) throw notFound();
      const allowed =
        file.purpose === 'avatar' ||
        (file.purpose === 'attachment' && file.ownerUserId === viewer.id);
      if (!allowed) throw notFound();
      return {
        file,
        open: async () => {
          try {
            return await storage.get(file.storageKey);
          } catch (err) {
            if (err instanceof StorageNotFoundError) throw notFound();
            throw err;
          }
        },
      };
    },
  };
}
export type FilesService = ReturnType<typeof createFilesService>;

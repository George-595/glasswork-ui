import { randomBytes } from 'node:crypto';
import { createReadStream, createWriteStream } from 'node:fs';
import { mkdir, rename, rm, stat } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { Readable } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { type FileStorage, InvalidStorageKeyError, StorageNotFoundError } from './types.ts';

/* File storage on local disk under one root directory (UPLOADS_DIR).

   - A key is 32 lower-case hex characters, made here from 16 random bytes. The path is
     `<root>/<first two characters>/<key>`: nothing a caller or a filename says reaches a path.
     Every method checks the key against that exact shape first, so `..`, `/`, a NUL byte or an
     absolute path cannot get through: traversal is impossible by construction, not by
     cleaning input.
   - put writes to `<root>/tmp/<random>` and renames into place, so a half-written file is never
     served and a failed or aborted upload leaves nothing (the temp file is removed).
   - Files are created mode 0600 and the directories 0700. */
const KEY = /^[0-9a-f]{32}$/;

export function createLocalFileStorage(root: string): FileStorage {
  const base = resolve(root);
  const tmpDir = join(base, 'tmp');

  const pathFor = (key: string): string => {
    if (typeof key !== 'string' || !KEY.test(key)) throw new InvalidStorageKeyError();
    return join(base, key.slice(0, 2), key);
  };

  return {
    async put(source) {
      await mkdir(tmpDir, { recursive: true, mode: 0o700 });
      const key = randomBytes(16).toString('hex');
      const temp = join(tmpDir, randomBytes(16).toString('hex'));
      let size = 0;
      try {
        const counted = (async function* () {
          for await (const chunk of source) {
            size += chunk.length;
            yield chunk;
          }
        })();
        await pipeline(
          Readable.from(counted, { objectMode: false }),
          createWriteStream(temp, { flags: 'wx', mode: 0o600 }),
        );
        const final = pathFor(key);
        await mkdir(dirname(final), { recursive: true, mode: 0o700 });
        await rename(temp, final);
        return { key, size };
      } catch (err) {
        await rm(temp, { force: true });
        throw err;
      }
    },

    async get(key) {
      const path = pathFor(key);
      try {
        const info = await stat(path);
        if (!info.isFile()) throw new StorageNotFoundError();
      } catch (err) {
        if (err instanceof StorageNotFoundError) throw err;
        if ((err as NodeJS.ErrnoException).code === 'ENOENT') throw new StorageNotFoundError();
        throw err;
      }
      return createReadStream(path);
    },

    async delete(key) {
      await rm(pathFor(key), { force: true });
    },
  };
}

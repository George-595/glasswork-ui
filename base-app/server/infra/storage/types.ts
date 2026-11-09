import type { Readable } from 'node:stream';

/* Where uploaded bytes live. The `files` table says who owns a file and what it is; this says
   where the bytes are. The app holds the interface, not a disk: a local-disk implementation
   ships (local.ts), and an S3 one slots in behind the same four methods. */
export interface FileStorage {
  /** Streams `source` into storage under a NEW random key and returns the key and the byte
      count. The key is made here, never taken from a caller or a filename. A source that
      throws leaves nothing behind. */
  put(source: AsyncIterable<Uint8Array>): Promise<{ key: string; size: number }>;
  /** The bytes as a stream. Rejects with StorageNotFoundError for a key that holds nothing. */
  get(key: string): Promise<Readable>;
  /** Removes the bytes. Idempotent: a key that holds nothing is not an error. */
  delete(key: string): Promise<void>;
}

export class StorageNotFoundError extends Error {
  constructor() {
    super('No such stored file.');
    this.name = 'StorageNotFoundError';
  }
}

/** A key that cannot be one of ours (wrong shape). It never reaches a path. */
export class InvalidStorageKeyError extends Error {
  constructor() {
    super('Not a storage key.');
    this.name = 'InvalidStorageKeyError';
  }
}

import { randomBytes } from 'node:crypto';

/* newId(): a UUIDv7 (RFC 9562) string, the primary key of every row the server creates.
   48 bits of Unix milliseconds first, so ids sort by creation time and an index on them
   fills left to right; then random bits. Within one millisecond the 12-bit `rand_a`
   field is a counter (RFC 9562 method 1), so ids from one process are strictly increasing
   even in a tight loop; if the counter overflows, the timestamp is nudged forward by 1 ms.
   Randomness is node:crypto. `now` is injectable for tests. */

let lastMs = 0;
let counter = 0;

const hex = (bytes: Uint8Array, from: number, to: number): string =>
  Buffer.from(bytes.subarray(from, to)).toString('hex');

export function newId(now: () => number = Date.now): string {
  let ms = Math.max(now(), lastMs);
  if (ms === lastMs) {
    counter += 1;
    if (counter > 0xfff) {
      ms += 1;
      counter = randomBytes(2).readUInt16BE(0) & 0x7ff;
    }
  } else {
    // A fresh millisecond starts the counter below half range, leaving room to count up.
    counter = randomBytes(2).readUInt16BE(0) & 0x7ff;
  }
  lastMs = ms;

  const b = randomBytes(16);
  b.writeUIntBE(ms, 0, 6); // bytes 0-5: unix_ts_ms
  b[6] = 0x70 | (counter >> 8); // version 7 + counter high 4 bits
  b[7] = counter & 0xff; // counter low 8 bits
  b[8] = ((b[8] ?? 0) & 0x3f) | 0x80; // variant 10
  return `${hex(b, 0, 4)}-${hex(b, 4, 6)}-${hex(b, 6, 8)}-${hex(b, 8, 10)}-${hex(b, 10, 16)}`;
}

export const UUID_V7 = /^[0-9a-f]{8}-[0-9a-f]{4}-7[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

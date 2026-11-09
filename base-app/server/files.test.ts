/* Avatar upload and file download over HTTP: the byte limit, the magic-byte sniff, replacement,
   who may read what, and the headers a served file carries. */
import { createHash } from 'node:crypto';
import { readdirSync } from 'node:fs';
import { request } from 'node:http';
import { join } from 'node:path';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { createLocalFileStorage } from './infra/storage/index.ts';
import { newId } from './lib/ids.ts';
import { createRepositories } from './repositories/index.ts';
import {
  ADMIN_EMAIL,
  ORIGIN,
  startTestApp,
  type TestApp,
  VIEWER_EMAIL,
  VIEWER_PASSWORD,
} from './testing.ts';

let app: TestApp;
let admin = '';
let viewer = '';

beforeAll(async () => {
  app = await startTestApp();
  admin = await app.signIn();
  viewer = await app.signIn(VIEWER_EMAIL, VIEWER_PASSWORD);
});
afterAll(() => app.close());

const PNG_HEAD = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);
const png = (extra = 120, fill = 1) => Buffer.concat([PNG_HEAD, Buffer.alloc(extra, fill)]);
const jpeg = (extra = 120) =>
  Buffer.concat([Buffer.from([0xff, 0xd8, 0xff, 0xe0]), Buffer.alloc(extra, 2)]);
const webp = (extra = 120) =>
  Buffer.concat([
    Buffer.from('RIFF'),
    Buffer.from([1, 0, 0, 0]),
    Buffer.from('WEBP'),
    Buffer.alloc(extra, 3),
  ]);

const put = (
  body: Buffer | string,
  contentType: string | undefined,
  cookie = admin,
  path = '/api/account/avatar',
) =>
  fetch(`${app.base}${path}`, {
    method: 'PUT',
    headers: { origin: ORIGIN, cookie, ...(contentType ? { 'content-type': contentType } : {}) },
    body,
  });
const get = (path: string, cookie?: string, headers: Record<string, string> = {}) =>
  fetch(`${app.base}${path}`, { headers: { ...(cookie ? { cookie } : {}), ...headers } });
// oxlint-disable-next-line typescript/no-explicit-any -- response JSON is inspected loosely in tests
const json = async (res: Response) => (await res.json()) as Record<string, any>;

/** Every stored blob under the uploads dir (the temp area must be empty). */
function blobs(): string[] {
  const shards = readdirSync(app.uploadsDir).filter((d) => d !== 'tmp');
  expect(readdirSync(join(app.uploadsDir, 'tmp'))).toEqual([]);
  return shards.flatMap((shard) => readdirSync(join(app.uploadsDir, shard)));
}
const fileRows = async () =>
  app.db.query<{ id: string; storage_key: string; purpose: string }>(
    'SELECT id, storage_key, purpose FROM files',
  );

describe('PUT /api/account/avatar', () => {
  it('stores a PNG, points the user at it and serves it back to any signed-in user', async () => {
    const bytes = png(300);
    const res = await put(bytes, 'image/png');
    expect(res.status).toBe(200);
    const { avatarUrl } = await json(res);
    expect(avatarUrl).toMatch(/^\/api\/files\/[\w-]{36}$/);
    expect((await json(await get('/api/account', admin))).account.avatarUrl).toBe(avatarUrl);
    expect((await json(await get('/api/auth/me', admin))).user.avatarUrl).toBe(avatarUrl);

    const served = await get(avatarUrl, viewer); // a different signed-in user may read an avatar
    expect(served.status).toBe(200);
    expect(Buffer.from(await served.arrayBuffer()).equals(bytes)).toBe(true);
    expect(served.headers.get('content-type')).toBe('image/png');
    expect(served.headers.get('x-content-type-options')).toBe('nosniff');
    expect(served.headers.get('content-disposition')).toBe('inline');
    expect(served.headers.get('cache-control')).toBe('private, max-age=3600');
    expect(served.headers.get('content-security-policy')).toContain("default-src 'none'");
    expect(served.headers.get('etag')).toBe(
      `"${createHash('sha256').update(bytes).digest('hex')}"`,
    );

    const row = (
      await app.db.query<Record<string, unknown>>('SELECT * FROM files WHERE id = ?', [
        avatarUrl.split('/').pop(),
      ])
    )[0];
    expect(row).toMatchObject({
      purpose: 'avatar',
      content_type: 'image/png',
      original_name: 'avatar.png',
      sha256: createHash('sha256').update(bytes).digest('hex'),
    });
    expect(Number(row?.size_bytes)).toBe(bytes.length);
    const audit = await app.db.query(
      "SELECT target FROM audit_events WHERE action = 'file.upload'",
    );
    expect(audit.length).toBeGreaterThan(0);
  });

  it('the admin users list carries the avatar url', async () => {
    const users = (await json(await get('/api/users', admin))).users as {
      email: string;
      avatarUrl?: string | null;
    }[];
    expect(users.find((u) => u.email === ADMIN_EMAIL)?.avatarUrl).toMatch(/^\/api\/files\//);
    expect(users.find((u) => u.email === VIEWER_EMAIL)?.avatarUrl).toBeNull();
  });

  it('answers 304 to a matching If-None-Match', async () => {
    const { avatarUrl } = await json(await get('/api/account', admin)).then((b) => b.account);
    const first = await get(avatarUrl, admin);
    const etag = first.headers.get('etag') ?? '';
    await first.arrayBuffer();
    const again = await get(avatarUrl, admin, { 'if-none-match': etag });
    expect(again.status).toBe(304);
    expect(await again.text()).toBe('');
    expect((await get(avatarUrl, admin, { 'if-none-match': `W/"other", ${etag}` })).status).toBe(
      304,
    );
    expect((await get(avatarUrl, admin, { 'if-none-match': '"other"' })).status).toBe(200);
  });

  it('replacing an avatar deletes the old row and the old bytes', async () => {
    const before = await fileRows();
    const res = await put(jpeg(500), 'image/jpeg; charset=binary');
    expect(res.status).toBe(200);
    const after = await fileRows();
    expect(after).toHaveLength(before.length); // one in, one out
    expect(before.some((b) => !after.some((a) => a.id === b.id))).toBe(true);
    expect(blobs()).toHaveLength(after.length);
    const { avatarUrl } = await json(res);
    expect((await get(avatarUrl, admin)).headers.get('content-type')).toBe('image/jpeg');
    const old = before.find((b) => !after.some((a) => a.id === b.id));
    expect((await get(`/api/files/${old?.id}`, admin)).status).toBe(404);
  });

  it('accepts WebP, and exactly 2 MB', async () => {
    expect((await put(webp(), 'image/webp')).status).toBe(200);
    const exact = Buffer.concat([PNG_HEAD, Buffer.alloc(2 * 1024 * 1024 - PNG_HEAD.length, 9)]);
    expect(exact.length).toBe(2 * 1024 * 1024);
    expect((await put(exact, 'image/png')).status).toBe(200);
  });

  it('refuses a body over 2 MB: by Content-Length before reading, and mid-stream without one', async () => {
    const before = await fileRows();
    const big = Buffer.concat([PNG_HEAD, Buffer.alloc(2 * 1024 * 1024, 9)]);
    // node:http, not fetch: the server answers 413 and closes before reading the body, and
    // fetch (undici on Node 26) reports the write it could not finish (EPIPE) instead of the reply
    const declared = await new Promise<{ status: number; body: string }>((resolve, reject) => {
      const req = request(
        `${app.base}/api/account/avatar`,
        {
          method: 'PUT',
          headers: {
            origin: ORIGIN,
            cookie: admin,
            'content-type': 'image/png',
            'content-length': String(big.length),
          },
        },
        (res) => {
          let body = '';
          res.setEncoding('utf8');
          res.on('data', (c: string) => (body += c));
          res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
        },
      );
      req.on('error', (err) =>
        String(err).includes('EPIPE') || String(err).includes('ECONNRESET')
          ? undefined
          : reject(err),
      );
      req.end(big);
    });
    expect(declared.status).toBe(413);
    expect(JSON.parse(declared.body).error.code).toBe('file_too_large');

    // chunked, no Content-Length: the limit is enforced as the bytes arrive
    const status = await new Promise<number>((resolve, reject) => {
      const req = request(
        `${app.base}/api/account/avatar`,
        { method: 'PUT', headers: { origin: ORIGIN, cookie: admin, 'content-type': 'image/png' } },
        (res) => {
          res.resume();
          resolve(res.statusCode ?? 0);
        },
      );
      req.on('error', (err) =>
        String(err).includes('EPIPE') || String(err).includes('ECONNRESET')
          ? undefined
          : reject(err),
      );
      req.write(PNG_HEAD);
      let sent = 0;
      const pump = () => {
        while (sent < 4 * 1024 * 1024 && !req.destroyed) {
          sent += 64 * 1024;
          if (!req.write(Buffer.alloc(64 * 1024, 7))) return void req.once('drain', pump);
        }
        req.end();
      };
      pump();
    });
    expect(status).toBe(413);
    expect(await fileRows()).toEqual(before);
    expect(blobs()).toHaveLength(before.length); // nothing half-written, tmp empty
  });

  it('checks the real bytes against the declared type; the filename is never used', async () => {
    const before = await fileRows();
    const cases: [Buffer | string, string | undefined, number, string][] = [
      [jpeg(), 'image/png', 415, 'unsupported_image'], // the bytes say JPEG
      [png(), 'image/webp', 415, 'unsupported_image'],
      [
        Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"/>'),
        'image/svg+xml',
        415,
        'unsupported_image',
      ],
      [
        Buffer.from('<html><script>alert(1)</script></html>'),
        'image/png',
        415,
        'unsupported_image',
      ],
      [png(), 'text/html', 415, 'unsupported_image'],
      [png(), 'application/octet-stream', 415, 'unsupported_image'],
      [png(), undefined, 415, 'unsupported_image'],
      [Buffer.from([0x89, 0x50]), 'image/png', 415, 'unsupported_image'], // a truncated header
      [Buffer.alloc(0), 'image/png', 400, 'empty_body'],
    ];
    for (const [body, type, status, code] of cases) {
      const res = await put(body, type);
      expect(res.status, `${type} ${body.length}`).toBe(status);
      expect((await json(res)).error.code).toBe(code);
    }
    expect(await fileRows()).toEqual(before);
    expect(blobs()).toHaveLength(before.length);
    // a hostile filename header changes nothing: the name is generated
    const res = await fetch(`${app.base}/api/account/avatar`, {
      method: 'PUT',
      headers: {
        origin: ORIGIN,
        cookie: admin,
        'content-type': 'image/png',
        'content-disposition': 'attachment; filename="../../../etc/passwd"',
        'x-filename': '../../evil.png',
      },
      body: png(),
    });
    expect(res.status).toBe(200);
    const row = (
      await app.db.query<{ original_name: string; storage_key: string }>(
        'SELECT original_name, storage_key FROM files WHERE id = ?',
        [(await json(res)).avatarUrl.split('/').pop()],
      )
    )[0];
    expect(row?.original_name).toBe('avatar.png');
    expect(row?.storage_key).toMatch(/^[0-9a-f]{32}$/);
  });

  it('is signed-in only, and each person has their own avatar', async () => {
    expect(
      (
        await fetch(`${app.base}/api/account/avatar`, {
          method: 'PUT',
          headers: { origin: ORIGIN, 'content-type': 'image/png' },
          body: png(),
        })
      ).status,
    ).toBe(401);
    const res = await put(png(50, 5), 'image/png', viewer);
    expect(res.status).toBe(200);
    const mine = (await json(await get('/api/account', admin))).account.avatarUrl;
    const theirs = (await json(await get('/api/account', viewer))).account.avatarUrl;
    expect(mine).not.toBe(theirs);
  });
});

describe('DELETE /api/account/avatar', () => {
  it('removes the row and the bytes, and is safe to repeat', async () => {
    const url = (await json(await get('/api/account', viewer))).account.avatarUrl as string;
    const before = await fileRows();
    const res = await fetch(`${app.base}/api/account/avatar`, {
      method: 'DELETE',
      headers: { origin: ORIGIN, cookie: viewer },
    });
    expect(res.status).toBe(200);
    expect((await json(res)).avatarUrl).toBeNull();
    expect((await json(await get('/api/account', viewer))).account.avatarUrl).toBeNull();
    expect((await get(url, viewer)).status).toBe(404);
    expect(await fileRows()).toHaveLength(before.length - 1);
    expect(blobs()).toHaveLength(before.length - 1);
    const again = await fetch(`${app.base}/api/account/avatar`, {
      method: 'DELETE',
      headers: { origin: ORIGIN, cookie: viewer },
    });
    expect(again.status).toBe(200);
  });
});

describe('GET /api/files/:id', () => {
  it('serves an attachment only to its owner, as a download', async () => {
    const storage = createLocalFileStorage(app.uploadsDir);
    const stored = await storage.put(
      (async function* () {
        yield Buffer.from('<html><script>alert(1)</script></html>');
      })(),
    );
    const ownerId =
      (await app.db.query<{ id: string }>('SELECT id FROM users WHERE email = ?', [ADMIN_EMAIL]))[0]
        ?.id ?? '';
    const id = newId();
    await createRepositories(app.db).files.insert({
      id,
      ownerUserId: ownerId,
      purpose: 'attachment',
      originalName: 'evil"name;.html',
      contentType: 'text/html',
      sizeBytes: stored.size,
      sha256: createHash('sha256').update('x').digest('hex'),
      storageKey: stored.key,
      createdAt: new Date(),
    });

    const own = await get(`/api/files/${id}`, admin);
    expect(own.status).toBe(200);
    expect(own.headers.get('content-type')).toBe('application/octet-stream');
    expect(own.headers.get('content-disposition')).toMatch(
      /^attachment; filename="evil_name;\.html"/,
    );
    expect(own.headers.get('x-content-type-options')).toBe('nosniff');
    await own.arrayBuffer();

    const other = await get(`/api/files/${id}`, viewer);
    expect(other.status).toBe(404); // not 403: the file's existence is not confirmed
    expect((await json(other)).error.code).toBe('file_not_found');
    expect((await get(`/api/files/${id}`)).status).toBe(401);
    expect((await get(`/api/files/${newId()}`, admin)).status).toBe(404);
  });

  it('cannot be walked out of the uploads directory', async () => {
    for (const id of [
      '..%2F..%2Fetc%2Fpasswd',
      '%2e%2e',
      '....//....//etc/passwd',
      'a%00b',
      'x'.repeat(5000),
    ]) {
      const res = await get(`/api/files/${id}`, admin);
      expect([404, 400]).toContain(res.status);
    }
  });
});

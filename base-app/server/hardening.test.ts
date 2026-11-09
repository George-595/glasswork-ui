/* The server's network defences: a malformed request target must not crash
   the process, a non-loopback Host is refused (DNS rebinding), and a client
   that disconnects aborts the paid upstream call. */
import { request } from 'node:http';
import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { startTestApp, type TestApp } from './testing.ts';

let app: TestApp;
let port = 0;
let cookie = '';

beforeAll(async () => {
  app = await startTestApp();
  port = Number(new URL(app.base).port);
  cookie = await app.signIn();
});
afterAll(() => app.close());

function raw(path: string, host: string): Promise<{ status: number; body: string }> {
  return new Promise((resolve, reject) => {
    const req = request(
      { host: '127.0.0.1', port, path, method: 'GET', headers: { host } },
      (res) => {
        let body = '';
        res.on('data', (c: Buffer) => {
          body += c.toString();
        });
        res.on('end', () => resolve({ status: res.statusCode ?? 0, body }));
      },
    );
    req.on('error', reject);
    req.end();
  });
}

describe('network hardening', () => {
  it('answers 400 to a malformed request target and keeps running', async () => {
    const bad = await raw('//', `127.0.0.1:${port}`);
    expect(bad.status).toBe(400);
    expect(bad.body).toContain('bad_request');
    expect((await raw('/api/health', `127.0.0.1:${port}`)).status).toBe(200);
  });

  it('refuses a request addressed to a non-loopback host', async () => {
    const res = await raw('/api/health', 'evil.example');
    expect(res.status).toBe(403);
    expect(res.body).toContain('forbidden_host');
  });

  it('accepts localhost and the Vite proxy host', async () => {
    expect((await raw('/api/health', 'localhost:5173')).status).toBe(200);
    expect((await raw('/api/health', '127.0.0.1:5173')).status).toBe(200);
  });

  it('aborts the upstream LLM call when the client disconnects', async () => {
    let aborted = false;
    let started: () => void = () => {};
    const begun = new Promise<void>((r) => {
      started = r;
    });
    app.llm.reply = (_req, signal) =>
      new Promise((_resolve, reject) => {
        started();
        signal?.addEventListener('abort', () => {
          aborted = true;
          reject(new Error('aborted'));
        });
      });
    const req = request({
      host: '127.0.0.1',
      port,
      path: '/api/llm/complete',
      method: 'POST',
      headers: { 'content-type': 'application/json', cookie },
    });
    req.on('error', () => {});
    req.end(JSON.stringify({ prompt: 'hi' }));
    await begun;
    req.destroy();
    await new Promise((r) => setTimeout(r, 100));
    expect(aborted).toBe(true);
  });
});

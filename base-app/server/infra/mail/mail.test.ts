import { describe, expect, it } from 'vitest';
import { silentLogger } from '../log/logger.ts';
import {
  createLogTransport,
  createMailTransport,
  createResendTransport,
  MailError,
} from './index.ts';

const MSG = { from: 'App <app@example.com>', to: 'a@example.com', subject: 'Hi', text: 'Body' };
const KEY = 're_secret_key_123';

function stub(status: number, body: unknown, calls: { url: string; init: RequestInit }[] = []) {
  const impl: typeof fetch = async (url, init) => {
    calls.push({ url: String(url), init: init ?? {} });
    return new Response(typeof body === 'string' ? body : JSON.stringify(body), { status });
  };
  return impl;
}

describe('log transport', () => {
  it('sends nothing and logs recipient and subject, never the body', async () => {
    const lines: Record<string, unknown>[] = [];
    const log = {
      ...silentLogger,
      info: (_m: string, f?: Record<string, unknown>) => lines.push(f ?? {}),
    };
    const out = await createLogTransport(log).send({
      ...MSG,
      text: 'https://x/reset?token=SECRET',
    });
    expect(out).toEqual({ providerMessageId: null });
    expect(lines).toEqual([{ to: 'a@example.com', subject: 'Hi' }]);
    expect(JSON.stringify(lines)).not.toContain('SECRET');
  });
});

describe('resend transport', () => {
  it('posts the message with the key in the Authorization header and returns the id', async () => {
    const calls: { url: string; init: RequestInit }[] = [];
    const t = createResendTransport({ apiKey: KEY, fetchImpl: stub(200, { id: 'em_1' }, calls) });
    expect(await t.send({ ...MSG, html: '<p>Body</p>' })).toEqual({ providerMessageId: 'em_1' });
    expect(calls).toHaveLength(1);
    expect(calls[0]?.url).toBe('https://api.resend.com/emails');
    const headers = calls[0]?.init.headers as Record<string, string>;
    expect(headers.authorization).toBe(`Bearer ${KEY}`);
    expect(JSON.parse(String(calls[0]?.init.body))).toEqual({
      from: MSG.from,
      to: ['a@example.com'],
      subject: 'Hi',
      text: 'Body',
      html: '<p>Body</p>',
    });
  });

  it('treats a 2xx without an id as success', async () => {
    const t = createResendTransport({ apiKey: KEY, fetchImpl: stub(200, {}) });
    expect(await t.send(MSG)).toEqual({ providerMessageId: null });
  });

  it.each([429, 500, 503])('a %i is retryable', async (status) => {
    const t = createResendTransport({ apiKey: KEY, fetchImpl: stub(status, { name: 'x' }) });
    const err = await t.send(MSG).catch((e: unknown) => e);
    expect(err).toBeInstanceOf(MailError);
    expect((err as MailError).retryable).toBe(true);
    expect((err as MailError).status).toBe(status);
  });

  it.each([400, 401, 403, 422])('a %i is permanent', async (status) => {
    const t = createResendTransport({
      apiKey: KEY,
      fetchImpl: stub(status, { name: 'validation_error', message: 'bad a@example.com' }),
    });
    const err = (await t.send(MSG).catch((e: unknown) => e)) as MailError;
    expect(err.retryable).toBe(false);
    expect(err.message).toBe(`Resend answered ${status} (validation_error)`);
    // Resend's free text can echo the request: it is not kept
    expect(err.message).not.toContain('a@example.com');
  });

  it('a network failure is retryable and never carries the key', async () => {
    const fetchImpl: typeof fetch = async () => {
      throw new TypeError(`connect failed with ${KEY}`);
    };
    const err = (await createResendTransport({ apiKey: KEY, fetchImpl })
      .send(MSG)
      .catch((e: unknown) => e)) as MailError;
    expect(err.retryable).toBe(true);
    expect(err.message).not.toContain(KEY);
  });

  it('a timeout is retryable', async () => {
    const fetchImpl: typeof fetch = async (_u, init) =>
      new Promise((_resolve, reject) => {
        init?.signal?.addEventListener('abort', () =>
          reject(Object.assign(new Error('aborted'), { name: 'TimeoutError' })),
        );
      });
    const err = (await createResendTransport({ apiKey: KEY, fetchImpl, timeoutMs: 10 })
      .send(MSG)
      .catch((e: unknown) => e)) as MailError;
    expect(err).toMatchObject({ retryable: true, message: 'Resend request timed out' });
  });
});

describe('createMailTransport', () => {
  it('builds each transport and insists on the key for resend', () => {
    expect(createMailTransport({ transport: 'log' }, { log: silentLogger }).name).toBe('log');
    expect(
      createMailTransport({ transport: 'resend', resendApiKey: KEY }, { log: silentLogger }).name,
    ).toBe('resend');
    expect(() => createMailTransport({ transport: 'resend' }, { log: silentLogger })).toThrow(
      'RESEND_API_KEY',
    );
  });
});

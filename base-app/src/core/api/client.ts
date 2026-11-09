import type { ApiErrorBody } from '../../../shared/api';
import { config } from '../config/env';

/* Any call answering 401 means the session ended on the server; the auth layer
   listens and re-checks who is signed in. */
const unauthenticated = new EventTarget();
export function onUnauthenticated(listener: () => void): () => void {
  unauthenticated.addEventListener('unauthenticated', listener);
  return () => unauthenticated.removeEventListener('unauthenticated', listener);
}

/* The server answers 503 `maintenance` to a non-admin while maintenance mode is on. The settings
   layer listens, re-reads the settings and shows the "back soon" page. */
const maintenance = new EventTarget();
export function onMaintenance(listener: () => void): () => void {
  maintenance.addEventListener('maintenance', listener);
  return () => maintenance.removeEventListener('maintenance', listener);
}

/* A failed API call. status 0 means the request never got a response. */
export class ApiError extends Error {
  status: number;
  code: string;
  /** Facts the server sent to help recover (what was looked for, the quantity now held). */
  details: Record<string, unknown> | undefined;

  constructor(status: number, code: string, message: string, details?: Record<string, unknown>) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
    this.details = details;
  }
}

function isApiErrorBody(payload: unknown): payload is ApiErrorBody {
  if (typeof payload !== 'object' || payload === null) return false;
  if (!('error' in payload)) return false;
  const error = payload.error;
  return (
    typeof error === 'object' &&
    error !== null &&
    'code' in error &&
    typeof error.code === 'string' &&
    'message' in error &&
    typeof error.message === 'string'
  );
}

async function readJson(res: Response): Promise<unknown> {
  const text = await res.text();
  if (text === '') return undefined;
  try {
    return JSON.parse(text) as unknown;
  } catch {
    return undefined;
  }
}

/* Every request has a deadline. On a phone outdoors a request more often stalls than fails: the
   radio drops mid-upload and the connection hangs for minutes, so without one a flow would sit
   on "Adding…" with every exit locked. When the deadline passes the request is abandoned and
   answers like a lost connection (status 0, code `timeout`): the screens already keep the same
   request id for that and offer Try again, so a save that did land is replayed, not repeated.
   A caller with a slower job (the AI reading a report) passes its own `timeoutMs`. */
export const JSON_TIMEOUT_MS = 20_000;
export const FILE_TIMEOUT_MS = 60_000;
export const TIMEOUT_MESSAGE = 'This is taking too long. Check your connection and tap Try again.';

export interface RequestOptions {
  signal?: AbortSignal;
  /** How long to wait for the whole answer (headers and body) before giving up. */
  timeoutMs?: number;
}

interface Deadline {
  signal: AbortSignal;
  timedOut: () => boolean;
  /** Stops the timer but keeps the caller's abort wired to the request (a stream the caller
      still reads, and may cancel). */
  stop: () => void;
  /** Stops the timer and lets go of the caller's signal: the request is over. */
  clear: () => void;
}

/** The caller's signal, plus a timer that aborts the request when `ms` have passed. */
function deadline(caller: AbortSignal | undefined, ms: number): Deadline {
  const controller = new AbortController();
  let expired = false;
  const onAbort = () => controller.abort(caller?.reason);
  if (caller?.aborted) controller.abort(caller.reason);
  else caller?.addEventListener('abort', onAbort, { once: true });
  const timer = setTimeout(() => {
    expired = true;
    controller.abort(new DOMException('The request took too long.', 'TimeoutError'));
  }, ms);
  return {
    signal: controller.signal,
    timedOut: () => expired && !caller?.aborted,
    stop: () => clearTimeout(timer),
    clear: () => {
      clearTimeout(timer);
      caller?.removeEventListener('abort', onAbort);
    },
  };
}

const timeoutError = () => new ApiError(0, 'timeout', TIMEOUT_MESSAGE);

/* Sends the request. A network failure is an ApiError (status 0); an abort by the caller
   is rethrown as is; a request past its deadline is an ApiError (status 0, `timeout`). A non-2xx
   answer is turned into an ApiError from its envelope. The deadline stays armed until `done` is
   called, so reading the body counts against it too. */
type Method = 'GET' | 'POST' | 'PUT' | 'PATCH' | 'DELETE';

async function send(
  method: Method,
  path: `/${string}`,
  body: unknown,
  init: RequestOptions & { headers?: Record<string, string>; raw?: Blob } = {},
): Promise<{ res: Response; read: () => Promise<unknown>; done: () => void }> {
  const timer = deadline(
    init.signal,
    init.timeoutMs ?? (init.raw ? FILE_TIMEOUT_MS : JSON_TIMEOUT_MS),
  );
  try {
    const res = await sendOnce(method, path, body, init, timer);
    const read = async () => {
      try {
        return await readJson(res);
      } catch (err) {
        if (timer.timedOut()) throw timeoutError();
        throw err;
      } finally {
        timer.clear();
      }
    };
    return { res, read, done: timer.stop };
  } catch (err) {
    timer.clear();
    throw err;
  }
}

async function sendOnce(
  method: Method,
  path: `/${string}`,
  body: unknown,
  init: RequestOptions & { headers?: Record<string, string>; raw?: Blob },
  timer: Deadline,
): Promise<Response> {
  const url = `${config.apiBase}${path}`;
  const options: RequestInit = { method, signal: timer.signal };
  const headers: Record<string, string> = { ...init.headers };
  if (init.raw) {
    // a raw body (an upload): sent as it is, with its own type
    headers['content-type'] = init.raw.type;
    options.body = init.raw;
  } else if (body !== undefined) {
    headers['content-type'] = 'application/json';
    options.body = JSON.stringify(body);
  }
  if (Object.keys(headers).length > 0) options.headers = headers;
  let res: Response;
  try {
    res = await fetch(url, options);
  } catch (err) {
    if (timer.timedOut()) throw timeoutError();
    if (init.signal?.aborted) throw err;
    throw new ApiError(0, 'network', 'The API could not be reached. Check the connection.');
  }
  if (!res.ok) {
    let payload: unknown;
    try {
      payload = await readJson(res);
    } catch (err) {
      if (timer.timedOut()) throw timeoutError();
      throw err;
    }
    if (res.status === 401 && path !== '/auth/login') {
      unauthenticated.dispatchEvent(new Event('unauthenticated'));
    }
    if (isApiErrorBody(payload)) {
      if (res.status === 503 && payload.error.code === 'maintenance') {
        maintenance.dispatchEvent(new Event('maintenance'));
      }
      throw new ApiError(
        res.status,
        payload.error.code,
        payload.error.message,
        payload.error.details,
      );
    }
    throw new ApiError(res.status, 'http_error', `The API returned status ${res.status}.`);
  }
  return res;
}

async function request<T>(
  method: Method,
  path: `/${string}`,
  body: unknown,
  init?: RequestOptions,
): Promise<T> {
  const { read } = await send(method, path, body, init);
  return (await read()) as T;
}

/* POSTs a JSON body and hands back the open response for the caller to read as a stream
   (server-sent events: a POST, so not EventSource). Failures before the stream starts are
   ApiErrors, exactly as for apiPost. The caller owns reading the body to its end. */
export async function apiPostStream<B>(
  path: `/${string}`,
  body: B,
  init?: { signal?: AbortSignal },
): Promise<ReadableStream<Uint8Array>> {
  const { res, done } = await send('POST', path, body, {
    ...init,
    headers: { accept: 'text/event-stream' },
  });
  // the deadline covers the stream starting; once it has, the caller owns how long to read
  done();
  if (!res.body) throw new ApiError(res.status, 'http_error', 'The API sent no stream.');
  return res.body;
}

export function apiGet<T>(path: `/${string}`, init?: RequestOptions): Promise<T> {
  return request<T>('GET', path, undefined, init);
}

export function apiPost<T, B>(path: `/${string}`, body: B, init?: RequestOptions): Promise<T> {
  return request<T>('POST', path, body, init);
}

export function apiPut<T, B>(path: `/${string}`, body: B, init?: RequestOptions): Promise<T> {
  return request<T>('PUT', path, body, init);
}

export function apiPatch<T, B>(path: `/${string}`, body: B, init?: RequestOptions): Promise<T> {
  return request<T>('PATCH', path, body, init);
}

export function apiDelete<T>(path: `/${string}`, init?: RequestOptions): Promise<T> {
  return request<T>('DELETE', path, undefined, init);
}

/* PUTs a file as the raw request body, with the file's own Content-Type (an avatar upload). */
export async function apiPutFile<T>(
  path: `/${string}`,
  file: Blob,
  init?: RequestOptions,
): Promise<T> {
  const { read } = await send('PUT', path, undefined, { ...init, raw: file });
  return (await read()) as T;
}

import { HttpError } from '../infra/http/errors.ts';
import { ServiceError } from '../services/index.ts';

/* Maps a service's business-rule failure to the HTTP envelope. Anything that
   is not a ServiceError passes through untouched (and becomes a 500 with an
   errorId in the router). */
const STATUS: Record<ServiceError['kind'], number> = {
  invalid: 400,
  conflict: 409,
  not_found: 404,
  invalid_credentials: 401,
  forbidden: 403,
  rate_limited: 429,
  too_large: 413,
  unsupported_media: 415,
  unavailable: 503,
  upstream: 502,
  timeout: 504,
};

export function toHttp(err: unknown): unknown {
  if (err instanceof ServiceError) {
    return new HttpError(STATUS[err.kind], err.code, err.message, false, err.details);
  }
  return err;
}

/** Runs a service call and rethrows its ServiceError as an HttpError. */
export async function call<T>(fn: () => Promise<T>): Promise<T> {
  try {
    return await fn();
  } catch (err) {
    throw toHttp(err);
  }
}

/* A business-rule failure, independent of HTTP. Routes map `kind` to a status
   (routes/errors.ts); services never know about status codes or responses. */
export type ServiceErrorKind =
  | 'invalid'
  | 'conflict'
  | 'not_found'
  | 'invalid_credentials'
  | 'forbidden'
  | 'rate_limited'
  | 'too_large'
  | 'unsupported_media'
  | 'forbidden'
  | 'unavailable'
  | 'upstream'
  | 'timeout';

export class ServiceError extends Error {
  readonly kind: ServiceErrorKind;
  /** Machine-readable code for the client, e.g. 'email_taken'. */
  readonly code: string;
  /** Which input field is wrong, when there is one. */
  readonly field: string | undefined;
  /** Facts the client can use to recover (the quantity now held after a 409). Safe to show. */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    kind: ServiceErrorKind,
    code: string,
    message: string,
    field?: string,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'ServiceError';
    this.kind = kind;
    this.code = code;
    this.field = field;
    this.details = details;
  }
}

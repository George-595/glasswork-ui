/* A failure the client should see as the ApiErrorBody envelope. Anything else
   thrown inside a handler becomes a generic 500. */
export class HttpError extends Error {
  readonly status: number;
  readonly code: string;
  /* True when the request body was not (fully) read, so the socket must close. */
  readonly closeConnection: boolean;
  /* Facts the client can use to recover (ApiErrorBody.error.details). */
  readonly details: Record<string, unknown> | undefined;

  constructor(
    status: number,
    code: string,
    message: string,
    closeConnection = false,
    details?: Record<string, unknown>,
  ) {
    super(message);
    this.name = 'HttpError';
    this.status = status;
    this.code = code;
    this.closeConnection = closeConnection;
    this.details = details;
  }
}

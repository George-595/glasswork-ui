/* Structured logging: one JSON object per line on stdout, so logs can be
   grepped by eye and parsed by a machine. Every line has `time`, `level` and
   `msg`; callers add fields (requestId, status, ms...). Never pass secrets,
   request bodies or full URLs with credentials as fields. */
export type LogLevel = 'debug' | 'info' | 'warn' | 'error';
export type LogFields = Record<string, unknown>;

export interface Logger {
  debug(msg: string, fields?: LogFields): void;
  info(msg: string, fields?: LogFields): void;
  warn(msg: string, fields?: LogFields): void;
  error(msg: string, fields?: LogFields): void;
  /** A logger whose lines all carry `fields` (e.g. the request ID). */
  child(fields: LogFields): Logger;
}

const ORDER: Record<LogLevel, number> = { debug: 10, info: 20, warn: 30, error: 40 };

export function createLogger(
  opts: { level?: LogLevel; write?: (line: string) => void; base?: LogFields } = {},
): Logger {
  const min = ORDER[opts.level ?? 'info'];
  const write = opts.write ?? ((line: string) => process.stdout.write(`${line}\n`));
  const base = opts.base ?? {};

  const emit = (level: LogLevel, msg: string, fields?: LogFields): void => {
    if (ORDER[level] < min) return;
    write(JSON.stringify({ time: new Date().toISOString(), level, msg, ...base, ...fields }));
  };

  return {
    debug: (msg, fields) => emit('debug', msg, fields),
    info: (msg, fields) => emit('info', msg, fields),
    warn: (msg, fields) => emit('warn', msg, fields),
    error: (msg, fields) => emit('error', msg, fields),
    child: (fields) => createLogger({ ...opts, base: { ...base, ...fields } }),
  };
}

/** A logger that writes nothing (tests). */
export const silentLogger: Logger = createLogger({ write: () => {} });

/** Error details safe for the server log: name and message, never sent to clients. */
export function errorFields(err: unknown): LogFields {
  if (err instanceof Error) return { errName: err.name, errMessage: err.message };
  return { errName: 'non-Error value' };
}

/* A secret that rides in a path must not reach the log: the invitation token in
   GET /api/auth/invite/<token> is the whole credential. Every log line that names a path
   goes through this first. */
export function loggablePath(pathname: string): string {
  return pathname.replace(/^(\/api\/auth\/invite\/).+$/, '$1[redacted]');
}

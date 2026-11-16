import { DEMO_AI_MESSAGE, DEMO_LOGIN } from '../config/env.ts';
import { HttpError } from '../infra/http/errors.ts';
import type { RequestGate } from '../infra/http/types.ts';

/* DEMO_MODE: the shared demo login may look at everything and change nothing. Every request
   from it that would change something is refused, except signing out. Any other account (the
   real admin) is untouched. Off when DEMO_MODE is not set. */
const READS = new Set(['GET', 'HEAD', 'OPTIONS']);
const ALLOWED = new Set(['/api/auth/logout']);
const AI = /^\/api\/(?:agent|llm)\//;

export function createDemoGate(demo: boolean): RequestGate {
  return async ({ principal, method, path }) => {
    if (!demo || principal?.id !== DEMO_LOGIN.id) return;
    if (READS.has(method) || ALLOWED.has(path)) return;
    // the assistant is off for the demo login (no model spend from a public page), said kindly
    if (AI.test(path)) throw new HttpError(503, 'ai_disabled', DEMO_AI_MESSAGE);
    throw new HttpError(
      403,
      'demo_read_only',
      'This is a read-only demo: look around as much as you like, but nothing here can be changed.',
    );
  };
}

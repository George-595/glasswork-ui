import type { Logger } from '../log/logger.ts';
import { createLogTransport } from './log.ts';
import { createResendTransport } from './resend.ts';
import type { MailTransport, MailTransportName } from './types.ts';

export { createLogTransport } from './log.ts';
export { createResendTransport } from './resend.ts';
export {
  MailError,
  type MailMessage,
  type MailTransport,
  type MailTransportName,
} from './types.ts';

/* The transport the config names. `resend` needs its key (config checks that at start-up
   too; this is the backstop). */
export function createMailTransport(
  cfg: { transport: MailTransportName; resendApiKey?: string | undefined },
  deps: { log: Logger; fetchImpl?: typeof fetch },
): MailTransport {
  if (cfg.transport === 'log') return createLogTransport(deps.log);
  if (!cfg.resendApiKey) throw new Error('RESEND_API_KEY must be set for MAIL_TRANSPORT=resend');
  return createResendTransport({
    apiKey: cfg.resendApiKey,
    ...(deps.fetchImpl ? { fetchImpl: deps.fetchImpl } : {}),
  });
}

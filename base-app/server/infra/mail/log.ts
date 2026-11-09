import type { Logger } from '../log/logger.ts';
import type { MailMessage, MailTransport } from './types.ts';

/* The development transport: nothing leaves the machine. The email is already in the
   outbound_emails table (the admin Mail page shows it, links clickable), so "sending" is
   writing one line to the log. The line names the recipient and subject, never the body:
   the body holds single-use links. */
export function createLogTransport(log: Logger): MailTransport {
  return {
    name: 'log',
    async send(message: MailMessage) {
      log.info('mail not sent (log transport): read it on the admin Mail page', {
        to: message.to,
        subject: message.subject,
      });
      return { providerMessageId: null };
    },
  };
}

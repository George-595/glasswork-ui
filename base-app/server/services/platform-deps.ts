import type { DbExecutor } from '../infra/db/types.ts';

/* The collaborators the account and sign-in services use but do not own. Each is a structural
   copy of the interface its owner exports (the mail outbox in outbox.ts, the notifier in
   notifications.ts, the realtime hub in events.ts), so these services compile and are tested
   alone, with fakes; createServices wires the real ones. The no-op versions below are what
   createServices uses until something real is passed in. */

export type EmailTemplate = 'invite' | 'password_reset' | 'password_changed' | 'notification';
export interface EmailMessage {
  to: string;
  template: EmailTemplate;
  data: Record<string, string>;
}
/** Enqueues an email in the caller's transaction: a rolled-back change sends nothing. */
export interface Outbox {
  sendEmail(tx: DbExecutor, msg: EmailMessage): Promise<void>;
}

export type NotificationKind = 'account' | 'security' | 'team' | 'system';
export interface NotifyInput {
  userId: string;
  kind: NotificationKind;
  title: string;
  body?: string;
  link?: string;
}
/** Writes in-app notifications in the caller's transaction. */
export interface Notifier {
  notify(tx: DbExecutor, input: NotifyInput): Promise<void>;
  notifyAdmins(
    tx: DbExecutor,
    input: Omit<NotifyInput, 'userId'>,
    opts?: { exceptUserId?: string },
  ): Promise<void>;
}

/** Closes open event streams when the session or the person behind them is revoked. */
export interface StreamDisconnector {
  disconnectSession(sessionId: string): void;
  disconnectUser(userId: string): void;
}

export const noopOutbox: Outbox = { sendEmail: async () => undefined };
export const noopNotifier: Notifier = {
  notify: async () => undefined,
  notifyAdmins: async () => undefined,
};
export const noopStreams: StreamDisconnector = {
  disconnectSession: () => undefined,
  disconnectUser: () => undefined,
};

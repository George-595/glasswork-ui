# server/infra/mail

Mail transports: one finished message in, a provider id out. Nothing here renders a template, writes the outbox or
retries (that is `services/outbox.ts` and the job queue).

- **`types.ts`:** `MailTransport` (`send(message)`), `MailMessage`, and `MailError` with `retryable`.
- **`log.ts`:** the development transport. No network: logs one line (recipient and subject, never the body, which
  holds single-use links). The email is already in `outbound_emails`, so the admin Mail page is the dev mailbox.
- **`resend.ts`:** Resend's HTTP API over raw `fetch`. The key goes in the `Authorization` header only. Network
  error, timeout, 429 and 5xx are retryable; any other 4xx is permanent (retrying a bad address cannot help). The
  stored error is the status and Resend's error *name*, never its free text (it can echo the request).
- **`index.ts`:** `createMailTransport({ transport, resendApiKey }, { log, fetchImpl? })`.
- **Config:** `MAIL_TRANSPORT` (`log` | `resend`), `RESEND_API_KEY`, `MAIL_FROM`, `APP_BASE_URL`, read once in
  `config/env.ts`. Production must say which transport it wants (a silent `log` would drop every invite).
- **Imports:** `infra/log` types only. **Imported by:** `server/main.ts` and `services/outbox.ts` (types).

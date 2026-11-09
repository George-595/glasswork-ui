# server/infra/log

`createLogger()`: one JSON object per line on stdout (`time`, `level`, `msg` + fields).
`child({ requestId })` tags every line of a request. `errorFields(err)` gives name and message
for the log; never send them to a client. Never log secrets, bodies or credentials.

- **May import:** nothing. **Imported by:** `main.ts`, `infra/http`, routes (via the context).

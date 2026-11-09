# data/fake

Deterministic fake data for the pages: users, transactions, revenue and cost series, KPIs,
category totals, monthly signups, audit log and recent activity. Everything is seeded from
`FAKE_SEED` and anchored to `FAKE_NOW` (2026-10-01T09:00Z), so the same call returns the same
data forever. Money is integer pence. Results are memoised per argument.

**May import:** `core/utils` only. Never `core/api`, pages, `app/` or React.

**May be imported by:** pages and the `app/` shell (through `index.ts`).

Rules:
- No `Date.now()`, no `Math.random()`, no unseeded randomness.
- Each generator uses its own seed offset; add a new offset rather than reusing one.
- Emails use `@example.com`; IPs use documentation ranges only.

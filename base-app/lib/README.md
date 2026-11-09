# core/utils

Pure helpers with no app knowledge: seeded random numbers (`rng.ts`), en-GB formatting for
money, numbers and percentages (`format.ts`), explicit-timezone dates (`dates.ts`), ids and
slugs (`ids.ts`) small arithmetic (`numbers.ts`) and the transactions table-query vocabulary
(`transactions.ts`: sort keys, statuses, categories, page limits) and the server-sent events
parser (`sse.ts`: `createSseParser`, `parseSse`; used by the browser for `/api/llm/stream` and by the server for the
Anthropic and Gemini streams).

**May import:** nothing app-level. Only the standard library, the DOM globals and `Intl`.

**May be imported by:** everything in `src/` (`core/*`, `data/fake`, pages, `app/`).

Rules:
- No React, no `fetch`, no `window` access at import time.
- Money is integer minor units (pence). Formatting converts; nothing else divides.
- Negatives print with U+2212, never a hyphen.
- Each module has a `*.test.ts` beside it.

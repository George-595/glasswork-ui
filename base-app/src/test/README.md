# src/test

The web test harness. No testing-library: a few small helpers of our own.

- `setup.ts`: jsdom gaps (matchMedia, ResizeObserver, `<dialog>`), and a reset before every
  test: storage, `<html>` attributes, the hash, and `fetch` stubbed to reject (no network).
- `render.tsx`: `render(ui, { skin, mode })` and `flush()` for lazy pages and promises.
- `dom.ts`: `changeValue`, `click`, `press`, `getByRole`, `getAllByRole`, `getByText`.
- `axe.ts`: `runAxe()` with the WCAG 2.2 AA tags. Name a describe `a11y …` so `npm run a11y`
  picks it up. Contrast is checked in a real browser, not here (see the file's comment).
- Imported only by `*.test.ts(x)` files.

`mockApi` also serves `GET`/`PUT /api/settings` from a live `settings` object: `mockApi({ settings: { 'maintenance.enabled': true } })`.

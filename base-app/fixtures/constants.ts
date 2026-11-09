/* Every generator is seeded from FAKE_SEED and anchored to FAKE_NOW. Never use Date.now()
   or unseeded randomness in this folder: the same call must give the same data forever. */
export const FAKE_SEED = 20261011;
export const FAKE_NOW = '2026-10-01T09:00:00.000Z';
export const DAY_MS = 86_400_000;

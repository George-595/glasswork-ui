import { defineConfig } from 'vitest/config';

/* The axe scans in tests/ take seconds each when every workspace runs at once;
   the 5 s default times out under a full `npm test`, not on a slow component. */
export default defineConfig({
  test: { testTimeout: 30_000, setupFiles: ['./tests/setup.ts'] },
});

import { defineConfig, mergeConfig } from 'vitest/config';
import viteConfig from './vite.config.ts';

/* Two test projects: `web` (src/, jsdom) and `server` (server/, shared/, lib/, fixtures/; node).
   Run one area: `npx vitest run --project server infra/db` from apps/base-app. */
export default defineConfig({
  test: {
    projects: [
      mergeConfig(viteConfig, {
        test: {
          name: 'web',
          environment: 'jsdom',
          include: ['src/**/*.test.{ts,tsx}'],
          setupFiles: ['./src/test/setup.ts'],
          restoreMocks: true,
          // the axe page scans take seconds each when every worker runs at once;
          // the 5 s default times out under a full `npm test`, not on a slow page
          testTimeout: 30_000,
        },
      }),
      {
        test: {
          name: 'server',
          environment: 'node',
          include: [
            'server/**/*.test.ts',
            'scripts/**/*.test.ts',
            'shared/**/*.test.ts',
            'lib/**/*.test.ts',
            'fixtures/**/*.test.ts',
          ],
        },
      },
    ],
  },
});

import { defineConfig } from 'vitest/config';

/** Unit tests that do not need a database. The full suite still requires TEST_DATABASE_URL. */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/lifecycle-decisions.test.ts', 'tests/discord-starters.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

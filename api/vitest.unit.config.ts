import { defineConfig } from 'vitest/config';

/** Unit tests that do not need a database. The full suite still requires TEST_DATABASE_URL. */
export default defineConfig({
  test: {
    environment: 'node',
    env: {
      DATABASE_URL: 'postgresql://unit:unit@127.0.0.1:1/blipmade_unit_test',
      SESSION_SECRET: '0123456789abcdef0123456789abcdef',
    },
    include: ['tests/lifecycle-decisions.test.ts', 'tests/discord-starters.test.ts', 'tests/discord-community.test.ts', 'tests/discord-access.test.ts', 'tests/backup-archive.test.ts', 'tests/catalog-install.test.ts', 'tests/import-runtime.test.ts', 'tests/project-links.test.ts', 'tests/install-variables.test.ts', 'tests/disk-shrink.test.ts', 'tests/diagnosis.test.ts', 'tests/deploy-history.test.ts'],
    testTimeout: 180_000,
    hookTimeout: 180_000,
  },
});

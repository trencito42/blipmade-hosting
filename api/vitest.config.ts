import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    // The suite runs the files one after another in one process, so a stub of
    // a global that a file installs would be found by the next file. The
    // globals are therefore put back after every test.
    unstubGlobals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The suite shares one database, so the files run one after another.
    pool: 'forks',
    poolOptions: { forks: { singleFork: true } },
    fileParallelism: false,
  },
});

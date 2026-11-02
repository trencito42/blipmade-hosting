import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { SUPPORT_INBOUND_TOKEN: 'test-inbound-token-123456', SUPPORT_AI_ALLOW_PRIVATE: '1', SUPPORT_AI_API_KEY: 'test-provider-key-0000' },
    include: ['tests/**/*.test.ts'],
    globalSetup: ['tests/globalSetup.ts'],
    setupFiles: ['tests/setup.ts'],
    // The suite runs the files one after another in one process, so a stub of
    // a global that a file installs would be found by the next file. The
    // globals are therefore put back after every test.
    unstubGlobals: true,
    testTimeout: 60_000,
    hookTimeout: 60_000,
    // The suite shares one database, so the files run one after another, and
    // never at the same time.
    //
    // The upgrade of the runner of the tests took away the option that kept
    // the files in one worker, and the runner of the version 5 hangs when it
    // is asked for a single worker, so the files run one after another in
    // the workers the runner uses. The globals are put back after every test,
    // so a stub of a global that a file installs is not found by the next
    // file.
    pool: 'forks',
    fileParallelism: false,
  },
});

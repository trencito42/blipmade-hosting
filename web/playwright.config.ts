import { defineConfig, devices } from '@playwright/test';

/**
 * The browser tests of the site.
 *
 * The site is served by the server of the platform, and the server forwards
 * `/api` to the API, so the tests walk the same path a visitor walks.
 *
 * The address of the site comes from `E2E_BASE_URL`. When it is not given, the
 * tests start the server of the site on `E2E_PORT` and wait for it, so a
 * single command is enough to run them on a machine that has the built site.
 */
const baseURL = process.env.E2E_BASE_URL ?? `http://127.0.0.1:${process.env.E2E_PORT ?? '30001'}`;
const port = Number(process.env.E2E_PORT ?? '30001');

export default defineConfig({
  testDir: './e2e',
  fullyParallel: false,
  forbidOnly: Boolean(process.env.CI),
  retries: 0,
  workers: 1,
  reporter: [['list']],
  timeout: 45_000,
  expect: { timeout: 10_000 },
  use: {
    baseURL,
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    // The site is dark, and the tests look at the colours that are painted.
    colorScheme: 'dark',
  },
  projects: [
    {
      name: 'desktop',
      use: { ...devices['Desktop Chrome'], viewport: { width: 1440, height: 900 } },
    },
    {
      name: 'mobile',
      use: { ...devices['Pixel 7'] },
      testMatch: /mobile\.spec\.ts/,
    },
  ],
  webServer: process.env.E2E_BASE_URL
    ? undefined
    : {
        command: `node server.mjs`,
        url: `http://127.0.0.1:${port}`,
        reuseExistingServer: true,
        timeout: 60_000,
        env: { SERVER_PORT: String(port), API_URL: process.env.E2E_API_URL ?? 'http://127.0.0.1:3100' },
      },
});

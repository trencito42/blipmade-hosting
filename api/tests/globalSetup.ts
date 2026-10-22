import { execFileSync } from 'node:child_process';

/**
 * Prepares the test database before the suite runs. The test database is
 * separate from the live one, so a migration can never touch production data.
 */
export default async function globalSetup(): Promise<void> {
  const databaseUrl = process.env.TEST_DATABASE_URL ?? process.env.DATABASE_URL;
  if (!databaseUrl) throw new Error('TEST_DATABASE_URL or DATABASE_URL must be set to run the tests.');

  execFileSync('npx', ['prisma', 'migrate', 'deploy'], {
    env: { ...process.env, DATABASE_URL: databaseUrl },
    stdio: 'inherit',
  });
}

import { defineConfig } from "vitest/config";
// The test of the environment of an instance does not touch the database, so
// it runs without the migration of the suite: the schema of the deployment of
// the platform is in the middle of a change and the migration of the suite
// would refuse to run.
export default defineConfig({
  test: {
    environment: "node",
    // The guard of the stand-in server asks the platform to verify a
    // deployment, and the platform reads its settings when it is loaded. The
    // settings are here, but no query is made, so no database is needed.
    env: {
      DATABASE_URL: "postgresql://postgres:postgres@127.0.0.1:5432/blipmade",
      SESSION_SECRET: "the-environment-suite-needs-a-secret",
    },
    include: [
      "tests/egg-environment.test.ts",
      "tests/starter-app.test.ts",
      "tests/starter-guard.test.ts",
      "tests/starter-runtime.test.ts",
    ],
  },
});

import { defineConfig } from "vitest/config";
// The test of the environment of an instance does not touch the database, so
// it runs without the migration of the suite: the schema of the deployment of
// the platform is in the middle of a change and the migration of the suite
// would refuse to run.
export default defineConfig({
  test: {
    environment: "node",
    include: ["tests/egg-environment.test.ts"],
  },
});

import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * The isolation of the test suite from the machine it runs on.
 *
 * The suite runs on the machine of the platform, with the configuration of the
 * platform. The mail of a fixture of a test is written to the file transport,
 * and the file transport writes into the directory of the mail of the
 * platform. The suite filled that directory with thousands of fixtures, and
 * the retention of the platform then removed the mail of the customers as if
 * it were old: the operator found a directory of test data where the messages
 * of the platform should have been.
 *
 * This test reads the script that runs the suite and fails when the suite can
 * write into the directory of the mail of the platform.
 */

const ROOT = resolve(process.cwd(), "..");
const RUNNER = join(ROOT, "scripts", "run-tests.sh");
const ENV_FILE = join(ROOT, "api", "src", "env.ts");

describe("the isolation of the test suite", () => {
  it("writes the mail of its fixtures into a directory of its own", async () => {
    const runner = await readFile(RUNNER, "utf-8");

    const match = /^export BACKUP_DIR="\$\{TEST_BACKUP_DIR:-([^}]+)\}"/m.exec(runner);
    expect(match).not.toBeNull();
    const directory = match![1]!;

    expect(directory).not.toBe("/var/backups/blipmade");
    expect(directory.startsWith("/var/backups/blipmade/")).toBe(false);
  });

  it("creates the directory of the mail of the suite before it runs", async () => {
    const runner = await readFile(RUNNER, "utf-8");

    expect(runner).toContain("mkdir -p \"$BACKUP_DIR/mail\"");
  });

  it("writes the receipts of the operations into a directory of its own", async () => {
    const runner = await readFile(RUNNER, "utf-8");

    const match = /^export OPS_STATUS_DIR="\$\{TEST_OPS_STATUS_DIR:-([^}]+)\}"/m.exec(runner);
    expect(match).not.toBeNull();
    const directory = match![1]!;

    expect(directory).not.toBe("/var/backups/blipmade/status");
    expect(directory.startsWith("/var/backups/blipmade/")).toBe(false);
  });

  it("leaves the receipts of the platform alone", async () => {
    const runner = await readFile(RUNNER, "utf-8");

    const override = /^export OPS_STATUS_DIR="\$\{TEST_OPS_STATUS_DIR:-([^}]+)\}"/m.exec(runner);
    expect(override).not.toBeNull();

    // The scripts of the backups write into the directory of the state of the
    // operations, and the platform reads that directory to know whether the
    // backup of the night happened. A suite that writes there replaces the
    // receipts of the platform with the receipts of its own run.
    expect(override![1]!).not.toContain("/var/backups/blipmade");
  });

  it("leaves the directory of the mail of the platform alone", async () => {
    const env = await readFile(ENV_FILE, "utf-8");
    const runner = await readFile(RUNNER, "utf-8");

    const match = /BACKUP_DIR: z\.string\(\)\.default\(.([^"\x27]+)./.exec(env);
    expect(match).not.toBeNull();
    const platformDirectory = match![1]!;

    const override = /^export BACKUP_DIR="\$\{TEST_BACKUP_DIR:-([^}]+)\}"/m.exec(runner);
    expect(override).not.toBeNull();

    expect(override![1]!).not.toBe(platformDirectory);
  });
});

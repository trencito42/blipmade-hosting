#!/usr/bin/env tsx
/**
 * The guard of the destructive commands, for the scripts of the shell.
 *
 * The scripts of the platform are written in bash and in TypeScript, and
 * they all have to ask the same question before they destroy anything: is
 * the database one that may be thrown away? The answer comes from the module
 * of the platform, so the rule is written once.
 *
 * Usage:
 *   npx tsx ../scripts/lib/assert-disposable-db.ts --label "reset the database"
 *   npx tsx ../scripts/lib/assert-disposable-db.ts --name blipmade_test
 *
 * The database of the environment is used when no name is given.
 */
import { assertDestructiveTargetIsSafe } from '../../api/src/lib/destructive-guard.js';

function argument(name: string): string | undefined {
  const index = process.argv.indexOf(`--${name}`);
  if (index < 0) return undefined;
  return process.argv[index + 1];
}

const label = argument('label') ?? 'destroy the database';
const name = argument('name');

try {
  if (name) {
    // The name is checked on its own, because a script may build the url of
    // the database it is about to touch.
    const target = `postgresql://localhost/${name}`;
    assertDestructiveTargetIsSafe({ url: target, label });
    console.log(`==> the database that is about to be touched: ${name}`);
  } else {
    const database = assertDestructiveTargetIsSafe({ label });
    console.log(`==> the database that is about to be touched: ${database}`);
  }
} catch (error) {
  // The refusal is the answer of the command, not a crash: the person who
  // reads it is holding a command, and a stack of frames does not tell them
  // anything they can use.
  console.error((error as Error).message);
  process.exit(1);
}

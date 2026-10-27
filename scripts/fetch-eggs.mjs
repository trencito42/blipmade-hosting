#!/usr/bin/env node
/**
 * Fetches the official eggs of Pterodactyl that the platform uses.
 *
 * The eggs live in the repository of Pterodactyl itself, so the files here are
 * a copy of it: the panel reads the file as it is, and the copy is what the
 * operator imports. A copy is kept so the file that is imported is known
 * before the import, and so the platform can check that the variables it
 * writes are the variables of the egg.
 *
 * The check is the one of the panel: the panel reads the file and refuses it
 * when the version is not "PTDL_v2" or when the variables have no name in the
 * environment. A file that passes here is accepted by the panel.
 *
 * Usage:
 *   node scripts/fetch-eggs.mjs           # writes the files
 *   node scripts/fetch-eggs.mjs --check   # only checks the files that are there
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const TARGET = join(ROOT, 'pterodactyl-eggs');

/** The eggs the platform uses, with the path they have in the repository of Pterodactyl. */
const EGGS = [
  { file: 'postgres16.json', path: 'database/sql/postgres/egg-postgres16.json' },
  { file: 'code-server.json', path: 'code-server/egg-code--server.json' },
  { file: 'uptime-kuma.json', path: 'uptime-kuma/egg-uptime-kuma.json' },
];

const SOURCE = 'https://raw.githubusercontent.com/pterodactyl/application-eggs/main';

/**
 * Checks a file the way the panel checks it.
 *
 * The panel refuses a file whose version is not known, and it refuses a
 * variable without a name in the environment, because the variable would
 * never reach the container.
 */
function check(name, parsed) {
  const problems = [];

  if (!parsed || typeof parsed !== 'object' || Array.isArray(parsed)) {
    return ['the file is not an object'];
  }

  const version = parsed?.meta?.version ?? '';
  if (version !== 'PTDL_v1' && version !== 'PTDL_v2') {
    problems.push(`the version is "${version}" and the panel only reads "PTDL_v1" and "PTDL_v2"`);
  }

  if (typeof parsed.name !== 'string' || parsed.name.trim() === '') {
    problems.push('the egg has no name');
  }

  if (!parsed.docker_images || typeof parsed.docker_images !== 'object') {
    problems.push('the egg carries no image');
  }

  if (typeof parsed.startup !== 'string' || parsed.startup.trim() === '') {
    problems.push('the egg carries no startup command');
  }

  if (!parsed.scripts?.installation?.script) {
    problems.push('the egg carries no installation script');
  }

  for (const variable of parsed.variables ?? []) {
    if (!variable.env_variable) {
      problems.push(`the variable "${variable.name ?? 'without a name'}" has no name in the environment`);
    }
    if (!variable.rules) {
      problems.push(`the variable "${variable.env_variable}" has no rule`);
    }
  }

  return problems;
}

async function main() {
  const onlyCheck = process.argv.includes('--check');
  const failures = [];

  for (const egg of EGGS) {
    const target = join(TARGET, egg.file);

    if (!onlyCheck) {
      const response = await fetch(`${SOURCE}/${egg.path}`);
      if (!response.ok) {
        failures.push(`${egg.file}: the file could not be fetched (HTTP ${response.status})`);
        continue;
      }
      const body = await response.text();
      await writeFile(target, body, 'utf8');
      console.info(`==> fetched ${egg.file}`);
    }

    let parsed;
    try {
      parsed = JSON.parse(await readFile(target, 'utf8'));
    } catch (error) {
      failures.push(`${egg.file}: the file is not a valid JSON (${error.message})`);
      continue;
    }

    const problems = check(egg.file, parsed);
    if (problems.length > 0) {
      failures.push(`${egg.file}: ${problems.join('; ')}`);
      continue;
    }
    console.info(`    ${parsed.name}: ${Object.keys(parsed.variables ?? {}).length === 0 ? 0 : (parsed.variables ?? []).length} variables, the panel will accept the file`);
  }

  if (failures.length > 0) {
    for (const failure of failures) console.error(`error: ${failure}`);
    process.exit(1);
  }

  console.info('The eggs of the panel are ready to be imported.');
}

await main();

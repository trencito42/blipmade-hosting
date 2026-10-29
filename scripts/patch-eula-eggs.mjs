#!/usr/bin/env node
/**
 * Puts the EULA of Minecraft into the eggs that need it.
 *
 * An egg of Minecraft declares the feature `eula`, and the feature is a
 * promise that the game is started only when its EULA is accepted. The eggs
 * of the repository did not keep that promise: their install script never
 * wrote `eula.txt`, so the server of the game started, read no acceptance and
 * stopped with the line "You need to agree to the EULA in order to run the
 * server." The game never listened on its port, and the product could not be
 * opened.
 *
 * This script gives every egg with the feature `eula`:
 *
 *   - the variable `EULA`, which says TRUE when the EULA is accepted. The
 *     host accepts it for the instances it runs, so the default is TRUE and
 *     a customer who says FALSE keeps the server from starting on purpose;
 *   - the lines of the install script that write `eula.txt` when the variable
 *     says TRUE.
 *
 * The script is idempotent: an egg that already has the variable and the
 * lines is left as it is.
 *
 * Usage:
 *   node scripts/patch-eula-eggs.mjs           # patches the files
 *   node scripts/patch-eula-eggs.mjs --check   # only says what is missing
 */

import { readdir, readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'pterodactyl-eggs');

/** The variable that says whether the EULA is accepted. */
export const EULA_VARIABLE = {
  name: 'Accept the Minecraft EULA',
  description:
    'Set to TRUE to accept the Minecraft EULA (https://aka.ms/MinecraftEULA). The server only starts when the EULA is accepted.',
  env_variable: 'EULA',
  default_value: 'TRUE',
  user_viewable: true,
  user_editable: true,
  rules: 'required|in:TRUE,FALSE',
  field_type: 'text',
};

/** The lines of the install script that write the acceptance. */
export const EULA_LINES = [
  '# The EULA of the game is accepted by the host for the instances it runs.',
  '# A customer who says FALSE keeps the server from starting on purpose.',
  'if [ "${EULA}" = "TRUE" ]; then',
  '\techo -e "eula=true" > eula.txt',
  'fi',
];

/**
 * Says whether an egg needs the EULA.
 *
 * The feature is written by the panel itself when the egg is exported, so the
 * file says the same thing as the panel does.
 */
export function needsEula(egg) {
  return Array.isArray(egg?.features) && egg.features.includes('eula');
}

/** The install script of an egg, or an empty string when it has none. */
function installScript(egg) {
  return egg?.scripts?.installation?.script ?? '';
}

/**
 * Puts the lines of the acceptance into the install script.
 *
 * The lines go right after the moment the script stands in the directory of
 * the server, because that is the directory the file has to be written in.
 * A script that never stands in that directory gets the lines at its end,
 * which is the last place where the file can still be written.
 */
export function withEulaLines(script) {
  if (script.includes('eula.txt')) return script;
  // The script of the eggs of the repository ends its lines with CRLF, and the
  // lines that are added use the same ending, so the file stays the file the
  // panel exported.
  const eol = script.includes('\r\n') ? '\r\n' : '\n';
  const lines = script.split(eol);
  const index = lines.findIndex((line) => line.trim() === 'cd /mnt/server');
  if (index === -1) {
    return [...lines, ...EULA_LINES, ''].join(eol);
  }
  return [...lines.slice(0, index + 1), '', ...EULA_LINES, ...lines.slice(index + 1)].join(eol);
}

/**
 * Puts the variable of the acceptance into an egg.
 *
 * The variable keeps its place at the end of the list, so the file of an egg
 * that was not changed before stays the same.
 */
export function withEulaVariable(egg) {
  const variables = Array.isArray(egg?.variables) ? egg.variables : [];
  if (variables.some((variable) => variable?.env_variable === 'EULA')) return variables;
  return [...variables, { ...EULA_VARIABLE }];
}

/**
 * Brings one egg to what the panel needs it to be.
 *
 * The egg is given back with the changes, and the report says what was
 * changed, so the operator can see what the change was before it is written.
 */
export function patchEgg(egg) {
  if (!needsEula(egg)) return { egg, changed: false, notes: [] };

  const notes = [];
  const variables = withEulaVariable(egg);
  if (variables.length !== (egg.variables?.length ?? 0)) {
    notes.push('the variable EULA was added');
  }

  const script = withEulaLines(installScript(egg));
  if (script !== installScript(egg)) {
    notes.push('the install script now writes eula.txt');
  }

  if (!notes.length) return { egg, changed: false, notes: [] };

  return {
    egg: {
      ...egg,
      variables,
      scripts: {
        ...egg.scripts,
        installation: { ...egg.scripts.installation, script },
      },
    },
    changed: true,
    notes,
  };
}

async function main() {
  const check = process.argv.includes('--check');
  const files = (await readdir(DIR)).filter((file) => file.endsWith('.json') && file !== 'manifest.json');
  let changed = 0;

  for (const file of files) {
    const path = join(DIR, file);
    const parsed = JSON.parse(await readFile(path, 'utf-8'));
    const result = patchEgg(parsed);
    if (!result.changed) continue;
    changed += 1;
    console.info(`${file}: ${result.notes.join('; ')}`);
    if (!check) {
      await writeFile(path, `${JSON.stringify(result.egg, null, 4)}\n`, 'utf-8');
    }
  }

  console.info(check ? `${changed} eggs would change.` : `${changed} eggs changed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

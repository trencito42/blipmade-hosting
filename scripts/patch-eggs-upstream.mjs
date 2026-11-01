#!/usr/bin/env node
/**
 * Brings the eggs of the games back to the addresses that still answer.
 *
 * Two eggs of the platform broke because the world moved:
 *
 *   - the eggs of Minecraft that still ask the old address of the project
 *     (`api.papermc.io/v2`) download a short JSON of error instead of the jar
 *     of the game. The server then starts with a file of 142 bytes and says
 *     "Invalid or corrupt jarfile server.jar". The address that answers is
 *     `fill.papermc.io/v3`, and the egg of Paper already uses it;
 *   - the file of configuration of Loki carries the moment the schema starts
 *     as a full timestamp ("2020-10-24T00:00:00Z"), and the binary of the
 *     same release refuses it: "parsing time \"2020-10-24T00:00:00Z\": extra
 *     text: \"T00:00:00Z\"". The binary of Loki reads a date there.
 *
 * The script is idempotent: an egg that is already patched is left as it is.
 *
 * Usage:
 *   node scripts/patch-eggs-upstream.mjs           # patches the files
 *   node scripts/patch-eggs-upstream.mjs --check   # only says what is missing
 */

import { readFile, writeFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const DIR = join(ROOT, 'pterodactyl-eggs');

/**
 * The address of the project that answers, and the way the version and the
 * build are read from it.
 *
 * The old address (`api.papermc.io/v2`) is gone: it answers with a JSON of
 * error for every request, and the jar of the game that the script builds
 * from it is a file of error as well.
 */
export const PAPERMC_V3 = {
  oldProject: 'https://api.papermc.io/v2/projects/',
  newProject: 'https://fill.papermc.io/v3/projects/',
  oldDownload: 'https://api.papermc.io/v2/projects/${PROJECT}/versions/${MINECRAFT_VERSION}/builds/${BUILD_NUMBER}/downloads/${JAR_NAME}',
  newDownload:
    '`curl -s https://fill.papermc.io/v3/projects/${PROJECT}/versions/${MINECRAFT_VERSION}/builds/${BUILD_NUMBER} | jq -r \'.downloads."server:default".url\'`',
};

/** The line that reads the version of the game from the new address. */
const PAPERMC_V3_VERSION = [
  "\tVER_EXISTS=`curl -s https://fill.papermc.io/v3/projects/${PROJECT} | jq -r --arg VERSION $MINECRAFT_VERSION '.versions | any(.[]; index($VERSION))' | grep -m1 true`",
  "\tLATEST_VERSION=`curl -s https://fill.papermc.io/v3/projects/${PROJECT} | jq -r '.versions | to_entries | .[0].value[0]'`",
];

/** The line that reads the build of the game from the new address. */
const PAPERMC_V3_BUILD = [
  "\tBUILD_EXISTS=`curl -s https://fill.papermc.io/v3/projects/${PROJECT}/versions/${MINECRAFT_VERSION} | jq -r --arg BUILD ${BUILD_NUMBER} '.builds[] | tostring | contains($BUILD)' | grep -m1 true`",
  "\tLATEST_BUILD=`curl -s https://fill.papermc.io/v3/projects/${PROJECT}/versions/${MINECRAFT_VERSION} | jq -r '.builds | .[0]'`",
];

/**
 * The lines that make the configuration of Loki one its binary reads.
 *
 * The moment the schema starts is a date in the binary of Loki, and the file
 * of the release carries it as a full timestamp. The service listens on the
 * port of the allocation and keeps its data in the volume of the instance,
 * and those two are the work of the file configuration of the egg, which the
 * panel applies when the instance starts.
 */
export const LOKI_CONFIG_FIX = [
  '# The binary of Loki reads the moment the schema starts as a date, and the',
  '# file of the release carries it as a full timestamp.',
  `sed -i -E 's|from: "?[^"]*"?|from: "2020-10-24"|' loki-docker-config.yaml`,
].join('\n');

/**
 * The lines that take the program of Yarr from the release of the project.
 *
 * The image of the platform does not carry the compiler of Go, so the script
 * that built the program from its sources failed with "make: command not
 * found" and the container of Yarr started with no program in it. The project
 * publishes the program itself, and the release is what the instance runs.
 */
export const YARR_BINARY_INSTALL = [
  'apt update',
  'apt install -y unzip curl',
  '',
  '# The image of the platform does not carry the compiler of Go, so the',
  '# program is taken from the release of the project instead of being built',
  '# from its sources: "make build_default" fails with "make: command not found"',
  '# and the container starts with no program in it.',
  'YARR_VERSION=2.9',
  'curl -L "https://github.com/nkanaev/yarr/releases/download/v${YARR_VERSION}/yarr_linux_amd64.zip" --output yarr.zip',
  'unzip -o yarr.zip',
  'rm -f yarr.zip',
  'chmod +x yarr',
].join('\n');


/**
 * Brings the script of an egg of Minecraft to the address that answers.
 *
 * The script is matched on the lines that read the version and the build,
 * because the eggs of the games do not write them the same way.
 */
export function withPaperMcV3(script) {
  if (!script.includes(PAPERMC_V3.oldProject)) return script;
  let patched = script;

  patched = patched.replace(
    /VER_EXISTS=`[^`]*api\.papermc\.io\/v2[^`]*`/,
    PAPERMC_V3_VERSION[0],
  );
  patched = patched.replace(
    /LATEST_VERSION=`[^`]*api\.papermc\.io\/v2[^`]*`/,
    PAPERMC_V3_VERSION[1],
  );
  patched = patched.replace(
    /BUILD_EXISTS=`[^`]*api\.papermc\.io\/v2[^`]*`/,
    PAPERMC_V3_BUILD[0],
  );
  patched = patched.replace(
    /LATEST_BUILD=`[^`]*api\.papermc\.io\/v2[^`]*`/,
    PAPERMC_V3_BUILD[1],
  );
  patched = patched.replace(
    /DOWNLOAD_URL=https:\/\/api\.papermc\.io\/v2[^\n]*/,
    `\tDOWNLOAD_URL=${PAPERMC_V3.newDownload}`,
  );

  return patched;
}

/**
 * Brings the script of the egg of Loki to a configuration its binary reads.
 *
 * The lines of the older fix are taken out first: the whole block replaces
 * them, and the block carries the port of the allocation as well.
 */
export function withLokiConfigFix(script) {
  if (script.includes('from: "?[^"]*"?') && !script.includes('http_listen_port')) return script;
  const base = script
    .split('\n')
    .filter((line) => {
      if (line.includes("sed -i -E 's|(from: \"")) return false;
      if (line.includes('from: "?[^"]*"?')) return false;
      if (line.includes('# The binary of Loki reads the moment the schema starts as a date')) return false;
      if (line.includes('# file of the release carries it as a full timestamp.')) return false;
      if (line.includes('# The service listens on the port of the allocation and keeps its data in')) return false;
      if (line.includes('# the volume of the instance.')) return false;
      if (line.includes('http_listen_port')) return false;
      if (line.includes('/tmp/loki')) return false;
      return true;
    })
    .join('\n');
  const anchor = 'curl -L https://raw.githubusercontent.com/grafana/loki';
  const at = base.indexOf(anchor);
  if (at === -1) return script;
  const lineEnd = base.indexOf('\n', at);
  if (lineEnd === -1) return script;
  return `${base.slice(0, lineEnd + 1)}${LOKI_CONFIG_FIX}\n${base.slice(lineEnd + 1)}`;
}

/**
 * Brings the script of the egg of Yarr to the program the project publishes.
 *
 * The script that built the program from its sources is taken out, and the
 * release of the project takes its place.
 */
export function withYarrBinary(script) {
  if (script.includes('yarr_linux_amd64.zip')) return script;
  const lines = script.split('\n');
  const start = lines.findIndex((line) => line.includes('git clone') && line.includes('yarr'));
  if (start === -1) return script;
  const end = lines.findIndex((line, index) => index > start && line.includes('Install complete'));
  if (end === -1) return script;
  const before = lines.slice(0, start).filter((line) => !line.includes('mkdir yarr_source'));
  const kept = [...before, ...YARR_BINARY_INSTALL.split('\n'), ...lines.slice(end)];
  return kept.join('\n');
}

/** The patches of the eggs, by the name of the file of the egg. */
const PATCHES = {
  'minecraft-folia.json': withPaperMcV3,
  'minecraft-paper.json': withPaperMcV3,
  'minecraft-forge.json': withPaperMcV3,
  'loki.json': withLokiConfigFix,
  'yarr.json': withYarrBinary,
};

async function main() {
  const check = process.argv.includes('--check');
  let changed = 0;

  for (const [file, patch] of Object.entries(PATCHES)) {
    const path = join(DIR, file);
    let raw;
    try {
      raw = await readFile(path, 'utf-8');
    } catch {
      continue;
    }
    const egg = JSON.parse(raw);
    const script = egg?.scripts?.installation?.script ?? '';
    const patched = patch(script);
    if (patched === script) continue;

    changed += 1;
    console.info(`${file}: the script was brought to the address that answers`);
    if (check) continue;

    egg.scripts.installation.script = patched;
    await writeFile(path, `${JSON.stringify(egg, null, 4)}\n`, 'utf-8');
  }

  console.info(check ? `${changed} eggs would change.` : `${changed} eggs changed.`);
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main().catch((error) => {
    console.error(error);
    process.exit(1);
  });
}

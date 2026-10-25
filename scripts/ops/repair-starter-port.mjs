#!/usr/bin/env node
/**
 * Corrects the line of the port of the application of a container.
 *
 * The node publishes the port of the allocation for the container, and the
 * route of the domain of the customer points at that same port. Pterodactyl
 * gives the port to the container in `SERVER_PORT`, but the application that
 * the platform wrote read `PORT`, a variable the panel does not set, and fell
 * back to a port of its own. The container was published and nobody could
 * reach it.
 *
 * The script reads the files that are really in every container, compares them
 * with the application of the platform and corrects the line of the port of
 * the files that are the application of the platform.
 *
 * The code of a customer is never touched: a file that is not the application
 * of the platform is reported and left exactly as it is.
 *
 * Nothing is written without `--execute`.
 *
 *   node scripts/ops/repair-starter-port.mjs            # plan only
 *   node scripts/ops/repair-starter-port.mjs --execute  # applies the plan
 */

import { existsSync } from 'node:fs';
import dns from 'node:dns/promises';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
/**
 * The built API the script works with.
 *
 * Inside the container of the API that is the release itself. On the host it
 * is the build of the repository, which has to be made before the script is
 * run: the production runs from the image and never writes to the host.
 */
const API_ROOT =
  process.env.BM_API_ROOT ??
  (existsSync('/app/dist/db.js') ? '/app' : path.resolve(HERE, '../../api'));
const EXECUTE = process.argv.includes('--execute');

/**
 * Loads the configuration of the platform.
 *
 * The database is on the loopback of the host, so the name of the compose
 * network is replaced when it does not resolve. The database of the suite is
 * refused: this script changes containers, not rows, and it has to run against
 * the live one.
 */
async function loadEnvironment() {
  const envFile = process.env.BM_ENV_FILE ?? path.resolve(API_ROOT, '../.env');
  if (existsSync(envFile)) process.loadEnvFile(envFile);

  const url = process.env.DATABASE_URL ?? '';
  if (!url) {
    console.error('error: DATABASE_URL is not set.');
    process.exit(1);
  }
  if (url.includes('_test')) {
    console.error('error: this script runs against the live database, not against a test one.');
    process.exit(1);
  }

  const host = url.slice(url.lastIndexOf('@') + 1).split(':')[0];
  try {
    await dns.lookup(host);
  } catch {
    // The name of the compose network does not resolve from the host, so the
    // database is asked on the loopback of the machine.
    process.env.DATABASE_URL = url.replace(`@${host}:`, '@127.0.0.1:');
  }
}

await loadEnvironment();

const { prisma } = await import(path.join(API_ROOT, 'dist/db.js'));
const { withCustomerKey, probeFor } = await import(path.join(API_ROOT, 'dist/services/provisioning.js'));
const { readFile, writeFile, listFiles } = await import(
  path.join(API_ROOT, 'dist/services/pterodactyl/client.js')
);
const { listAllocations } = await import(path.join(API_ROOT, 'dist/services/pterodactyl/application.js'));
const { starterFiles, planStarterFiles } = await import(path.join(API_ROOT, 'dist/services/starter-apps.js'));

/** The line of the port of a file, so the report shows what changed. */
function portLineOf(content) {
  if (content === null) return '(the file is not in the container)';
  const line = content.match(/^const port = .*$/m);
  return line ? line[0] : '(the file has no line of the port)';
}

const instances = await prisma.instance.findMany({ orderBy: { createdAt: 'asc' } });
let written = 0;
let repaired = 0;
let kept = 0;
let problems = 0;

for (const instance of instances) {
  if (!instance.pterodactylUuid) {
    console.log(`\n=== ${instance.name} (${instance.id}) — no server on the panel, nothing to check.`);
    continue;
  }

  const product = await prisma.product.findUnique({ where: { id: instance.productId } });
  if (!product) {
    console.log(`\n=== ${instance.name} (${instance.id}) — the product of the instance is gone.`);
    problems += 1;
    continue;
  }

  const allocations = await listAllocations(instance.pterodactylNodeId ?? 1);
  const allocation = allocations.find((candidate) => candidate.id === instance.pterodactylAllocation);
  const port = allocation?.port ?? 0;

  console.log(
    `\n=== ${instance.name} (${instance.id}) — server ${instance.pterodactylServerId}, ` +
      `status ${instance.status}, allocation ${instance.pterodactylAllocation}, port ${port || 'none'}`,
  );

  if (!port) {
    console.log('    The panel did not assign an address to this server, so there is no port to write.');
    problems += 1;
    continue;
  }

  const probe = probeFor(product);
  const healthPath = probe.kind === 'http' ? (probe.path ?? '/') : '/';
  const files = starterFiles({ slug: product.slug, name: product.name, healthPath, port });

  try {
    await withCustomerKey(
      instance.userId,
      async (token) => {
        // The listing of the container is what says whether a file is there:
        // the panel answers with an error of the server and not with a "not
        // found" when a file does not exist.
        const names = new Set(
          (await listFiles(token, instance.pterodactylUuid, '/')).map((file) => file.name),
        );

        const existing = new Map();
        for (const file of files) {
          if (!names.has(file.path)) continue;
          const answer = await readFile(token, instance.pterodactylUuid, file.path);
          const content =
            answer.encoding === 'base64'
              ? Buffer.from(answer.content, 'base64').toString('utf-8')
              : answer.content;
          existing.set(file.path, content);
        }

        const plan = planStarterFiles(files, existing);
        for (const entry of plan) {
          const before = portLineOf(existing.get(entry.path) ?? null);
          const after = entry.content === null ? '(left as it is)' : portLineOf(entry.content);
          console.log(`    ${entry.path}: ${entry.action} (platform file: ${entry.platform})`);
          console.log(`        before: ${before}`);
          if (entry.action !== 'keep') console.log(`        after:  ${after}`);

          if (entry.action === 'keep') {
            kept += 1;
            continue;
          }
          if (entry.action === 'write') written += 1;
          else repaired += 1;

          if (EXECUTE) {
            await writeFile(token, instance.pterodactylUuid, entry.path, entry.content);
            console.log('        written.');
          }
        }
      },
      { mint: false },
    );
  } catch (error) {
    console.log(`    the container could not be read: ${error instanceof Error ? error.message : error}`);
    problems += 1;
  }
}

console.log(
  `\n=== summary: ${written} file(s) to write, ${repaired} to repair, ${kept} left as they are, ` +
    `${problems} instance(s) with a problem.`,
);
console.log(EXECUTE ? 'The plan was applied.' : 'Nothing was written. Run it with --execute to apply it.');

await prisma.$disconnect();

// The modules of the platform open connections of their own, so the process
// would stay alive after the work is done.
process.exit(0);

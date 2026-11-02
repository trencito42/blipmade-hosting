#!/usr/bin/env node
/**
 * Opens the products that answered on the node, and closes the ones that did
 * not.
 *
 * The catalog of the platform holds products that the operator has not
 * validated yet. A product is opened for ordering after a server of it was
 * really built and answered on a node, and that answer is what the probe of
 * `scripts/probe-eggs.mjs` measures.
 *
 * The verdict of a probe is read the way the platform checks a deployment:
 *
 *   - the service answers on the port of the allocation with HTTP -> the
 *     default check of the platform is right, and the product is opened;
 *   - the port accepts a connection but the service does not speak HTTP -> the
 *     check of the product becomes a check of the connection, and the product
 *     is opened;
 *   - the container was built and started but nothing answers on the port ->
 *     the product stays closed, because the route of the domain of the
 *     customer points at that port and an application that does not answer
 *     there is served to nobody.
 *
 * Usage (inside the API container, where the database is):
 *
 *   node scripts/open-products.mjs --results /tmp/probe.json
 *   node scripts/open-products.mjs --results /tmp/probe.json --apply
 */

import { PrismaClient } from '@prisma/client';
import { readFileSync } from 'node:fs';
import { readFile } from 'node:fs/promises';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const prisma = new PrismaClient();
const args = process.argv.slice(2);
const apply = args.includes('--apply');
const resultFile = args[args.indexOf('--results') + 1] ?? '/tmp/probe-results.json';

/** The statuses the platform accepts by default. */
const DEFAULT_STATUSES = [200, 201, 204, 301, 302, 307, 308];

/** The operator that runs the script. */
const ACTOR_EMAIL = process.env.PROBE_ACTOR_EMAIL ?? 'admin@blipmade.com';

/**
 * The reason that each product that waits is written down in.
 *
 * It is the same file that the platform reads to answer a customer who asks
 * why a product is not on sale, so the two never say different things. The
 * file is looked for in the repository and in the container of the API, where
 * the path of the environment is the one that is given.
 */
const blockersFile = () => {
  const candidates = [
    process.env.BLOCKERS_FILE,
    join(dirname(fileURLToPath(import.meta.url)), '..', 'api/src/services/product-blockers.json'),
    join(process.cwd(), 'api/src/services/product-blockers.json'),
    join(process.cwd(), 'src/services/product-blockers.json'),
  ].filter(Boolean);
  for (const candidate of candidates) {
    try {
      return JSON.parse(readFileSync(candidate, 'utf8'));
    } catch {
      continue;
    }
  }
  console.log('the file of the reasons was not found; the reasons of the products are the ones of the measurement');
  return {};
};

const documented = blockersFile();

async function main() {
  const results = JSON.parse(await readFile(resultFile, 'utf-8'));
  const known = new Map(results.map((entry) => [entry.slug, entry]));

  const products = await prisma.product.findMany({
    where: { deployable: false },
    orderBy: { slug: 'asc' },
  });

  const opened = [];
  const kept = [];

  /**
   * Keeps a product closed and writes down why it waits.
   *
   * The reason that the operator wrote in the file of the blockers is the one
   * that is kept: it says what is missing for the product to open, and not
   * only what the last measurement failed on. The measurement is written in
   * the journal next to it, so nothing is lost.
   */
  const keep = async (product, reason) => {
    const probe = known.get(product.slug);
    const text = documented[product.slug] ?? reason;
    kept.push({ slug: product.slug, reason: text });
    if (!apply) return;
    await prisma.auditLog.create({
      data: {
        actorEmail: ACTOR_EMAIL,
        action: 'product.updated',
        targetType: 'product',
        targetId: product.id,
        meta: {
          deployable: false,
          reason: text,
          measurement: probe
            ? {
                egg: probe.egg,
                installed: probe.installed,
                started: probe.started,
                portOpen: probe.portOpen,
                httpStatus: probe.httpStatus,
                error: probe.error ? String(probe.error).slice(0, 200) : null,
              }
            : null,
        },
      },
    });
  };

  for (const product of products) {
    const probe = known.get(product.slug);
    if (!probe) {
      await keep(product, 'it was not probed');
      continue;
    }
    if (probe.error) {
      await keep(product, probe.error.slice(0, 160));
      continue;
    }
    if (!probe.installed) {
      await keep(product, 'the node did not build the container');
      continue;
    }
    // A product that does not answer on a TCP port but that the node reports as running is
    // checked on its container: the node only says "running" once the program has said that
    // it is ready. This is how a game with a UDP port is validated.
    if (!probe.portOpen && probe.state === 'running') {
      opened.push({ slug: product.slug, httpStatus: null, healthProbe: { kind: 'container' }, container: true });
      if (apply) {
        await prisma.product.update({ where: { id: product.id }, data: { deployable: true, healthProbe: { kind: 'container' } } });
        await prisma.auditLog.create({
          data: {
            actorEmail: ACTOR_EMAIL,
            action: 'product.updated',
            targetType: 'product',
            targetId: product.id,
            meta: { deployable: true, healthProbe: { kind: 'container' }, probe: { egg: probe.egg, installed: probe.installed, started: probe.started, state: probe.state } },
          },
        });
      }
      continue;
    }
    if (!probe.portOpen) {
      await keep(product, 'the container runs but nothing answers on the port of the allocation');
      continue;
    }

    const status = probe.httpStatus ?? null;
    const healthProbe =
      status === null
        ? { kind: 'tcp' }
        : DEFAULT_STATUSES.includes(status)
          ? null
          : { kind: 'http', path: '/', expectStatus: [...DEFAULT_STATUSES, status] };

    opened.push({ slug: product.slug, httpStatus: status, healthProbe });

    if (!apply) continue;

    await prisma.product.update({
      where: { id: product.id },
      data: {
        deployable: true,
        ...(healthProbe ? { healthProbe } : {}),
      },
    });
    await prisma.auditLog.create({
      data: {
        actorEmail: ACTOR_EMAIL,
        action: 'product.updated',
        targetType: 'product',
        targetId: product.id,
        meta: {
          deployable: true,
          healthProbe,
          probe: {
            egg: probe.egg,
            installed: probe.installed,
            started: probe.started,
            portOpen: probe.portOpen,
            httpStatus: probe.httpStatus,
          },
        },
      },
    });
  }

  console.log(apply ? 'APPLIED' : 'DRY RUN');
  console.log(`opened: ${opened.length}`);
  for (const entry of opened) {
    console.log(`  + ${entry.slug} (${entry.container ? 'container running' : `http ${entry.httpStatus ?? 'tcp'}`})`);
  }
  console.log(`kept closed: ${kept.length}`);
  for (const entry of kept) {
    console.log(`  - ${entry.slug}: ${entry.reason}`);
  }

  // A reason that is written for a product that is on sale is a reason that
  // nobody reads, and it hides the reason of a product that waits. It is
  // named here, so the file stays the truth about the products that wait.
  const closed = new Set(kept.map((entry) => entry.slug));
  const stale = Object.keys(documented).filter((slug) => !closed.has(slug));
  if (stale.length) {
    console.log(`reasons written for products that are not waiting: ${stale.join(', ')}`);
  }

  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

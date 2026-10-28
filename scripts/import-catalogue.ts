#!/usr/bin/env tsx
/**
 * Writes the catalogue of the eggs into the database of the platform.
 *
 * The catalogue is the manifest `pterodactyl-eggs/manifest.json`: it names the
 * products, the egg each of them runs on, the resources, the variables the
 * customer fills at the order and where the product stands in the catalogue.
 *
 * The script is idempotent. A product that is already there is brought back
 * to what the manifest says, except for the flag that opens it for ordering
 * (only a product whose server was really built is opened) and for the price
 * (the price of a server is the price of its resources, and the rate card of
 * the platform is one card for every product).
 *
 * The number of the egg of the panel is read from the panel itself, so the
 * product keeps working when the egg is imported again under another number.
 * A product whose egg the panel does not carry is written all the same, and
 * reported: it cannot be deployed until the egg is imported.
 *
 * Usage, on the host of the platform:
 *
 *     cd api && npx tsx ../scripts/import-catalogue.ts
 *
 * The script writes into the live database of the platform, so it asks for
 * the same permission the seed asks for: ALLOW_PRODUCTION_SEED=true.
 */
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { prisma } from '../api/src/db.js';
import { importCatalogue, parseManifest } from '../api/src/lib/catalogue-import.js';
import { assertSeedTargetIsSafe } from '../api/src/lib/seed-guard.js';
import { DEFAULT_RESOURCE_RATES } from '../api/src/services/pricing.js';

const here = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(here, '..');
const manifestPath = path.join(root, 'pterodactyl-eggs', 'manifest.json');

async function main(): Promise<void> {
  // The guard of the seed: the live database of the platform is only written
  // when the operator says so.
  assertSeedTargetIsSafe();

  const manifest = parseManifest(readFileSync(manifestPath, 'utf8'));
  console.info(`The manifest holds ${manifest.length} products.`);

  // The eggs of the panel, by name. The panel is asked only when it is
  // reachable: without it the products are written with the name of their
  // egg, which is enough for the platform to find the egg later.
  const eggIds = new Map<string, number>();
  const { listNests, listEggs } = await import('../api/src/services/pterodactyl/application.js');
  try {
    for (const nest of await listNests()) {
      for (const egg of await listEggs(nest.id)) {
        eggIds.set(egg.name.trim().toLowerCase(), egg.id);
      }
    }
    console.info(`The panel holds ${eggIds.size} eggs.`);
  } catch (error) {
    console.info(`The panel did not answer: ${(error as Error).message}`);
    console.info('The products are written with the name of their egg.');
  }

  // The card of the resources is one card for the whole platform. It is read
  // from the settings, so the rows of the prices show the card that is really
  // used.
  let rates = DEFAULT_RESOURCE_RATES;
  try {
    const setting = await prisma.setting.findUnique({ where: { key: 'pricing_resources' } });
    const value = setting?.value as Record<string, unknown> | undefined;
    if (value && typeof value === 'object') {
      const read = (name: keyof typeof rates): number => {
        const raw = value[name];
        return typeof raw === 'number' && Number.isInteger(raw) && raw >= 0 ? raw : rates[name];
      };
      rates = { ramPerGb: read('ramPerGb'), cpuPerUnit: read('cpuPerUnit'), diskPerGb: read('diskPerGb') };
    }
  } catch {
    console.info('The card of the platform could not be read; the default one is used.');
  }
  console.info(
    `The rate card of the platform: ${rates.ramPerGb} per GB of memory, ${rates.cpuPerUnit} per vCPU, ${rates.diskPerGb} per GB of disk.`,
  );

  const report = await importCatalogue(prisma, manifest, { rates, eggIds });
  console.info(`Products written: ${report.created.length}.`);
  console.info(`Products brought back to the manifest: ${report.updated.length}.`);
  console.info(`Rows of prices given the card of the platform: ${report.pricesSynced}.`);
  if (report.withoutEgg.length > 0) {
    console.info(`Products whose egg the panel does not carry: ${report.withoutEgg.join(', ')}`);
  }
}

main()
  .catch((error) => {
    console.error(error);
    process.exitCode = 1;
  })
  .finally(async () => {
    await prisma.$disconnect();
  });

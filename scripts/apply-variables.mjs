#!/usr/bin/env node
/**
 * Writes the variables of the manifest into the products of the database.
 *
 * Two fields of a product come from the manifest and are the same for every
 * instance of it: the values the customer fills at the order, and the values
 * the platform makes for it. This script brings only those two fields back to
 * what the manifest says, and leaves everything else alone.
 *
 * Usage (inside the API container, where the database is):
 *
 *   node scripts/apply-variables.mjs
 *   node scripts/apply-variables.mjs --dry
 */

import { PrismaClient } from '@prisma/client';
import { readFile } from 'node:fs/promises';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');
const manifestPath = process.env.MANIFEST ?? 'pterodactyl-eggs/manifest.json';

/**
 * The comparison of two declarations.
 *
 * The database keeps the declarations as JSON, which does not keep the order
 * of the keys. Two declarations that say the same thing are compared by their
 * content, and not by the order of their keys.
 */
function sameDeclaration(left, right) {
  const normalise = (value) =>
    Object.fromEntries(
      Object.entries(value ?? {})
        .sort(([a], [b]) => a.localeCompare(b))
        .map(([key, declaration]) => [
          key,
          Object.fromEntries(
            Object.entries(declaration ?? {}).sort(([a], [b]) => a.localeCompare(b)),
          ),
        ]),
    );
  return JSON.stringify(normalise(left)) === JSON.stringify(normalise(right));
}

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  let written = 0;

  for (const entry of manifest.products) {
    const customerVariables = entry.customerVariables ?? {};
    const generatedVariables = entry.generatedVariables ?? {};
    if (!Object.keys(customerVariables).length && !Object.keys(generatedVariables).length) continue;

    const product = await prisma.product.findUnique({ where: { slug: entry.slug } });
    if (!product) {
      console.log(`  ${entry.slug}: not in the database`);
      continue;
    }

    const same =
      sameDeclaration(product.customerVariables, customerVariables) &&
      sameDeclaration(product.generatedVariables, generatedVariables);
    if (same) continue;

    if (!dry) {
      await prisma.product.update({
        where: { id: product.id },
        data: {
          customerVariables,
          generatedVariables,
        },
      });
    }
    written += 1;
    console.log(`  ${entry.slug}: ${Object.keys(customerVariables).length} from the customer, ${Object.keys(generatedVariables).length} made by the platform`);
  }

  console.log(`${dry ? 'DRY RUN' : 'APPLIED'}: ${written} products written`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

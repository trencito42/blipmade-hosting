#!/usr/bin/env node
/**
 * Writes the descriptions of the manifest into the catalog of the database.
 *
 * The descriptions of the products are customer-facing text. They live in
 * `pterodactyl-eggs/manifest.json` (and, for the products of the platform itself, in the
 * lists below), and this script makes the catalog say the same.
 *
 * It changes only the field `description`, only for a product that already exists, and
 * only when the text differs. It prints what it would do and writes nothing unless it is
 * run with `--apply`.
 *
 * Usage, inside the API container where the database is:
 *
 *   node scripts/apply-product-descriptions.mjs
 *   node scripts/apply-product-descriptions.mjs --apply
 */
import { readFile } from 'node:fs/promises';
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const manifestPath = process.env.MANIFEST ?? 'pterodactyl-eggs/manifest.json';

/** The products that are not in the manifest. */
const EXTRA = {
  wordpress: 'The most widely used publishing platform, for sites, blogs and shops.',
  'code-server': 'Visual Studio Code in your browser, running on the resources you choose.',
  'discord-bot': 'Run a Node.js Discord bot around the clock, without keeping a computer on.',
  'uptime-kuma': 'Monitor websites and services, with status pages you can share.',
  postgresql: 'A PostgreSQL database for your applications, with its own connection details and password.',
  'email-hosting-starter': 'Hosted mail for one domain, with the mailboxes and the aliases a small team needs.',
  'email-hosting-plus': 'Hosted mail for a few domains, with more space and a larger sending limit.',
  'email-hosting-business': 'Hosted mail for a company: more domains, more space and a sending limit that follows the business.',
};

async function main() {
  const manifest = JSON.parse(await readFile(manifestPath, 'utf-8'));
  const wanted = new Map(manifest.products.map((product) => [product.slug, product.description]));
  for (const [slug, text] of Object.entries(EXTRA)) if (!wanted.has(slug)) wanted.set(slug, text);

  let changed = 0;
  let same = 0;
  const missing = [];
  for (const [slug, description] of wanted) {
    const product = await prisma.product.findUnique({ where: { slug }, select: { id: true, description: true } });
    if (!product) {
      missing.push(slug);
      continue;
    }
    if (product.description === description) {
      same += 1;
      continue;
    }
    changed += 1;
    if (apply) await prisma.product.update({ where: { id: product.id }, data: { description } });
  }
  console.log(apply ? 'APPLIED' : 'DRY RUN');
  console.log(`changed: ${changed}, already right: ${same}, not in the catalog: ${missing.length}`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

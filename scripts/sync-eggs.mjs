#!/usr/bin/env node
/**
 * Refreshes the mirror of the eggs of the panel.
 *
 * The platform keeps a copy of the eggs of the panel, so the back office can
 * show what the eggs are without asking the panel for every page. The copy
 * was made when the panel held sixteen eggs, and the panel holds eighty-six
 * now: the copy has to be refreshed, or the back office shows an egg that
 * stopped existing months ago and hides every egg that came after it.
 *
 * The refresh is the one of the back office (Administration → Infrastructure →
 * Synchronize), done without a session of an administrator: the route of the
 * back office needs one, and a script that an operator runs on the server
 * does not.
 *
 * Usage (inside the API container, where the panel key and the database are):
 *
 *   node scripts/sync-eggs.mjs
 *   node scripts/sync-eggs.mjs --dry
 */

import { PrismaClient } from '@prisma/client';

const APP_URL = process.env.PTERODACTYL_URL;
const APP_KEY = process.env.PTERODACTYL_APP_KEY;

if (!APP_URL || !APP_KEY) {
  console.error('Missing PTERODACTYL_URL or PTERODACTYL_APP_KEY.');
  process.exit(2);
}

const MEDIA = 'Application/vnd.pterodactyl.v1+json';
const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');

async function applicationRequest(method, path) {
  const response = await fetch(`${APP_URL}${path}`, {
    method,
    headers: { Authorization: `Bearer ${APP_KEY}`, Accept: MEDIA },
  });
  const text = await response.text();
  if (!response.ok) {
    throw new Error(`panel ${method} ${path} -> ${response.status} ${text.slice(0, 300)}`);
  }
  return text ? JSON.parse(text) : undefined;
}

async function main() {
  const nests = await applicationRequest('GET', '/api/application/nests?per_page=100');

  const eggs = [];
  for (const nest of nests.data) {
    const list = await applicationRequest(
      'GET',
      `/api/application/nests/${nest.attributes.id}/eggs?per_page=200`,
    );
    eggs.push(...list.data.map((item) => item.attributes));
  }

  console.log(`${eggs.length} eggs on the panel`);

  let written = 0;
  for (const egg of eggs) {
    const image = Object.values(egg.docker_images ?? {})[0] ?? '';
    if (dry) {
      console.log(`  would write ${egg.id} ${egg.name}`);
      written += 1;
      continue;
    }
    await prisma.egg.upsert({
      where: { pterodactylId: egg.id },
      create: {
        pterodactylId: egg.id,
        uuid: egg.uuid,
        name: egg.name,
        dockerImage: image,
        startup: egg.startup,
      },
      update: {
        uuid: egg.uuid,
        name: egg.name,
        dockerImage: image,
        startup: egg.startup,
        syncedAt: new Date(),
      },
    });
    written += 1;
  }

  const count = await prisma.egg.count();
  console.log(`${written} eggs written, ${count} eggs in the mirror`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

#!/usr/bin/env node
/**
 * Gives the servers that already exist the number of databases their plan includes
 * (1 up to 2 GB of memory, 2 above), on the panel. New servers get it when they are built.
 *
 * It only changes the limit of databases; every other limit of the server is read back and
 * written as it is. It prints what it would do and writes nothing unless run with --apply.
 *
 * Usage, inside the API container (it copies the file in first, see docs):
 *   node apply-database-limits.mjs
 *   node apply-database-limits.mjs --apply
 */
import { PrismaClient } from '@prisma/client';
import { getServer, updateServerBuild } from '/app/dist/services/pterodactyl/application.js';

const prisma = new PrismaClient();
const apply = process.argv.includes('--apply');
const included = (ram) => (ram >= 4096 ? 2 : 1);

const instances = await prisma.instance.findMany({
  where: { pterodactylServerId: { not: null }, cancelledAt: null },
  select: { id: true, name: true, ram: true, pterodactylServerId: true },
});
let changed = 0;
for (const instance of instances) {
  const want = included(instance.ram);
  try {
    const server = await getServer(instance.pterodactylServerId);
    const have = server.feature_limits.databases;
    if (have >= want) continue;
    console.log(`${instance.name}: databases ${have} -> ${want}${apply ? '' : ' (dry run)'}`);
    if (apply) await updateServerBuild(instance.pterodactylServerId, { feature_limits: { databases: want, backups: server.feature_limits.backups } });
    changed += 1;
  } catch (error) {
    console.log(`${instance.name}: could not be read or changed: ${error.message}`);
  }
}
console.log(`${apply ? 'APPLIED' : 'DRY RUN'}: ${changed} server(s) ${apply ? 'changed' : 'would change'}.`);
await prisma.$disconnect();

#!/usr/bin/env node
/**
 * Gives every instance an address under the base of the platform.
 *
 * A service that was made before the platform gave one away has only the
 * address of the node, which is an address inside the network of the
 * platform: the customer cannot reach it from the internet. This script
 * writes the hostname of the base of the platform for every instance that has
 * none, with the proof of ownership that the platform does not need, because
 * the platform owns the zone.
 *
 * The routes of the hostnames are written by the worker, which looks at the
 * hostnames that were proven every minute.
 *
 * Usage (inside the API container, where the database is):
 *
 *   node scripts/ensure-instance-hostnames.mjs
 *   node scripts/ensure-instance-hostnames.mjs --dry
 */

import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();
const dry = process.argv.includes('--dry');
const base = (process.env.DOMAIN_BASE ?? '').trim();

if (!base) {
  console.error('DOMAIN_BASE is not set: the platform has no base for the addresses of its own.');
  process.exit(2);
}

/**
 * The hostname of an instance under the base of the platform.
 *
 * The same rule as the one of the provisioning: the name of the service is
 * the beginning of the hostname, and the identifier of the instance keeps two
 * services with the same name apart.
 */
function platformHostname(name, instanceId) {
  const label = String(name ?? '')
    .toLowerCase()
    .normalize('NFKD')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 40);
  const suffix = String(instanceId ?? '').replace(/[^a-z0-9]/gi, '').slice(-5).toLowerCase();
  if (!label || !suffix) return null;
  return `${label}-${suffix}.${base}`;
}

async function main() {
  const instances = await prisma.instance.findMany({
    select: {
      id: true,
      name: true,
      status: true,
      pterodactylServerId: true,
      domains: { select: { hostname: true, status: true } },
    },
    orderBy: { createdAt: 'asc' },
  });

  let written = 0;
  for (const instance of instances) {
    const hostname = platformHostname(instance.name, instance.id);
    if (!hostname) {
      console.log(`  ${instance.name}: the name of the service cannot be a hostname`);
      continue;
    }
    const existing = instance.domains.find((domain) => domain.hostname === hostname);
    if (existing) {
      console.log(`  ${instance.name}: ${hostname} is already there (${existing.status})`);
      continue;
    }
    if (!dry) {
      await prisma.instanceDomain.create({
        data: {
          instanceId: instance.id,
          hostname,
          targetPort: 30000,
          status: 'PENDING_DNS',
          verifiedAt: new Date(),
          verificationHost: base,
        },
      });
    }
    written += 1;
    console.log(`  ${instance.name}: ${hostname}`);
  }

  console.log(`${dry ? 'DRY RUN' : 'APPLIED'}: ${written} addresses written`);
  await prisma.$disconnect();
}

main().catch(async (error) => {
  console.error(error);
  await prisma.$disconnect();
  process.exit(1);
});

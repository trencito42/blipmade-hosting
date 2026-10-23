/**
 * Seeds the isolated check stack: the catalog of the platform and the two
 * accounts the sweep signs in with.
 *
 * The script never touches the production database: it refuses to run unless
 * the name of the database ends with "_test" or "_check".
 *
 *   DATABASE_URL=... node seed-check-accounts.mjs
 */

import { PrismaClient } from '@prisma/client';
import { hashPassword } from '/tmp/api-check/dist/lib/password.js';

const prisma = new PrismaClient();

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
if (!/(^|_)(test|check)$/.test(databaseName)) {
  throw new Error(`Refusing to seed "${databaseName || 'an unknown database'}": only a test or check database is allowed.`);
}

const PASSWORD = process.env.QA_PASSWORD ?? 'CorrectHorseBattery9';

const PERMISSIONS = [
  'customers.read', 'customers.write', 'orders.read', 'orders.write', 'services.read', 'services.write',
  'products.read', 'products.write', 'pricing.read', 'pricing.write', 'tickets.read', 'tickets.write',
  'promotions.read', 'promotions.write', 'infrastructure.read', 'infrastructure.write', 'audit.read',
  'staff.read', 'staff.write', 'settings.read', 'settings.write',
];

const PRODUCTS = [
  { slug: 'wordpress', name: 'WordPress', category: 'WEB_CMS', description: 'The most used CMS, ready to deploy.', icon: 'globe', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, maxRam: 8192, maxCpu: 4, maxDisk: 100, baseAmount: 149, deployable: true, eggId: 15, sortOrder: 1 },
  { slug: 'code-server', name: 'code-server', category: 'DEVELOPER_TOOLS', description: 'The editor in the browser, on your own server.', icon: 'code', minRam: 1024, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, maxRam: 16384, maxCpu: 4, maxDisk: 100, baseAmount: 299, deployable: true, eggId: 15, sortOrder: 2 },
  { slug: 'discord-bot', name: 'Discord Bot', category: 'BOTS', description: 'A Node.js service that answers on Discord.', icon: 'bot', minRam: 256, minCpu: 1, minDisk: 1, defaultRam: 512, defaultCpu: 1, defaultDisk: 5, maxRam: 4096, maxCpu: 2, maxDisk: 50, baseAmount: 149, deployable: true, eggId: 15, sortOrder: 3 },
  { slug: 'uptime-kuma', name: 'Uptime Kuma', category: 'MONITORING', description: 'The uptime monitor with the status pages.', icon: 'mon', minRam: 256, minCpu: 1, minDisk: 5, defaultRam: 512, defaultCpu: 1, defaultDisk: 10, maxRam: 4096, maxCpu: 2, maxDisk: 50, baseAmount: 149, deployable: false, eggId: 15, sortOrder: 4 },
  { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASES', description: 'The relational database, on its own server.', icon: 'db', minRam: 1024, minCpu: 1, minDisk: 5, defaultRam: 1024, defaultCpu: 1, defaultDisk: 10, maxRam: 8192, maxCpu: 4, maxDisk: 100, baseAmount: 449, deployable: true, eggId: 15, sortOrder: 5 },
];

for (const product of PRODUCTS) {
  const { baseAmount, ...fields } = product;
  // The price rows are the same for every product. On the update path the old
  // rows are removed first; on the create path "deleteMany" is not a valid
  // argument, so the two paths use two different shapes.
  const priceCreate = [{ period: 'MONTHLY', baseAmount, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR', active: true }];
  const existing = await prisma.product.findUnique({ where: { slug: product.slug } });
  if (existing) {
    await prisma.product.update({ where: { id: existing.id }, data: { ...fields, visible: true, prices: { deleteMany: {}, create: priceCreate } } });
    continue;
  }
  await prisma.product.create({ data: { ...fields, visible: true, prices: { create: priceCreate } } });
}

const passwordHash = await hashPassword(PASSWORD);

const customer = await prisma.user.upsert({
  where: { email: 'qa.check@example.test' },
  update: { passwordHash, emailVerifiedAt: new Date() },
  create: {
    email: 'qa.check@example.test',
    passwordHash,
    role: 'CUSTOMER',
    firstName: 'QA',
    lastName: 'Check',
    emailVerifiedAt: new Date(),
  },
});

const admin = await prisma.user.upsert({
  where: { email: 'admin.check@example.test' },
  update: { passwordHash, emailVerifiedAt: new Date(), role: 'ADMIN' },
  create: {
    email: 'admin.check@example.test',
    passwordHash,
    role: 'ADMIN',
    firstName: 'QA',
    lastName: 'Admin',
    emailVerifiedAt: new Date(),
  },
});

await prisma.staffMember.upsert({
  where: { userId: admin.id },
  update: { permissions: PERMISSIONS },
  create: { userId: admin.id, permissions: PERMISSIONS, title: 'QA' },
});

console.log(`catalog: ${PRODUCTS.length} products`);
console.log(`customer: ${customer.email}`);
console.log(`admin: ${admin.email}`);
await prisma.$disconnect();

/**
 * Puts one instance into the database of the isolated copy.
 *
 * A deployed instance normally comes from an order that was paid for, and
 * the payments are off in the copy, so there is no other way to have one.
 * The row is written into the copy only: the tool refuses to run against a
 * database whose name does not end with "_test".
 *
 * Usage: node audit/_tools/r3-seed-instance.mjs <email> [name]
 */
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const API_DIR = fileURLToPath(new URL('../../api/package.json', import.meta.url));
const require = createRequire(API_DIR);
const { PrismaClient } = require('@prisma/client');

const EMAIL = process.argv[2] ?? 'r3-audit-customer@blipmade.test';
const NAME = process.argv[3] ?? 'r3-audit-instance';

const url = process.env.DATABASE_URL ?? '';
if (!url.endsWith('_test')) {
  console.error('The database name must end with _test. Refusing to run.');
  process.exit(2);
}

const prisma = new PrismaClient();

const user = await prisma.user.findUnique({ where: { email: EMAIL } });
if (!user) {
  console.error(`No customer with the address ${EMAIL} was found in the copy.`);
  await prisma.$disconnect();
  process.exit(1);
}

const product = await prisma.product.findFirst({ orderBy: { createdAt: 'asc' } });
if (!product) {
  console.error('The catalog of the copy is empty.');
  await prisma.$disconnect();
  process.exit(1);
}

const existing = await prisma.instance.findFirst({ where: { userId: user.id, name: NAME } });
const instance = existing ?? await prisma.instance.create({
  data: {
    userId: user.id,
    productId: product.id,
    name: NAME,
    status: 'ONLINE',
    // The id of a server of the panel. The panel is not reachable from the
    // copy, so the platform uses its fallback address.
    pterodactylServerId: 4242,
    ram: product.defaultRam,
    cpu: product.defaultCpu,
    disk: product.defaultDisk,
    price: 0,
    currency: 'EUR',
  },
});

console.log(`  instance   : ${instance.id}`);
console.log(`  customer   : ${instance.userId}`);
console.log(`  product    : ${product.slug}`);
console.log(`  panel id   : ${instance.pterodactylServerId}`);
await prisma.$disconnect();

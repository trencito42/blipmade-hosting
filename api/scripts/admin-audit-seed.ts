/**
 * Seeds a disposable database for the browser audit of the back office.
 *
 * It refuses to run against anything that does not look disposable, because it creates an
 * administrator with a known password. It writes the ids it created to the file in AUDIT_SEED_OUT,
 * so the browser tests can open the detail screens.
 */
import { writeFileSync } from 'node:fs';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';

const url = process.env.DATABASE_URL ?? '';
if (!/@(127\.0\.0\.1|localhost):\d+\/[^/]*(test|audit)[^/]*$/.test(url)) {
  throw new Error('Refusing to seed: DATABASE_URL must be a local database whose name contains "test" or "audit".');
}

const PASSWORD = process.env.AUDIT_ADMIN_PASSWORD ?? 'Audit-Passw0rd!-2026';
const hash = await hashPassword(PASSWORD);

const admin = await prisma.user.create({
  data: { email: 'admin@audit.test', passwordHash: hash, role: 'ADMIN', firstName: 'Audit', lastName: 'Admin', emailVerifiedAt: new Date() },
});
await prisma.staffMember.create({ data: { userId: admin.id, permissions: [] } });

const customer = await prisma.user.create({
  data: {
    email: 'customer@audit.test', passwordHash: hash, role: 'CUSTOMER', firstName: 'Ana', lastName: 'Ionescu', emailVerifiedAt: new Date(),
    pterodactylUserId: '77', pterodactylExternalId: 'audit-customer-77',
  },
});

await prisma.egg.create({ data: { pterodactylId: 5, uuid: 'egg-5', name: 'Node bot', dockerImage: 'node:22', startup: 'node index.js' } });
const product = await prisma.product.create({
  data: {
    slug: 'audit-bot', name: 'Audit bot', category: 'BOTS', description: 'A bot product for the browser audit.', icon: 'bot',
    eggId: 5, minRam: 512, defaultRam: 512, maxRam: 4096, minCpu: 1, defaultCpu: 1, maxCpu: 2, minDisk: 5, defaultDisk: 5, maxDisk: 50,
    visible: true, deployable: true,
    prices: { create: { period: 'MONTHLY', baseAmount: 300, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' } },
  } as never,
});
const instance = await prisma.instance.create({
  data: { userId: customer.id, productId: product.id, name: 'audit-live', status: 'ONLINE', pterodactylServerId: 900, pterodactylUuid: 'audit-uuid', ram: 1024, cpu: 1, disk: 10, price: 300 },
});
const order = await prisma.order.create({ data: { number: 'ORD-AUDIT-1', userId: customer.id, status: 'PAID', total: 300, currency: 'EUR', paidAt: new Date() } });
await prisma.subscription.create({
  data: { userId: customer.id, instanceId: instance.id, status: 'ACTIVE', amount: 300, currency: 'EUR', currentPeriodStart: new Date(), currentPeriodEnd: new Date(Date.now() + 30 * 86_400_000) },
});
await prisma.invoice.create({
  data: { number: 'INV-AUDIT-1', userId: customer.id, orderId: order.id, status: 'OPEN', amount: 300, total: 300, currency: 'EUR' },
});
const ticket = await prisma.ticket.create({ data: { userId: customer.id, subject: 'Audit ticket', instanceId: instance.id } });
const promotion = await prisma.promotion.create({ data: { code: 'AUDIT10', type: 'PERCENT', value: 10 } });

const ids = { adminEmail: admin.email, password: PASSWORD, customerId: customer.id, instanceId: instance.id, orderId: order.id, ticketId: ticket.id, promotionId: promotion.id, productId: product.id };
writeFileSync(process.env.AUDIT_SEED_OUT ?? 'admin-audit-seed.json', JSON.stringify(ids));
console.log('seeded', Object.keys(ids).join(','));
await prisma.$disconnect();

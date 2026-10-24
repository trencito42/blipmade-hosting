/**
 * Extends the seed of the customer-journey stack.
 * Adds the promotion shapes the campaign-limit checks need:
 *   CJFREE100  100% PERCENT, no cap, no per-user cap -> a free order, so the
 *              real provisioning path can be walked end to end.
 *   CJTEST10   10% PERCENT, maxRedemptions 3, maxPerUser 1 (the seeded one).
 *   CJONCE     50% PERCENT, maxPerUser 1 -> the per-account limit alone.
 *   CJTHREE    50% PERCENT, maxRedemptions 3, maxPerUser null -> the global cap alone.
 * Refuses to run against a database whose name does not end in "_test".
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
if (!/(^|_)(test|check)$/.test(databaseName)) {
  throw new Error(`Refusing to seed "${databaseName}": only a test database is allowed.`);
}

const PROMOTIONS = [
  { code: 'CJFREE100', type: 'PERCENT', value: 10000, maxRedemptions: null, maxPerUser: null },
  { code: 'CJTEST10', type: 'PERCENT', value: 1000, maxRedemptions: 3, maxPerUser: 1 },
  { code: 'CJONCE', type: 'PERCENT', value: 5000, maxRedemptions: null, maxPerUser: 1 },
  { code: 'CJTHREE', type: 'PERCENT', value: 5000, maxRedemptions: 3, maxPerUser: null },
];

for (const p of PROMOTIONS) {
  const data = { ...p, active: true, startsAt: new Date(Date.now() - 86400000) };
  const existing = await prisma.promotion.findUnique({ where: { code: p.code } });
  if (existing) {
    // The slots of the campaign are reset too, so the test of the caps starts
    // from a known state and the numbers in the report can be checked.
    await prisma.promotionRedemption.deleteMany({ where: { promotionId: existing.id } });
    await prisma.promotion.update({ where: { id: existing.id }, data: { ...data, usedCount: 0 } });
  } else {
    await prisma.promotion.create({ data });
  }
}

const all = await prisma.promotion.findMany({
  where: { code: { in: PROMOTIONS.map((p) => p.code) } },
  orderBy: { code: 'asc' },
});
for (const p of all) {
  const redemptions = await prisma.promotionRedemption.count({ where: { promotionId: p.id } });
  console.log(
    `${p.code}: type=${p.type} value=${p.value} maxRedemptions=${p.maxRedemptions} maxPerUser=${p.maxPerUser} active=${p.active} usedCount=${p.usedCount} redemptions=${redemptions}`,
  );
}
await prisma.$disconnect();

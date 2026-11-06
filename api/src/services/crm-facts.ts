import { prisma } from '../db.js';
import { FACT_REGISTRY, matchesSegment, spendBand, type FactClass, type SegmentFilter } from './crm.js';

const STALE_MS = 24 * 60 * 60 * 1000;

export async function deriveCustomerFacts(userId: string): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      createdAt: true,
      emailVerifiedAt: true,
      suspendedAt: true,
      tags: true,
      notificationPreference: { select: { marketing: true, marketingOptInAt: true } },
      discordCommunityLinks: { select: { id: true }, take: 1 },
      connectedIdentities: { select: { id: true }, take: 1 },
      tickets: { where: { status: { not: 'CLOSED' } }, select: { id: true }, take: 1 },
      instances: { select: { status: true, product: { select: { slug: true } } }, take: 20 },
    },
  });
  if (!user) return;
  const [spent, paidOrders] = await Promise.all([
    prisma.payment.aggregate({ where: { userId, status: 'SUCCEEDED' }, _sum: { amount: true } }),
    prisma.order.count({ where: { userId, status: { in: ['PAID', 'FULFILLED'] } } }),
  ]);
  const cents = spent._sum.amount ?? 0;
  const active = user.instances.some((row) => row.status === 'ONLINE' || row.status === 'RESTARTING');
  const lifecycle = user.suspendedAt ? 'suspended' : paidOrders === 0 ? 'lead' : active ? 'active' : 'churned';
  const family = user.instances[0]?.product.slug ?? '';
  const staleAt = new Date(Date.now() + STALE_MS);
  const rows: { key: string; value: string; numeric?: number; occurredAt?: Date; source: string; classification: FactClass }[] = [
    { key: 'core.lifecycle', value: lifecycle, source: 'account', classification: 'general' },
    { key: 'core.plan_family', value: family || 'none', source: 'catalog', classification: 'general' },
    { key: 'billing.spend_cents', value: String(cents), numeric: cents, source: 'billing', classification: 'general' },
    { key: 'billing.spend_band', value: spendBand(cents), source: 'billing', classification: 'general' },
    { key: 'billing.paid_orders', value: String(paidOrders), numeric: paidOrders, source: 'billing', classification: 'general' },
    { key: 'support.open', value: user.tickets.length ? 'yes' : 'no', source: 'tickets', classification: 'general' },
    { key: 'consent.marketing', value: user.notificationPreference?.marketing ? 'opt_in' : 'opt_out', source: 'consent', classification: 'consent' },
    { key: 'identity.discord', value: user.discordCommunityLinks.length ? 'linked' : 'none', source: 'discord', classification: 'identity' },
    { key: 'identity.oauth', value: user.connectedIdentities.length ? 'linked' : 'none', source: 'oauth', classification: 'identity' },
    { key: 'account.verified', value: user.emailVerifiedAt ? 'yes' : 'no', source: 'account', classification: 'general' },
    { key: 'account.created_at', value: user.createdAt.toISOString(), occurredAt: user.createdAt, source: 'account', classification: 'general' },
  ];
  for (const row of rows) {
    if (!FACT_REGISTRY[row.key]) continue;
    await prisma.customerFact.upsert({
      where: { userId_key: { userId, key: row.key } },
      create: {
        userId,
        key: row.key,
        value: row.value,
        numericValue: row.numeric ?? null,
        occurredAt: row.occurredAt ?? null,
        source: row.source,
        classification: row.classification,
        provenance: 'derive',
        staleAt,
        version: 1,
      },
      update: {
        value: row.value,
        numericValue: row.numeric ?? null,
        occurredAt: row.occurredAt ?? null,
        source: row.source,
        classification: row.classification,
        provenance: 'derive',
        staleAt,
        version: { increment: 1 },
      },
    });
  }
}

export async function customerInSegment(userId: string, segmentId: string): Promise<boolean> {
  const segment = await prisma.customerSegment.findUnique({ where: { id: segmentId } });
  if (!segment) return false;
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: { id: true, tags: true, createdAt: true, notificationPreference: { select: { marketing: true } }, customerFacts: true },
  });
  if (!user) return false;
  return matchesSegment(
    {
      facts: Object.fromEntries(user.customerFacts.map((row) => [row.key, row.value])),
      tags: user.tags,
      marketing: user.notificationPreference?.marketing ?? false,
      createdAt: user.createdAt,
      userId: user.id,
    },
    segment.filter as SegmentFilter,
  );
}

export async function recomputeFactsPage(take = 200, cursor?: string): Promise<{ next: string | null; count: number }> {
  const users = await prisma.user.findMany({
    where: { role: 'CUSTOMER' },
    orderBy: { id: 'asc' },
    take,
    ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
    select: { id: true },
  });
  for (const user of users) await deriveCustomerFacts(user.id);
  return { count: users.length, next: users.at(-1)?.id ?? null };
}

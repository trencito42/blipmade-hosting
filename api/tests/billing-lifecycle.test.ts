import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The lifecycle of the money: a renewal that is paid for, a resource change
 * that is paid for, an invoice that arrives before its order and a service
 * that is cancelled.
 */
vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => false),
  clientToken: vi.fn(() => 'test-client-token'),
  sendPower: vi.fn(async () => undefined),
  sendCommand: vi.fn(async () => undefined),
}));

vi.mock('../src/services/pterodactyl/application.js', () => ({
  deleteServer: vi.fn(async () => undefined),
}));

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
const {
  confirmLocalCollection,
  createLocalRenewal,
  instanceRetention,
  processCancelledInstances,
  reconcileInstancePrices,
  reconcileInvoicesWithProvider,
  sweepSubscriptions,
} = await import('../src/services/billing.js');
const { applyUpgradeOrder, createUpgradeOrder, quoteResourceChange } = await import('../src/services/upgrades.js');
const { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } = await import('./helpers.js');

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

const INTERNAL = { headers: { 'x-internal-token': env.internalToken } };

/**
 * A product with a monthly and a yearly price, and a rate card that makes the
 * price of a configuration different from the price of the product.
 */
async function seedProduct(slug = 'wordpress') {
  return prisma.product.create({
    data: {
      slug,
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: {
        create: [
          { period: 'MONTHLY', baseAmount: 100, ramPerGb: 200, cpuPerUnit: 300, diskPerGb: 100, currency: 'EUR' },
          { period: 'YEARLY', baseAmount: 1000, ramPerGb: 2000, cpuPerUnit: 3000, diskPerGb: 1000, currency: 'EUR' },
        ],
      },
    },
  });
}

async function seedService(options: {
  email: string;
  ram?: number;
  cpu?: number;
  disk?: number;
  price?: number;
  serverId?: number | null;
  periodEndedDaysAgo?: number;
  cancelAtPeriodEnd?: boolean;
}) {
  const { client, userId } = await registerAndLogin(app, options.email);
  const product = await seedProduct(`product-${options.email}`);
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'service',
      status: 'ONLINE',
      ram: options.ram ?? 1024,
      cpu: options.cpu ?? 1,
      disk: options.disk ?? 10,
      price: options.price ?? 149,
      currency: 'EUR',
      pterodactylServerId: options.serverId ?? null,
    },
    include: { product: true },
  });
  const endedAt = new Date(Date.now() - (options.periodEndedDaysAgo ?? 1) * 24 * 60 * 60 * 1000);
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      instanceId: instance.id,
      status: 'ACTIVE',
      amount: 149,
      currency: 'EUR',
      currentPeriodStart: new Date(endedAt.getTime() - 30 * 24 * 60 * 60 * 1000),
      currentPeriodEnd: endedAt,
      cancelAtPeriodEnd: options.cancelAtPeriodEnd ?? false,
    },
  });
  return { client, userId, product, instance, subscription };
}

describe('resource changes are only applied when they are paid for', () => {
  it('refuses a change whose order was not paid', async () => {
    const { userId, instance, subscription } = await seedService({ email: 'unpaid@example.com' });
    const user = { id: userId, email: 'unpaid@example.com' };

    const request = { ram: 2048, cpu: 2, disk: 20 };
    const quote = await quoteResourceChange(instance, request);
    const order = await createUpgradeOrder(instance, request, quote, user);
    expect(order.status).toBe('PENDING');

    const result = await applyUpgradeOrder(order.id);

    expect(result.applied).toBe(false);
    expect(result.reason).toBeTruthy();

    // The service keeps the resources it had.
    const unchanged = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(unchanged?.ram).toBe(1024);
    expect(unchanged?.cpu).toBe(1);
    expect(unchanged?.disk).toBe(10);

    const refusal = await prisma.auditLog.findFirst({ where: { action: 'instance.upgrade_refused' } });
    expect(refusal).toBeTruthy();
    expect(refusal?.targetId).toBe(order.id);

    const stillActive = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(stillActive?.amount).toBe(149);
  });

  it('applies a change whose order was paid', async () => {
    const { userId, instance } = await seedService({ email: 'paid@example.com' });
    const user = { id: userId, email: 'paid@example.com' };

    const request = { ram: 2048, cpu: 2, disk: 20 };
    const quote = await quoteResourceChange(instance, request);
    const order = await createUpgradeOrder(instance, request, quote, user);
    await prisma.order.update({ where: { id: order.id }, data: { status: 'PAID', paidAt: new Date() } });

    const result = await applyUpgradeOrder(order.id);

    expect(result.applied).toBe(true);
    expect(result.reason).toBeNull();

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.ram).toBe(2048);
    expect(updated?.cpu).toBe(2);
    expect(updated?.disk).toBe(20);

    const applied = await prisma.auditLog.findFirst({ where: { action: 'instance.upgrade_applied' } });
    expect(applied).toBeTruthy();
  });
});

describe('a renewal is only a renewal when the money is collected', () => {
  it('writes no paid invoice when no payment provider is configured', async () => {
    const { subscription } = await seedService({ email: 'renewal@example.com', periodEndedDaysAgo: 1 });

    const result = await sweepSubscriptions();

    // Nothing was renewed, because nobody paid.
    expect(result.renewed).toBe(0);
    expect(result.pending).toBe(1);

    const invoices = await prisma.invoice.findMany({ where: { userId: subscription.userId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe('OPEN');
    expect(invoices.every((invoice) => invoice.status !== 'PAID')).toBe(true);
    expect(invoices.every((invoice) => invoice.paidAt === null)).toBe(true);

    // The period is not extended and the subscription waits for a payment.
    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updated?.status).toBe('PAST_DUE');
    expect(updated?.currentPeriodEnd?.getTime()).toBe(subscription.currentPeriodEnd?.getTime());
  });

  it('writes one invoice per period when the sweep runs twice', async () => {
    const { subscription } = await seedService({ email: 'twice@example.com', periodEndedDaysAgo: 1 });

    await sweepSubscriptions();
    await sweepSubscriptions();

    const invoices = await prisma.invoice.findMany({ where: { userId: subscription.userId } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe('OPEN');
  });

  it('writes the invoices the provider confirmed when the invoices are reconciled', async () => {
    const { subscription } = await seedService({ email: 'reconcile@example.com' });
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { stripeSubscriptionId: 'sub_reconcile' },
    });
    await prisma.webhookEvent.create({
      data: {
        provider: 'stripe',
        eventId: 'evt_reconcile',
        type: 'invoice.paid',
        status: 'processed',
        payload: {
          id: 'in_reconcile',
          subscription: 'sub_reconcile',
          amount_paid: 149,
          currency: 'eur',
        } as never,
      },
    });

    const first = await reconcileInvoicesWithProvider();
    expect(first.paid).toBe(1);

    const invoices = await prisma.invoice.findMany({ where: { stripeInvoiceId: 'in_reconcile' } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe('PAID');
    expect(invoices[0]?.amount).toBe(149);

    // The reconciliation is safe to run again.
    const second = await reconcileInvoicesWithProvider();
    expect(second.paid).toBe(0);
    expect(await prisma.invoice.count({ where: { stripeInvoiceId: 'in_reconcile' } })).toBe(1);
  });
});

describe('an invoice that arrives before its order is not lost', () => {
  it('defers the invoice and applies it when the order arrives', async () => {
    await seedProduct('wordpress');
    const { client } = await registerAndLogin(app, 'early@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order.id as string;
    const total = orderResponse.body.order.total as number;

    const webhook = makeClient(app);

    // The invoice of the subscription arrives before the checkout of the
    // order, so the platform does not know the subscription yet.
    const early = await webhook.request('POST', '/api/webhooks/stripe', {
      id: 'evt_early_invoice',
      type: 'invoice.paid',
      data: {
        object: {
          id: 'in_early',
          subscription: 'sub_early',
          customer: 'cus_early',
          amount_paid: total,
          currency: 'eur',
        },
      },
    });
    expect(early.status).toBe(200);
    expect(early.body.deferred).toBe(true);

    const deferred = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_early_invoice' } },
    });
    expect(deferred?.status).toBe('deferred');
    expect(deferred?.attempts).toBe(1);

    // The money was collected, but no invoice was written yet.
    expect(await prisma.invoice.count()).toBe(0);

    // The checkout of the order arrives and creates the subscription.
    const checkout = await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      {
        id: 'evt_late_checkout',
        type: 'checkout.session.completed',
        orderId,
        subscriptionId: 'sub_early',
        customerId: 'cus_early',
        amount: total,
      },
      INTERNAL,
    );
    expect(checkout.status).toBe(200);

    // The deferred event is tried again and the invoice is written.
    const replay = await webhook.request('POST', '/api/webhooks/stripe/replay', { eventId: 'evt_early_invoice' }, INTERNAL);
    expect(replay.status).toBe(200);

    const invoices = await prisma.invoice.findMany({ where: { stripeInvoiceId: 'in_early' } });
    expect(invoices).toHaveLength(1);
    expect(invoices[0]?.status).toBe('PAID');
    expect(invoices[0]?.amount).toBe(total);

    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_early_invoice' } },
    });
    expect(event?.status).toBe('processed');
  });

  it('does not try an event that can never be applied forever', async () => {
    await prisma.webhookEvent.create({
      data: {
        provider: 'stripe',
        eventId: 'evt_impossible',
        type: 'invoice.paid',
        status: 'deferred',
        attempts: 12,
        payload: { id: 'in_impossible', subscription: 'sub_missing' } as never,
      },
    });

    const webhook = makeClient(app);
    const response = await webhook.request('POST', '/api/webhooks/stripe', {
      id: 'evt_impossible',
      type: 'invoice.paid',
      data: { object: { id: 'in_impossible', subscription: 'sub_missing', amount_paid: 100 } },
    });

    // The event is left for an operator instead of being tried again.
    expect(response.status).toBe(200);
    const event = await prisma.webhookEvent.findUnique({
      where: { provider_eventId: { provider: 'stripe', eventId: 'evt_impossible' } },
    });
    expect(event?.status).toBe('deferred');
    expect(event?.attempts).toBe(12);
  });
});

describe('a cancelled order is never fulfilled', () => {
  it('creates no service and gives the campaign slot back', async () => {
    await seedProduct('wordpress');
    const promotion = await prisma.promotion.create({
      data: { code: 'SAVE10', type: 'PERCENT', value: 1000, maxRedemptions: 1 },
    });
    const { client } = await registerAndLogin(app, 'cancelled@example.com');

    const orderResponse = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      promotionCode: 'SAVE10',
    });
    expect(orderResponse.status).toBe(201);
    const orderId = orderResponse.body.order.id as string;
    const total = orderResponse.body.order.total as number;

    // The order is cancelled and the campaign slot was already taken by it.
    await prisma.order.update({
      where: { id: orderId },
      data: { status: 'CANCELLED', promotionRedeemedAt: new Date() },
    });
    await prisma.promotion.update({ where: { id: promotion.id }, data: { usedCount: 1 } });

    const webhook = makeClient(app);
    const response = await webhook.request(
      'POST',
      '/api/webhooks/stripe/test',
      {
        id: 'evt_cancelled_order',
        type: 'checkout.session.completed',
        orderId,
        subscriptionId: 'sub_cancelled',
        amount: total,
      },
      INTERNAL,
    );
    expect(response.status).toBe(200);

    // Nothing was created for the cancelled order.
    expect(await prisma.instance.count({ where: { orderId } })).toBe(0);
    expect(await prisma.subscription.count({ where: { orderItem: { orderId } } })).toBe(0);

    // The campaign slot is back in the pool.
    expect(await prisma.promotionRedemption.count({ where: { orderId } })).toBe(0);
    const updatedPromotion = await prisma.promotion.findUnique({ where: { id: promotion.id } });
    expect(updatedPromotion?.usedCount).toBe(0);

    const order = await prisma.order.findUnique({ where: { id: orderId } });
    expect(order?.status).toBe('CANCELLED');
    expect(order?.promotionRedeemedAt).toBeNull();

    // The money that arrived for the cancelled order is written down.
    const journal = await prisma.auditLog.findFirst({
      where: { action: { in: ['order.cancelled_payment_received', 'order.cancelled_payment_refunded'] } },
    });
    expect(journal).toBeTruthy();
    expect(journal?.targetId).toBe(orderId);
  });
});

describe('the yearly interval', () => {
  it('quotes a yearly plan with the yearly prices', async () => {
    await seedProduct('wordpress');
    const { client } = await registerAndLogin(app, 'yearly@example.com');

    const response = await client.request('POST', '/api/billing/quote', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
      period: 'YEARLY',
    });

    expect(response.status).toBe(200);
    expect(response.body.period).toBe('YEARLY');
    // The price of the resources of the configuration, for the twelve months
    // of the year: one gigabyte of memory, one processor and ten gigabytes of
    // disk, at the rate card of the platform.
    expect(response.body.total).toBe(3000);
    expect(response.body.items[0].unitAmount).toBe(3000);
  });

  it('renews a yearly subscription for twelve months', async () => {
    const { subscription } = await seedService({ email: 'yearly-renewal@example.com' });

    const renewal = await createLocalRenewal(subscription.id, { interval: 'YEARLY' });

    expect(renewal.interval).toBe('YEARLY');
    const months =
      (renewal.periodEnd.getUTCFullYear() - renewal.periodStart.getUTCFullYear()) * 12 +
      (renewal.periodEnd.getUTCMonth() - renewal.periodStart.getUTCMonth());
    expect(months).toBe(12);

    // The invoice is open: nobody paid it yet.
    const invoice = await prisma.invoice.findUnique({ where: { id: renewal.invoiceId } });
    expect(invoice?.status).toBe('OPEN');
    expect(invoice?.paidAt).toBeNull();

    // The period only moves when the collection is confirmed.
    const collected = await confirmLocalCollection(renewal.invoiceId, { reference: 'transfer-42' });
    expect(collected.status).toBe('PAID');

    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updated?.status).toBe('ACTIVE');
    expect(updated?.currentPeriodEnd?.getTime()).toBe(renewal.periodEnd.getTime());

    const journal = await prisma.auditLog.findFirst({ where: { action: 'invoice.collected' } });
    expect(journal).toBeTruthy();
    expect((journal?.meta as { reference?: string })?.reference).toBe('transfer-42');
  });

  it('does not extend the period twice when the collection is confirmed twice', async () => {
    const { subscription } = await seedService({ email: 'twice-collected@example.com' });

    const renewal = await createLocalRenewal(subscription.id, { interval: 'YEARLY' });
    await confirmLocalCollection(renewal.invoiceId, { reference: 'transfer-1' });
    await confirmLocalCollection(renewal.invoiceId, { reference: 'transfer-1' });

    const updated = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updated?.currentPeriodEnd?.getTime()).toBe(renewal.periodEnd.getTime());
  });
});

describe('a cancelled service is kept for a term and exported', () => {
  it('marks the service for deletion and exports the data of the customer', async () => {
    await prisma.setting.create({
      data: { key: 'auto_delete_cancelled_instances', value: { enabled: true, retentionDays: 7 } as never },
    });
    const { client, instance, subscription } = await seedService({
      email: 'retention@example.com',
      cancelAtPeriodEnd: true,
      serverId: 1,
    });

    const result = await sweepSubscriptions();
    expect(result.withdrawn).toBe(1);

    const cancelled = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(cancelled?.status).toBe('CANCELLED');
    expect(cancelled?.cancelledAt).toBeTruthy();

    const retention = await instanceRetention(instance.id);
    expect(retention).toBeTruthy();
    expect(retention?.retentionDays).toBe(7);
    expect(retention?.deletedAt).toBeNull();

    // The term ends seven days after the cancellation.
    const term = new Date(retention!.scheduledFor).getTime() - new Date(retention!.cancelledAt).getTime();
    expect(Math.round(term / (24 * 60 * 60 * 1000))).toBe(7);

    // The export of the customer exists before anything is deleted.
    expect(retention?.export).toBeTruthy();
    expect((retention?.export as { instance?: { id?: string } }).instance?.id).toBe(instance.id);

    const exportResponse = await client.request('GET', `/api/billing/instances/${instance.id}/export`);
    expect(exportResponse.status).toBe(200);
    expect(exportResponse.body.export.instance.id).toBe(instance.id);
    expect(exportResponse.body.deletionScheduledFor).toBe(retention?.scheduledFor);

    // The server stays on the node until the term is over.
    const { deleteServer } = await import('../src/services/pterodactyl/application.js');
    expect(deleteServer).not.toHaveBeenCalled();

    // The term is over: the server is deleted and the export stays.
    const setting = await prisma.setting.findUnique({ where: { key: 'cancelled_instance_retention' } });
    const records = setting?.value as unknown as Record<string, { scheduledFor: string }>;
    records[instance.id].scheduledFor = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
    await prisma.setting.update({
      where: { key: 'cancelled_instance_retention' },
      data: { value: records as never },
    });

    const deletion = await processCancelledInstances();
    expect(deletion.deleted).toBe(1);
    expect(deleteServer).toHaveBeenCalledWith(1);

    const afterDeletion = await instanceRetention(instance.id);
    expect(afterDeletion?.deletedAt).toBeTruthy();
    expect(afterDeletion?.export).toBeTruthy();

    const summary = await client.request('GET', '/api/billing/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.cancellations[0].id).toBe(instance.id);
    expect(summary.body.cancellations[0].exportAvailable).toBe(true);

    const updatedSubscription = await prisma.subscription.findUnique({ where: { id: subscription.id } });
    expect(updatedSubscription?.status).toBe('CANCELLED');
  });
});

describe('the price of a service is the price of its configuration', () => {
  it('corrects the price of an imported service and writes the difference to the journal', async () => {
    const { client, instance } = await seedService({
      email: 'reconcile-price@example.com',
      ram: 2048,
      cpu: 2,
      disk: 20,
      price: 100,
    });

    // The import wrote the price of the product instead of the price of the
    // configuration: 200 (memory) + 100 (cpu) + 200 (disk).
    const result = await reconcileInstancePrices();
    expect(result.checked).toBe(1);
    expect(result.corrected).toBe(1);
    expect(result.differences[0]?.previousPrice).toBe(100);
    expect(result.differences[0]?.price).toBe(500);

    const updated = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(updated?.price).toBe(500);

    const journal = await prisma.auditLog.findFirst({ where: { action: 'instance.price_reconciled' } });
    expect(journal).toBeTruthy();
    expect((journal?.meta as { delta?: number })?.delta).toBe(400);

    // The estimate of the panel is the price of the configuration.
    const summary = await client.request('GET', '/api/billing/summary');
    expect(summary.status).toBe(200);
    expect(summary.body.monthlyEstimate).toBe(500);

    // The reconciliation is safe to run again.
    const second = await reconcileInstancePrices();
    expect(second.corrected).toBe(0);
  });
});

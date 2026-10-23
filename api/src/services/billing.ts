import { prisma } from '../db.js';
import { nextInvoiceNumber, nextOrderNumber } from './order-numbers.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { normalizeAmount } from '../lib/money.js';
import * as client from './pterodactyl/client.js';
import { resolveCustomerCredential } from './panel/credentials.js';
import { stripeLive, upsertInvoice } from './stripe.js';
import { loadOptions, priceConfiguration } from './pricing.js';
import type { BillingPeriod } from '@prisma/client';

/**
 * The billing sweep.
 *
 * It runs on a schedule and does three things:
 *
 *   1. a subscription that was cancelled for the end of the period is
 *      withdrawn once the period is over;
 *   2. a subscription that was not paid is suspended after a grace period;
 *   3. a subscription that is due is renewed.
 *
 * Every action is recorded, so the operator can see what happened without
 * reading the logs.
 *
 * A renewal is only a renewal when the money is collected. When no payment
 * provider is configured, the sweep writes the invoice that is due and marks
 * the subscription for manual action: it never writes an invoice that says
 * "paid" for money that nobody paid.
 */

/** How many days a customer has to pay before the service is suspended. */
const GRACE_PERIOD_DAYS = 7;

/** How many months a year has. */
const MONTHS_IN_YEAR = 12;

/**
 * How long a cancelled service is kept before it is deleted. The term is a
 * setting, so the operator decides it; this is the term that is used when the
 * setting does not name one.
 */
const DEFAULT_RETENTION_DAYS = 30;

/**
 * Where the retention of the cancelled services is written down.
 *
 * The retention needs a place of its own: an instance that was cancelled is
 * kept for a term, and the export of the customer data has to survive the
 * deletion of the service.
 */
const RETENTION_SETTING_KEY = 'cancelled_instance_retention';

/** The interval a subscription is billed on. */
export type BillingInterval = 'MONTHLY' | 'YEARLY';

/**
 * Adds months to a date, on the calendar.
 *
 * The last day of a month is clamped, so the end of a period never moves to
 * the second month when the period starts on the 31st.
 */
export function addMonths(date: Date, months: number): Date {
  const result = new Date(date.getTime());
  const day = result.getDate();
  result.setDate(1);
  result.setMonth(result.getMonth() + months);
  const lastDay = new Date(result.getFullYear(), result.getMonth() + 1, 0).getDate();
  result.setDate(Math.min(day, lastDay));
  return result;
}

/** Adds days to a date. */
export function addDays(date: Date, days: number): Date {
  return new Date(date.getTime() + days * 24 * 60 * 60 * 1000);
}

/** The number of months a period covers. */
export function monthsOfInterval(interval: BillingInterval): number {
  return interval === 'YEARLY' ? MONTHS_IN_YEAR : 1;
}

/**
 * The price of a configuration, computed with the function that prices an
 * order.
 *
 * A price never means two things: what the customer is quoted and what the
 * platform stores are the same number. The options of the configuration are
 * part of it, so a service that was ordered with options is priced with them.
 */
export async function configurationPrice(
  product: { id: string; minRam: number; minCpu: number; minDisk: number },
  config: { ram: number; cpu: number; disk: number },
  period: BillingPeriod = 'MONTHLY',
  optionCodes: string[] = [],
): Promise<number | null> {
  const price = await prisma.productPrice.findFirst({
    where: { productId: product.id, period, active: true },
    orderBy: { createdAt: 'desc' },
  });
  if (!price) return null;
  const options = optionCodes.length ? await loadOptions(product.id, optionCodes) : [];
  return priceConfiguration(price, product, config, options);
}

/**
 * The options a service was ordered with.
 *
 * The options are part of the configuration, so they are part of its price.
 */
function optionCodesOf(config: unknown): string[] {
  const value = (config ?? {}) as { optionCodes?: unknown };
  if (!Array.isArray(value.optionCodes)) return [];
  return value.optionCodes.filter((code): code is string => typeof code === 'string');
}

/**
 * The difference between the price an instance carries and the price of its
 * configuration.
 */
export interface InstancePriceDifference {
  instanceId: string;
  productId: string;
  previousPrice: number;
  price: number;
  delta: number;
  currency: string;
  configuration: { ram: number; cpu: number; disk: number };
}

/** The result of a price reconciliation. */
export interface PriceReconciliation {
  checked: number;
  corrected: number;
  differences: InstancePriceDifference[];
}

/**
 * Recomputes the price of the existing instances from their configuration.
 *
 * An instance that was imported or migrated carried the price of the product
 * instead of the price of the configuration it runs, so the estimate the
 * customer saw was not the price of what was ordered. The price of an
 * instance is the price of its configuration, computed with the same function
 * that quotes an order.
 *
 * The function is safe to run again: an instance whose price already is the
 * price of its configuration is left alone, and every change is written to
 * the journal with the difference it corrects.
 */
export async function reconcileInstancePrices(
  options: { actorId?: string | null; actorEmail?: string | null } = {},
): Promise<PriceReconciliation> {
  const instances = await prisma.instance.findMany({
    include: {
      product: true,
      order: { select: { id: true, total: true, discount: true } },
      orderItem: { select: { config: true } },
    },
    take: 500,
  });

  const differences: InstancePriceDifference[] = [];

  for (const instance of instances) {
    const configured = await configurationPrice(
      instance.product,
      instance,
      'MONTHLY',
      optionCodesOf(instance.orderItem?.config),
    );
    // A product without an active price has nothing to compare with.
    if (configured === null) continue;

    // A promotion belongs to the order, so the price of the configuration
    // keeps the share that was really paid for it.
    const subtotal = instance.order ? instance.order.total + instance.order.discount : 0;
    const price =
      instance.order && subtotal > 0
        ? normalizeAmount(Math.round((configured * instance.order.total) / subtotal))
        : configured;

    if (price === instance.price) continue;

    await prisma.instance.update({ where: { id: instance.id }, data: { price } });
    await prisma.instanceEvent.create({
      data: {
        instanceId: instance.id,
        type: 'price',
        message: `The monthly price of this service was corrected from ${instance.price} to ${price}, the price of its configuration.`,
      },
    });
    await audit({
      actorId: options.actorId ?? null,
      actorEmail: options.actorEmail ?? null,
      action: 'instance.price_reconciled',
      targetType: 'instance',
      targetId: instance.id,
      meta: {
        previousPrice: instance.price,
        price,
        delta: price - instance.price,
        currency: instance.currency,
        configuration: { ram: instance.ram, cpu: instance.cpu, disk: instance.disk },
      },
    });

    differences.push({
      instanceId: instance.id,
      productId: instance.productId,
      previousPrice: instance.price,
      price,
      delta: price - instance.price,
      currency: instance.currency,
      configuration: { ram: instance.ram, cpu: instance.cpu, disk: instance.disk },
    });
  }

  if (differences.length) {
    await audit({
      actorId: options.actorId ?? null,
      actorEmail: options.actorEmail ?? null,
      action: 'billing.instance_prices_reconciled',
      meta: { checked: instances.length, corrected: differences.length },
    });
  }

  return { checked: instances.length, corrected: differences.length, differences };
}

/**
 * The interval a subscription is billed on.
 *
 * The order that paid for it carries the interval, and the length of the
 * current period says the same thing. A subscription without either is
 * monthly, which is the interval the platform has always used.
 */
export async function subscriptionInterval(subscription: {
  orderItem?: { config?: unknown } | null;
  currentPeriodStart?: Date | null;
  currentPeriodEnd?: Date | null;
}): Promise<BillingInterval> {
  const config = (subscription.orderItem?.config ?? {}) as { period?: string };
  if (config.period === 'YEARLY' || config.period === 'MONTHLY') return config.period;
  if (subscription.currentPeriodStart && subscription.currentPeriodEnd) {
    const days = (subscription.currentPeriodEnd.getTime() - subscription.currentPeriodStart.getTime()) / (24 * 60 * 60 * 1000);
    if (days >= 300) return 'YEARLY';
  }
  return 'MONTHLY';
}

/**
 * The renewal an order carries, if it is a renewal.
 *
 * A renewal order extends a service instead of creating one, and the marker
 * is what tells the two apart.
 */
export interface RenewalMarker {
  subscriptionId: string;
  interval: BillingInterval;
}

export function readRenewalMarker(requestedConfig: unknown): RenewalMarker | null {
  const value = (requestedConfig ?? {}) as { renewal?: { subscriptionId?: string; interval?: string } };
  const renewal = value.renewal;
  if (!renewal || typeof renewal.subscriptionId !== 'string' || !renewal.subscriptionId) return null;
  return {
    subscriptionId: renewal.subscriptionId,
    interval: renewal.interval === 'YEARLY' ? 'YEARLY' : 'MONTHLY',
  };
}





/**
 * Whether the sweep may remove the server of a cancelled subscription, and
 * how long the service is kept before that happens.
 */
async function autoDeleteSetting(): Promise<{ enabled: boolean; retentionDays: number }> {
  const setting = await prisma.setting.findUnique({ where: { key: 'auto_delete_cancelled_instances' } });
  const value = (setting?.value ?? null) as { enabled?: boolean; retentionDays?: number } | null;
  const retentionDays =
    typeof value?.retentionDays === 'number' && value.retentionDays > 0
      ? Math.floor(value.retentionDays)
      : DEFAULT_RETENTION_DAYS;
  return { enabled: value?.enabled === true, retentionDays };
}

/**
 * Stops a running container, if the platform is allowed to.
 *
 * The stop uses the client key of the customer that owns the instance, the
 * same key every other customer operation uses. The administrative key of the
 * panel cannot be used on a client endpoint, and a key that can do everything
 * is not scoped to one customer.
 */
async function stopInstance(instance: {
  id: string;
  pterodactylUuid: string | null;
  userId: string;
}): Promise<void> {
  if (!instance.pterodactylUuid) return;
  try {
    const credential = await resolveCustomerCredential(instance.userId);
    await client.sendPower(client.clientToken(credential.token), instance.pterodactylUuid, 'stop');
  } catch {
    // A container that cannot be stopped is reported by the status page.
  }
}

/**
 * What the platform keeps of a cancelled service until it is deleted.
 *
 * The export is written before anything is deleted, so a customer whose
 * service is gone still has the data of the service.
 */
export interface RetentionRecord {
  instanceId: string;
  userId: string;
  cancelledAt: string;
  /** The end of the retention term: the service is deleted after this moment. */
  scheduledFor: string;
  retentionDays: number;
  exportCreatedAt: string;
  /** The data of the customer, exported before anything is deleted. */
  export: Record<string, unknown>;
  deletedAt: string | null;
}

/** The retention records of the cancelled services. */
export async function instanceRetentions(): Promise<Record<string, RetentionRecord>> {
  const setting = await prisma.setting.findUnique({ where: { key: RETENTION_SETTING_KEY } });
  const value = setting?.value;
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {};
  return value as unknown as Record<string, RetentionRecord>;
}

/** The retention record of one service, if it was cancelled. */
export async function instanceRetention(instanceId: string): Promise<RetentionRecord | null> {
  const records = await instanceRetentions();
  return records[instanceId] ?? null;
}

async function writeRetentionRecords(records: Record<string, RetentionRecord>): Promise<void> {
  await prisma.setting.upsert({
    where: { key: RETENTION_SETTING_KEY },
    create: { key: RETENTION_SETTING_KEY, value: records as never },
    update: { value: records as never },
  });
}

/**
 * The data of the customer, gathered in one document.
 *
 * Everything the platform knows about the service is written down: the
 * service itself, the order that paid for it, the subscription, the invoices,
 * the payments, the events, the domains and the support tickets.
 */
export async function buildInstanceExport(instanceId: string): Promise<Record<string, unknown>> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: {
      product: { select: { id: true, slug: true, name: true } },
      order: { include: { items: true } },
      orderItem: { include: { order: true } },
      subscription: true,
      events: { orderBy: { createdAt: 'asc' } },
      domains: { orderBy: { createdAt: 'asc' } },
      ticket: { include: { messages: { orderBy: { createdAt: 'asc' } } } },
    },
  });
  if (!instance) throw notFound('Instance not found.');

  const customer = await prisma.user.findUnique({
    where: { id: instance.userId },
    select: { id: true, email: true, firstName: true, lastName: true },
  });
  const invoices = await prisma.invoice.findMany({ where: { userId: instance.userId }, orderBy: { createdAt: 'asc' } });
  const payments = await prisma.payment.findMany({ where: { userId: instance.userId }, orderBy: { createdAt: 'asc' } });

  // The dates are written as they are written everywhere else: as text.
  return JSON.parse(
    JSON.stringify({
      exportedAt: new Date().toISOString(),
      customer,
      instance: {
        id: instance.id,
        name: instance.name,
        status: instance.status,
        ram: instance.ram,
        cpu: instance.cpu,
        disk: instance.disk,
        price: instance.price,
        currency: instance.currency,
        createdAt: instance.createdAt,
        cancelledAt: instance.cancelledAt,
        pterodactylServerId: instance.pterodactylServerId,
      },
      product: instance.product,
      order: instance.order,
      orderItem: instance.orderItem,
      subscription: instance.subscription,
      invoices,
      payments,
      events: instance.events,
      domains: instance.domains,
      ticket: instance.ticket,
    }),
  ) as Record<string, unknown>;
}

/**
 * Marks a cancelled service for deletion and exports the data of the
 * customer.
 *
 * The term is explicit: the service is only deleted after the term, and the
 * export exists before that moment, so the customer keeps its data.
 */
export async function scheduleInstanceDeletion(
  instanceId: string,
  options: { actorId?: string | null; actorEmail?: string | null } = {},
): Promise<RetentionRecord> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    select: { id: true, userId: true, cancelledAt: true },
  });
  if (!instance) throw notFound('Instance not found.');

  const setting = await autoDeleteSetting();
  const cancelledAt = instance.cancelledAt ?? new Date();
  const scheduledFor = addDays(cancelledAt, setting.retentionDays);

  const record: RetentionRecord = {
    instanceId: instance.id,
    userId: instance.userId,
    cancelledAt: cancelledAt.toISOString(),
    scheduledFor: scheduledFor.toISOString(),
    retentionDays: setting.retentionDays,
    exportCreatedAt: new Date().toISOString(),
    export: await buildInstanceExport(instance.id),
    deletedAt: null,
  };

  const records = await instanceRetentions();
  records[record.instanceId] = record;
  await writeRetentionRecords(records);

  await prisma.instanceEvent.create({
    data: {
      instanceId: instance.id,
      type: 'cancelled',
      message: `The service was cancelled. It is kept until ${record.scheduledFor.slice(0, 10)} and the data of the customer is exported.`,
    },
  });
  await audit({
    actorId: options.actorId ?? null,
    actorEmail: options.actorEmail ?? null,
    action: 'instance.deletion_scheduled',
    targetType: 'instance',
    targetId: instance.id,
    meta: {
      scheduledFor: record.scheduledFor,
      retentionDays: setting.retentionDays,
      autoDelete: setting.enabled,
      exportCreatedAt: record.exportCreatedAt,
    },
  });

  return record;
}

/**
 * Deletes the services whose retention term is over.
 *
 * Nothing is deleted before the term, and the export is written before the
 * deletion, so the customer keeps its data. When the operator has not allowed
 * the deletion, the service stays and the term is reported again.
 */
export async function processCancelledInstances(): Promise<{ deleted: number; pending: number }> {
  const setting = await autoDeleteSetting();
  const records = await instanceRetentions();
  const now = new Date();
  let deleted = 0;
  let pending = 0;
  let changed = false;

  for (const record of Object.values(records)) {
    if (record.deletedAt) continue;
    if (new Date(record.scheduledFor).getTime() > now.getTime()) {
      pending += 1;
      continue;
    }
    if (!setting.enabled) {
      // The operator has not allowed the deletion, so the service stays on the
      // node until the setting says otherwise.
      pending += 1;
      continue;
    }

    const instance = await prisma.instance.findUnique({
      where: { id: record.instanceId },
      select: { id: true, pterodactylServerId: true },
    });
    if (instance?.pterodactylServerId) {
      const { deleteServer } = await import('./pterodactyl/application.js');
      await deleteServer(instance.pterodactylServerId).catch(() => undefined);
    }

    record.deletedAt = now.toISOString();
    changed = true;
    deleted += 1;

    await prisma.instanceEvent.create({
      data: {
        instanceId: record.instanceId,
        type: 'deleted',
        message: 'The retention term was over, so the server of the service was deleted. The export of the data is still available.',
      },
    });
    await audit({
      action: 'instance.deleted',
      targetType: 'instance',
      targetId: record.instanceId,
      meta: { retentionDays: record.retentionDays, scheduledFor: record.scheduledFor },
    });
  }

  if (changed) await writeRetentionRecords(records);
  return { deleted, pending };
}

/**
 * Withdraws a subscription whose paid period is over.
 *
 * The service is not deleted straight away: the customer keeps it for the
 * retention term, and the data is exported before anything is deleted.
 */
async function withdraw(subscriptionId: string): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: { instance: { select: { id: true, pterodactylUuid: true, pterodactylServerId: true, userId: true } } },
  });
  if (!subscription || !subscription.instance) return;

  const instance = subscription.instance;
  await stopInstance(instance);
  await prisma.instance.update({
    where: { id: instance.id },
    data: { status: 'CANCELLED', cancelledAt: new Date() },
  });

  // The service is marked for deletion and the data of the customer is
  // exported. The server is only removed when the term is over.
  await scheduleInstanceDeletion(instance.id);

  await audit({
    action: 'subscription.withdrawn',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: { instanceId: instance.id },
  });
}

/**
 * The invoice that already covers the period a renewal would cover.
 *
 * It is either the invoice of the order that paid for the subscription, or
 * the invoice of a renewal that was requested for it. A renewal is never
 * written twice for the same period.
 */
async function writtenInvoiceForPeriod(
  subscription: { id: string; userId: string; orderItem?: { orderId: string } | null },
  start: Date,
): Promise<{ id: string } | null> {
  const candidates = await prisma.invoice.findMany({
    where: { userId: subscription.userId, status: { in: ['OPEN', 'PAID'] }, periodStart: start },
    include: { order: { select: { id: true, requestedConfig: true } } },
    take: 20,
  });
  const ownOrderId = subscription.orderItem?.orderId ?? null;
  for (const invoice of candidates) {
    // The invoice of the order that paid for the subscription, or the invoice
    // of a renewal that was requested for it.
    if (invoice.orderId === ownOrderId) return invoice;
    const marker = readRenewalMarker(invoice.order?.requestedConfig);
    if (marker && marker.subscriptionId === subscription.id) return invoice;
  }
  return null;
}

/**
 * Renews a subscription that is due.
 *
 * The money has to be collected before a period is extended, so this function
 * never writes an invoice that says "paid" on its own. With a payment
 * provider the renewal is the provider's business: its invoice pays the
 * period and the webhook extends the subscription. Without a provider the
 * platform writes the invoice that is due, marks the subscription for manual
 * action and waits for the collection to be confirmed.
 */
async function renew(subscriptionId: string): Promise<{ renewed: boolean; pending: boolean; invoiceId: string | null; reason: string | null }> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      orderItem: { include: { order: true } },
      instance: { select: { id: true } },
    },
  });
  if (!subscription) return { renewed: false, pending: false, invoiceId: null, reason: 'The subscription does not exist.' };

  // With a provider the renewal is collected by the provider, so the local
  // period is only extended when its invoice is paid.
  if (stripeLive()) {
    await prisma.subscription.update({
      where: { id: subscription.id },
      data: { lastRenewalCheckAt: new Date() },
    });
    return { renewed: false, pending: false, invoiceId: null, reason: 'The renewal is collected by the payment provider.' };
  }

  const start = subscription.currentPeriodEnd ?? new Date();
  const interval = await subscriptionInterval(subscription);
  const end = addMonths(start, monthsOfInterval(interval));

  // One invoice per period: a sweep that runs twice does not write two.
  const written = await writtenInvoiceForPeriod(subscription, start);
  if (written || (subscription.lastRenewalCheckAt && subscription.lastRenewalCheckAt.getTime() >= start.getTime())) {
    return { renewed: false, pending: true, invoiceId: written?.id ?? null, reason: 'The renewal of this period was already written.' };
  }

  const invoice = await prisma.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      userId: subscription.userId,
      orderId: subscription.orderItem?.orderId ?? null,
      stripeInvoiceId: null,
      // The invoice is open: nobody paid it yet.
      status: 'OPEN',
      amount: subscription.amount,
      tax: 0,
      total: subscription.amount,
      currency: subscription.currency,
      dueDate: start,
      periodStart: start,
      periodEnd: end,
    },
  });

  // The period is not extended: the money is not in. The subscription is
  // marked as overdue, so the customer sees that a payment is due.
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { status: 'PAST_DUE', lastRenewalCheckAt: new Date() },
  });

  if (subscription.instance) {
    await prisma.instanceEvent.create({
      data: {
        instanceId: subscription.instance.id,
        type: 'renewal',
        message: `The renewal invoice ${invoice.number} is open and waits for a payment of ${subscription.amount} ${subscription.currency}.`,
      },
    });
  }

  await audit({
    action: 'subscription.renewal_pending',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: {
      invoice: invoice.number,
      amount: subscription.amount,
      periodEnd: end.toISOString(),
      reason: 'no payment provider is configured',
    },
  });

  return {
    renewed: false,
    pending: true,
    invoiceId: invoice.id,
    reason: 'No payment provider is configured, so the renewal invoice is open and waits for a payment.',
  };
}

/**
 * Compares the local subscriptions with the provider. A subscription that the
 * provider knows about is corrected locally, so the platform does not keep a
 * state that the provider already abandoned.
 */
export async function reconcileWithProvider(): Promise<number> {
  if (!stripeLive()) return 0;
  const { retrieveStripeSubscription } = await import('./stripe.js');
  const subscriptions = await prisma.subscription.findMany({
    where: { stripeSubscriptionId: { not: null }, status: { not: 'CANCELLED' } },
    take: 100,
  });

  let corrected = 0;
  for (const subscription of subscriptions) {
    if (!subscription.stripeSubscriptionId) continue;
    const remote = await retrieveStripeSubscription(subscription.stripeSubscriptionId);
    if (!remote) continue;
    if (
      remote.currentPeriodEnd &&
      subscription.currentPeriodEnd &&
      remote.currentPeriodEnd.getTime() !== subscription.currentPeriodEnd.getTime()
    ) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { currentPeriodStart: remote.currentPeriodStart, currentPeriodEnd: remote.currentPeriodEnd },
      });
      corrected += 1;
    }
  }
  return corrected;
}

/**
 * The customer an invoice of the provider belongs to.
 *
 * The subscription is the first answer, because it carries the money of the
 * subscription. A payment is the second one, because it carries the customer
 * of the provider.
 */
export async function resolveInvoiceUser(subscriptionId?: string, customerId?: string): Promise<string | null> {
  if (subscriptionId) {
    const subscription = await prisma.subscription.findFirst({
      where: { stripeSubscriptionId: subscriptionId },
      select: { userId: true },
    });
    if (subscription) return subscription.userId;
  }
  if (customerId) {
    const payment = await prisma.payment.findFirst({
      where: { stripeCustomerId: customerId },
      select: { userId: true },
    });
    if (payment) return payment.userId;
  }
  return null;
}

/**
 * Writes the invoices the provider confirmed, taken from the ledger of the
 * events.
 *
 * The ledger is the truth of the provider when the provider cannot be asked
 * directly, and it is what makes a collected invoice survive an event that
 * arrived too early.
 */
async function reconcileInvoicesFromLedger(): Promise<{ checked: number; paid: number }> {
  const events = await prisma.webhookEvent.findMany({
    where: { provider: 'stripe', type: 'invoice.paid', status: 'processed' },
    orderBy: { createdAt: 'desc' },
    take: 200,
  });

  let paid = 0;
  for (const event of events) {
    const payload = (event.payload ?? {}) as {
      id?: string;
      amount_paid?: number;
      currency?: string;
      subscription?: string;
      customer?: string;
      hosted_invoice_url?: string;
      invoice_pdf?: string;
      period_start?: number;
      period_end?: number;
    };
    if (!payload.id) continue;

    const existing = await prisma.invoice.findUnique({ where: { stripeInvoiceId: payload.id } });
    if (existing?.status === 'PAID') continue;

    const userId = await resolveInvoiceUser(payload.subscription, payload.customer);
    if (!userId) continue;

    await upsertInvoice({
      stripeInvoiceId: payload.id,
      userId,
      orderId: existing?.orderId ?? null,
      amount: typeof payload.amount_paid === 'number' ? payload.amount_paid : (existing?.amount ?? 0),
      currency: payload.currency ?? existing?.currency ?? 'EUR',
      status: 'PAID',
      hostedUrl: payload.hosted_invoice_url ?? null,
      pdfUrl: payload.invoice_pdf ?? null,
      paidAt: new Date(),
      periodStart: typeof payload.period_start === 'number' ? new Date(payload.period_start * 1000) : null,
      periodEnd: typeof payload.period_end === 'number' ? new Date(payload.period_end * 1000) : null,
    });
    paid += 1;
  }

  return { checked: events.length, paid };
}

/**
 * Asks the provider which invoices are really paid.
 *
 * The provider is the truth about the money: an invoice is only paid when
 * the provider says it is.
 */
async function reconcileInvoicesFromProvider(): Promise<{ checked: number; paid: number; corrected: number }> {
  const invoices = await prisma.invoice.findMany({
    where: { stripeInvoiceId: { not: null } },
    orderBy: { createdAt: 'desc' },
    take: 100,
  });
  if (!invoices.length) return { checked: 0, paid: 0, corrected: 0 };

  const Stripe = (await import('stripe')).default;
  const stripe = new Stripe(env.STRIPE_SECRET_KEY);
  let paid = 0;
  let corrected = 0;

  for (const invoice of invoices) {
    if (!invoice.stripeInvoiceId) continue;
    let remote: { paid: boolean; status: string | null } | null = null;
    try {
      const result = await stripe.invoices.retrieve(invoice.stripeInvoiceId);
      remote = { paid: result.paid === true, status: result.status ?? null };
    } catch {
      // An invoice the provider cannot deliver is left as it is.
      continue;
    }
    if (!remote) continue;

    if (remote.paid && invoice.status !== 'PAID') {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: 'PAID', paidAt: invoice.paidAt ?? new Date() },
      });
      paid += 1;
      corrected += 1;
      continue;
    }
    if (!remote.paid && invoice.status === 'PAID' && (remote.status === 'void' || remote.status === 'uncollectible')) {
      await prisma.invoice.update({
        where: { id: invoice.id },
        data: { status: remote.status === 'void' ? 'VOID' : 'UNCOLLECTIBLE' },
      });
      corrected += 1;
    }
  }

  return { checked: invoices.length, paid, corrected };
}

/**
 * Compares the invoices of the platform with the provider.
 *
 * The function is safe to run again: an invoice that is already in the right
 * state is left alone, and an invoice is only ever paid when the provider
 * confirmed the collection.
 */
export async function reconcileInvoicesWithProvider(): Promise<{ checked: number; paid: number; corrected: number }> {
  const ledger = await reconcileInvoicesFromLedger();
  if (!stripeLive()) return { checked: ledger.checked, paid: ledger.paid, corrected: 0 };
  const remote = await reconcileInvoicesFromProvider();
  return {
    checked: ledger.checked + remote.checked,
    paid: ledger.paid + remote.paid,
    corrected: remote.corrected,
  };
}

/**
 * A renewal that does not need a payment provider.
 *
 * It writes the invoice that is due and marks the order as waiting for a
 * payment. The period is only extended when the collection is confirmed, so
 * the platform never pretends that money arrived.
 */
export async function createLocalRenewal(
  subscriptionId: string,
  options: { interval?: BillingInterval; actorId?: string | null; actorEmail?: string | null } = {},
): Promise<{
  orderId: string;
  invoiceId: string;
  number: string;
  amount: number;
  currency: string;
  interval: BillingInterval;
  periodStart: Date;
  periodEnd: Date;
}> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: subscriptionId },
    include: {
      orderItem: { include: { order: true } },
      instance: { include: { product: true } },
    },
  });
  if (!subscription) throw notFound('Subscription not found.');
  if (!subscription.instance) throw badRequest('This subscription has no service, so it cannot be renewed.');

  const interval = options.interval ?? (await subscriptionInterval(subscription));
  const amount = await configurationPrice(
    subscription.instance.product,
    { ram: subscription.instance.ram, cpu: subscription.instance.cpu, disk: subscription.instance.disk },
    interval,
    optionCodesOf(subscription.orderItem?.config),
  );
  if (amount === null) {
    throw badRequest(
      interval === 'YEARLY'
        ? 'This service has no yearly price, so it cannot be renewed for a year.'
        : 'This service has no monthly price, so it cannot be renewed.',
    );
  }

  const now = new Date();
  const start = subscription.currentPeriodEnd && subscription.currentPeriodEnd.getTime() > now.getTime() ? subscription.currentPeriodEnd : now;
  const end = addMonths(start, monthsOfInterval(interval));

  const order = await prisma.order.create({
    data: {
      number: await nextOrderNumber(),
      userId: subscription.userId,
      status: 'AWAITING_PAYMENT',
      kind: 'NEW',
      instanceId: subscription.instanceId,
      // The renewal is marked on the order, so the webhook knows that this
      // order renews a service instead of creating a new one.
      requestedConfig: { renewal: { subscriptionId: subscription.id, interval } },
      total: amount,
      discount: 0,
      currency: subscription.currency,
    },
  });

  const invoice = await prisma.invoice.create({
    data: {
      number: await nextInvoiceNumber(),
      userId: subscription.userId,
      orderId: order.id,
      stripeInvoiceId: null,
      status: 'OPEN',
      amount,
      tax: 0,
      total: amount,
      currency: subscription.currency,
      dueDate: start,
      periodStart: start,
      periodEnd: end,
    },
  });

  await prisma.instanceEvent.create({
    data: {
      instanceId: subscription.instance.id,
      type: 'renewal',
      message: `The renewal invoice ${invoice.number} is open for ${amount} ${subscription.currency}. The service continues once the payment is confirmed.`,
    },
  });
  // The renewal of this period is written, so the sweep does not write a
  // second invoice for the same period.
  await prisma.subscription.update({
    where: { id: subscription.id },
    data: { lastRenewalCheckAt: new Date() },
  });
  await audit({
    actorId: options.actorId ?? null,
    actorEmail: options.actorEmail ?? null,
    action: 'subscription.renewal_requested',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: {
      order: order.number,
      invoice: invoice.number,
      amount,
      interval,
      periodEnd: end.toISOString(),
    },
  });

  return {
    orderId: order.id,
    invoiceId: invoice.id,
    number: invoice.number,
    amount,
    currency: subscription.currency,
    interval,
    periodStart: start,
    periodEnd: end,
  };
}

/**
 * Extends the period of a subscription whose renewal was paid.
 */
export async function applyRenewalToSubscription(params: {
  subscriptionId: string;
  periodStart?: Date | null;
  periodEnd?: Date | null;
  interval?: BillingInterval;
  invoiceId?: string | null;
  orderId?: string | null;
  actorId?: string | null;
  actorEmail?: string | null;
}): Promise<void> {
  const subscription = await prisma.subscription.findUnique({
    where: { id: params.subscriptionId },
    include: { instance: { select: { id: true } } },
  });
  if (!subscription) throw notFound('Subscription not found.');

  const interval = params.interval ?? (await subscriptionInterval(subscription));
  const start = params.periodStart ?? subscription.currentPeriodEnd ?? new Date();
  const end = params.periodEnd ?? addMonths(start, monthsOfInterval(interval));

  await prisma.subscription.update({
    where: { id: subscription.id },
    data: {
      status: 'ACTIVE',
      currentPeriodStart: start,
      currentPeriodEnd: end,
      lastRenewalCheckAt: new Date(),
    },
  });

  if (subscription.instance) {
    await prisma.instanceEvent.create({
      data: {
        instanceId: subscription.instance.id,
        type: 'renewal',
        message: `The service was renewed until ${end.toISOString().slice(0, 10)}.`,
      },
    });
  }

  await audit({
    actorId: params.actorId ?? null,
    actorEmail: params.actorEmail ?? null,
    action: 'subscription.renewed',
    targetType: 'subscription',
    targetId: subscription.id,
    meta: {
      periodStart: start.toISOString(),
      periodEnd: end.toISOString(),
      invoiceId: params.invoiceId ?? null,
      orderId: params.orderId ?? null,
    },
  });
}

/**
 * Confirms a collection that did not go through a payment provider.
 *
 * The money arrived outside the platform and an operator confirms it with the
 * reference of the payment. Only then the invoice is paid and the period of
 * the service is extended. Confirming twice does nothing the second time.
 */
export async function confirmLocalCollection(
  invoiceId: string,
  options: { reference: string; actorId?: string | null; actorEmail?: string | null },
): Promise<{ invoiceId: string; number: string; status: string; periodEnd: Date | null }> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId }, include: { order: true } });
  if (!invoice) throw notFound('Invoice not found.');

  // The collection is confirmed once: a second confirmation does not extend
  // the period a second time.
  if (invoice.status === 'PAID') {
    return { invoiceId: invoice.id, number: invoice.number, status: invoice.status, periodEnd: invoice.periodEnd };
  }
  if (invoice.status !== 'OPEN') {
    throw conflict(`This invoice is ${invoice.status.toLowerCase()}, so it cannot be confirmed as paid.`);
  }

  await prisma.invoice.update({
    where: { id: invoice.id },
    data: { status: 'PAID', paidAt: new Date() },
  });

  const renewal = readRenewalMarker(invoice.order?.requestedConfig);
  if (renewal) {
    // The period is only extended when the money buys a period the service
    // does not have yet. A second collection for a period that is already
    // paid does not extend the service twice.
    const subscription = await prisma.subscription.findUnique({
      where: { id: renewal.subscriptionId },
      select: { id: true, currentPeriodEnd: true },
    });
    const covered =
      subscription?.currentPeriodEnd !== null &&
      subscription?.currentPeriodEnd !== undefined &&
      invoice.periodStart !== null &&
      invoice.periodStart.getTime() <= subscription.currentPeriodEnd.getTime();

    if (!covered) {
      await applyRenewalToSubscription({
        subscriptionId: renewal.subscriptionId,
        periodStart: invoice.periodStart,
        periodEnd: invoice.periodEnd,
        interval: renewal.interval,
        invoiceId: invoice.id,
        orderId: invoice.orderId,
        actorId: options.actorId ?? null,
        actorEmail: options.actorEmail ?? null,
      });
    } else {
      await audit({
        actorId: options.actorId ?? null,
        actorEmail: options.actorEmail ?? null,
        action: 'invoice.collected_period_covered',
        targetType: 'invoice',
        targetId: invoice.id,
        meta: {
          number: invoice.number,
          amount: invoice.amount,
          reference: options.reference,
          reason: 'the period of this invoice is already paid',
        },
      });
    }
    if (invoice.orderId) {
      await prisma.order.update({ where: { id: invoice.orderId }, data: { status: 'PAID', paidAt: new Date() } });
    }
  }

  await audit({
    actorId: options.actorId ?? null,
    actorEmail: options.actorEmail ?? null,
    action: 'invoice.collected',
    targetType: 'invoice',
    targetId: invoice.id,
    meta: {
      number: invoice.number,
      amount: invoice.amount,
      currency: invoice.currency,
      reference: options.reference,
    },
  });

  return { invoiceId: invoice.id, number: invoice.number, status: 'PAID', periodEnd: invoice.periodEnd };
}

/**
 * Runs the billing sweep. It is safe to run often, because every action is
 * guarded by the state of the subscription.
 */
export async function sweepSubscriptions(): Promise<{
  renewed: number;
  pending: number;
  suspended: number;
  withdrawn: number;
  deleted: number;
}> {
  const now = new Date();
  const graceStart = new Date(now.getTime() - GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  let renewed = 0;
  let pending = 0;
  let suspended = 0;
  let withdrawn = 0;
  let deleted = 0;

  // 1. The period is over and the subscription was cancelled.
  const due = await prisma.subscription.findMany({
    where: {
      status: { in: ['ACTIVE', 'PAST_DUE', 'INCOMPLETE', 'TRIALING'] },
      currentPeriodEnd: { lte: now },
    },
    select: { id: true, cancelAtPeriodEnd: true },
    take: 100,
  });

  for (const subscription of due) {
    if (subscription.cancelAtPeriodEnd) {
      await prisma.subscription.update({
        where: { id: subscription.id },
        data: { status: 'CANCELLED', cancelledAt: new Date() },
      });
      await withdraw(subscription.id);
      withdrawn += 1;
      continue;
    }

    // 2. The subscription is overdue: the service is suspended.
    const record = await prisma.subscription.findUnique({
      where: { id: subscription.id },
      include: {
        instance: { select: { id: true, status: true, pterodactylUuid: true, pterodactylServerId: true, userId: true } },
      },
    });
    if (!record) continue;

    if (record.currentPeriodEnd && record.currentPeriodEnd.getTime() < graceStart.getTime()) {
      if (record.instance && record.instance.status !== 'SUSPENDED') {
        await stopInstance(record.instance);
        await prisma.instance.update({
          where: { id: record.instance.id },
          data: { status: 'SUSPENDED', suspendedAt: new Date() },
        });
        await prisma.instanceEvent.create({
          data: {
            instanceId: record.instance.id,
            type: 'suspended',
            message: 'The service was suspended because the invoice was not paid.',
          },
        });
        await audit({
          action: 'instance.suspended',
          targetType: 'instance',
          targetId: record.instance.id,
          meta: { reason: 'payment overdue' },
        });
        suspended += 1;
      }
      await prisma.subscription.update({
        where: { id: record.id },
        data: { status: 'PAST_DUE', lastRenewalCheckAt: new Date() },
      });
      continue;
    }

    // 3. The period is over and the service is still fine: the renewal is
    // due. The period is only extended when the money is collected.
    const outcome = await renew(record.id);
    if (outcome.renewed) renewed += 1;
    if (outcome.pending) pending += 1;
  }

  // 4. The services whose retention term is over are deleted.
  const deletions = await processCancelledInstances();
  deleted += deletions.deleted;

  if (renewed || pending || suspended || withdrawn || deleted) {
    await audit({
      action: 'billing.swept',
      meta: { renewed, pending, suspended, withdrawn, deleted },
    });
  }

  return { renewed, pending, suspended, withdrawn, deleted };
}

/**
 * Releases the promotion reservations of the orders that were never paid.
 * A reservation only holds a campaign for a limited time, so an abandoned
 * checkout cannot keep a promotion hostage.
 */
export async function releaseStalePromotionReservations(): Promise<number> {
  const cutoff = new Date(Date.now() - 48 * 60 * 60 * 1000);
  const stale = await prisma.promotionRedemption.findMany({
    where: {
      order: {
        status: { in: ['PENDING', 'AWAITING_PAYMENT', 'CANCELLED'] },
        createdAt: { lt: cutoff },
      },
    },
    select: { orderId: true },
    take: 200,
  });
  if (!stale.length) return 0;
  const result = await prisma.promotionRedemption.deleteMany({
    where: { orderId: { in: stale.map((entry) => entry.orderId) } },
  });
  return result.count;
}

export const billingEnvironment = {
  gracePeriodDays: GRACE_PERIOD_DAYS,
  stripeLive: stripeLive(),
  environment: env.NODE_ENV,
};

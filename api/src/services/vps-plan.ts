import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';
import * as pve from './proxmox.js';
import { updateSubscriptionAmount } from './stripe.js';
import { audit } from '../lib/audit.js';
import { DEDICATED_IP_OPTION } from '../lib/vps-plans.js';
import { monthsOfPeriod, termOfSubscription } from './pricing.js';

/**
 * The two ways a VPS changes size.
 *
 * A commercial change moves the server to another plan and the subscription
 * to the price of that plan, in one operation that is quoted first. An
 * administrative adjustment gives or takes resources without touching the
 * bill, and it only exists with an explicit free override, a reason and an
 * audit entry. The two never share a code path, so a resource change cannot
 * leave the bill behind by accident.
 *
 * All money is in cents of the currency, as integers.
 */

export interface PlanFigures {
  slug: string;
  name: string;
  ram: number;
  cpu: number;
  disk: number;
  /** What the subscription costs a month with this plan and the address of the server. */
  amount: number;
}

export interface PlanQuote {
  serviceId: string;
  currency: string;
  from: PlanFigures;
  to: PlanFigures;
  /** The change of the monthly price. Negative for a downgrade. */
  delta: number;
  /** The amount now written on the subscription. */
  billedNow: number | null;
  /** Why the change cannot be applied, or null. */
  blocked: string | null;
  takesEffect: string;
}

async function monthlyPlanAmount(productId: string, dedicatedIp: boolean): Promise<{ amount: number; currency: string }> {
  const price = await prisma.productPrice.findFirst({ where: { productId, period: 'MONTHLY' } });
  if (!price) throw badRequest('That plan has no monthly price, so it cannot be sold or switched to.');
  let amount = price.baseAmount;
  if (dedicatedIp) {
    const option = await prisma.productOption.findUnique({ where: { code: DEDICATED_IP_OPTION.code } });
    if (!option) throw badRequest('The dedicated address has no price on this platform.');
    amount += option.amount;
  }
  return { amount, currency: price.currency };
}

async function load(serviceId: string) {
  const service = await prisma.vpsService.findUnique({
    where: { id: serviceId },
    include: { product: true, subscription: { include: { orderItem: { select: { config: true } } } } },
  });
  if (!service) throw notFound('That server was not found.');
  return service;
}

/** What a move to another plan would do. It reads and writes nothing. */
export async function quoteVpsPlanChange(serviceId: string, slug: string): Promise<PlanQuote> {
  const service = await load(serviceId);
  const target = await prisma.product.findUnique({ where: { slug } });
  if (!target || target.fulfilment !== 'VPS') throw notFound('That plan was not found.');
  const [now, next] = await Promise.all([
    monthlyPlanAmount(service.productId, service.dedicatedIp),
    monthlyPlanAmount(target.id, service.dedicatedIp),
  ]);
  const to = { slug: target.slug, name: target.name, ram: target.defaultRam, cpu: target.defaultCpu, disk: target.defaultDisk, amount: next.amount };
  let blocked: string | null = null;
  if (service.status !== 'ACTIVE' || !service.vmid) blocked = 'Only a server that is built can change plan.';
  else if (target.id === service.productId) blocked = 'The server already has this plan.';
  else if (to.disk < service.disk) blocked = `The disk cannot shrink (${service.disk} GB now, ${to.disk} GB in that plan).`;
  else if (!service.subscription) blocked = 'The server has no subscription, so there is no price to change. Use the administrative adjustment.';
  else if (!['ACTIVE', 'TRIALING'].includes(service.subscription.status)) blocked = 'The subscription is not active, so the price cannot be changed now.';
  else if (service.subscription.cancelAtPeriodEnd) blocked = 'The subscription ends at the end of the period. Resume it first.';
  else if (service.subscription.quantity !== 1) blocked = 'The subscription has more than one unit.';
  else if (termOfSubscription(service.subscription) === 'YEARLY') blocked = 'The subscription is billed yearly. A year that was paid up front is not switched to another plan here, because the credit of the rest of the year is not computed.';
  return {
    serviceId,
    currency: now.currency,
    from: { slug: service.product.slug, name: service.product.name, ram: service.ram, cpu: service.cpu, disk: service.disk, amount: now.amount },
    to,
    delta: next.amount - now.amount,
    billedNow: service.subscription?.amount ?? null,
    blocked,
    takesEffect: 'The resources change now (a running server reads the processor and memory at its next restart). The new price is charged from the next renewal; nothing is prorated or charged today.',
  };
}

/**
 * Applies a quoted plan change.
 *
 * The caller sends the amount it was quoted, and the change is refused when the
 * catalogue moved since. The subscription is changed first because that step is
 * the one that can be taken back; when the hypervisor then fails, the old
 * amount is put back. When even that fails, the audit log says exactly which
 * side is ahead, and the billing check lists the server until it is repaired.
 */
export async function applyVpsPlanChange(input: { serviceId: string; slug: string; expectedAmount: number; actor: { id: string; email: string }; ip?: string }): Promise<PlanQuote> {
  const quote = await quoteVpsPlanChange(input.serviceId, input.slug);
  if (quote.blocked) throw badRequest(quote.blocked);
  if (quote.to.amount !== input.expectedAmount) {
    throw badRequest(`The price changed since the quote (${quote.to.amount} cents now). Ask for a new quote.`);
  }
  const service = await load(input.serviceId);
  const subscription = service.subscription!;
  const previousAmount = subscription.amount;

  if (previousAmount !== quote.to.amount) await updateSubscriptionAmount(subscription, quote.to.amount);

  try {
    await pve.configureVm(service.vmid!, { cores: quote.to.cpu, memory: quote.to.ram });
    if (quote.to.disk > service.disk) await pve.resizeDisk(service.vmid!, quote.to.disk);
  } catch (error) {
    let restored = true;
    if (previousAmount !== quote.to.amount) {
      try {
        await updateSubscriptionAmount(subscription, previousAmount);
      } catch {
        restored = false;
      }
    }
    await audit({
      actorId: input.actor.id,
      actorEmail: input.actor.email,
      action: restored ? 'admin.vps.plan_failed' : 'admin.vps.plan_inconsistent',
      targetType: 'vps',
      targetId: service.id,
      meta: { to: quote.to.slug, error: (error as Error).message.slice(0, 300), stripeAmountRestored: restored, billedBefore: previousAmount, quotedAmount: quote.to.amount },
      ip: input.ip,
    });
    throw new Error(restored ? 'The hypervisor refused the change. The price was left as it was.' : 'The hypervisor refused the change and the old price could not be put back. The billing check lists this server.');
  }

  const target = await prisma.product.findUniqueOrThrow({ where: { slug: input.slug } });
  await prisma.$transaction([
    prisma.vpsService.update({ where: { id: service.id }, data: { productId: target.id, ram: quote.to.ram, cpu: quote.to.cpu, disk: quote.to.disk, resourceOverride: Prisma.DbNull } }),
    prisma.subscription.update({ where: { id: subscription.id }, data: { amount: quote.to.amount } }),
  ]);
  await audit({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: 'admin.vps.plan',
    targetType: 'vps',
    targetId: service.id,
    meta: { from: quote.from.slug, to: quote.to.slug, billedBefore: previousAmount, billedAfter: quote.to.amount, delta: quote.delta },
    ip: input.ip,
  });
  return quote;
}

export interface ResourceAdjustment {
  ram?: number;
  cpu?: number;
  disk?: number;
  reason: string;
}

/**
 * Gives (or takes back) resources without changing the bill.
 *
 * The record is kept on the server so nobody has to guess later why it is
 * bigger than its plan, and the billing check leaves it out of its list. The
 * customer is never charged for it, now or later.
 */
export async function adjustVpsResources(input: ResourceAdjustment & { serviceId: string; actor: { id: string; email: string }; ip?: string }) {
  const service = await load(input.serviceId);
  if (service.status !== 'ACTIVE' || !service.vmid) throw badRequest('Only a server that is built can be adjusted.');
  const ram = input.ram ?? service.ram;
  const cpu = input.cpu ?? service.cpu;
  const disk = input.disk ?? service.disk;
  if (ram === service.ram && cpu === service.cpu && disk === service.disk) throw badRequest('Nothing would change.');
  if (disk < service.disk) throw badRequest(`The disk cannot shrink (${service.disk} GB now).`);
  await pve.configureVm(service.vmid, { cores: cpu, memory: ram });
  if (disk > service.disk) await pve.resizeDisk(service.vmid, disk);
  const previous = service.resourceOverride as { from?: { ram: number; cpu: number; disk: number } } | null;
  const record = {
    reason: input.reason,
    by: input.actor.email,
    at: new Date().toISOString(),
    // The first adjustment remembers the plan size, so the record says what was given on top of it.
    from: previous?.from ?? { ram: service.ram, cpu: service.cpu, disk: service.disk },
    to: { ram, cpu, disk },
  };
  await prisma.vpsService.update({ where: { id: service.id }, data: { ram, cpu, disk, resourceOverride: record } });
  await audit({
    actorId: input.actor.id,
    actorEmail: input.actor.email,
    action: 'admin.vps.resources',
    targetType: 'vps',
    targetId: service.id,
    meta: { freeOverride: true, reason: input.reason, from: { ram: service.ram, cpu: service.cpu, disk: service.disk }, to: { ram, cpu, disk } },
    ip: input.ip,
  });
  return record;
}

export interface BillingMismatch {
  serviceId: string;
  kind: 'AMOUNT_DIFFERS' | 'NO_SUBSCRIPTION' | 'SUBSCRIPTION_NOT_ACTIVE' | 'SIZE_DIFFERS_FROM_PLAN';
  detail: string;
}

/**
 * Servers whose resources and bill do not agree. A server with a recorded free
 * override is not listed for its size, because that difference was a decision.
 * It reads only and repairs nothing.
 */
export async function vpsBillingMismatches(): Promise<BillingMismatch[]> {
  const services = await prisma.vpsService.findMany({
    where: { status: { in: ['ACTIVE', 'SUSPENDED'] } },
    include: { product: true, subscription: { include: { orderItem: { select: { config: true } } } } },
  });
  const found: BillingMismatch[] = [];
  for (const service of services) {
    if (!service.subscription) {
      found.push({ serviceId: service.id, kind: 'NO_SUBSCRIPTION', detail: 'The server runs without a subscription.' });
      continue;
    }
    if (service.status === 'ACTIVE' && !['ACTIVE', 'TRIALING', 'PAST_DUE'].includes(service.subscription.status)) {
      found.push({ serviceId: service.id, kind: 'SUBSCRIPTION_NOT_ACTIVE', detail: `The server is active and its subscription is ${service.subscription.status}.` });
    }
    const price = await prisma.productPrice.findFirst({ where: { productId: service.productId, period: 'MONTHLY' } });
    if (price) {
      const option = service.dedicatedIp ? await prisma.productOption.findUnique({ where: { code: DEDICATED_IP_OPTION.code } }) : null;
      // A year is twelve months of the monthly price, unless the plan has a yearly row of its own.
      const months = monthsOfPeriod(termOfSubscription(service.subscription));
      const yearly = months === 1 ? null : await prisma.productPrice.findFirst({ where: { productId: service.productId, period: 'YEARLY', active: true } });
      const expected = yearly ? yearly.baseAmount + (option?.amount ?? 0) * months : (price.baseAmount + (option?.amount ?? 0)) * months;
      // The price of the catalogue may have moved since the customer bought. That is a protected price, not an error,
      // so only a subscription that is not the price of any moment is reported by the plan change itself.
      if (service.subscription.amount !== expected && service.resourceOverride === null) {
        found.push({ serviceId: service.id, kind: 'AMOUNT_DIFFERS', detail: `Billed ${service.subscription.amount}, the plan is ${expected} now (a protected older price is expected to differ).` });
      }
    }
    if (service.resourceOverride === null && (service.ram !== service.product.defaultRam || service.cpu !== service.product.defaultCpu || service.disk !== service.product.defaultDisk)) {
      found.push({ serviceId: service.id, kind: 'SIZE_DIFFERS_FROM_PLAN', detail: `The server is ${service.cpu} vCPU / ${service.ram} MB / ${service.disk} GB and the plan is ${service.product.defaultCpu} / ${service.product.defaultRam} / ${service.product.defaultDisk}.` });
    }
  }
  return found;
}

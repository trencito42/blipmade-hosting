import type { MailSendingInterval } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, conflict, notFound } from '../lib/errors.js';
import { randomToken } from '../lib/tokens.js';
import { matchesToken, resolveTxt, verificationHostFor } from './dns.js';
import * as mailcow from './mailcow.js';
import { assertValidMailDomain } from './mail.js';
import { enqueueMailProvisioning } from './queue.js';

/**
 * The sale of hosted mail.
 *
 * A mail service is what a customer buys when they buy mail. It has its own
 * identity and its own life:
 *
 *   - it has no server and no instance, so it is bought on its own and
 *     cancelling the server of the same customer does not touch it;
 *   - it carries the limits of the plan that was paid for, as a copy, so a
 *     change of the catalog never changes a service that was already bought;
 *   - a domain is only hosted when the customer has shown that the domain is
 *     theirs, and the proof is a record of DNS that the customer publishes;
 *   - nothing is deleted the moment a payment fails: the service goes
 *     through a period of grace, then it is suspended, and the data is kept
 *     until the retention ends.
 *
 * The limits of the plan are the limits of the customer and the limits of the
 * environment are the ceiling of them. The limit that is applied is the
 * smaller of the two, so a plan can never promise more than the platform can
 * hold.
 */

/** The limits of a mail plan. */
export interface MailPlanLimits {
  /** How many domains the plan includes. */
  maxDomains: number;
  /** How many mailboxes a domain of the plan may hold. */
  maxMailboxes: number;
  /** How many aliases a domain of the plan may hold. */
  maxAliases: number;
  /** How many forwarding rules a domain of the plan may hold. */
  maxForwarding: number;
  /** How much space the plan includes, in megabytes. */
  totalStorageMb: number;
  /** How much space one mailbox may hold, in megabytes. */
  mailboxQuotaMb: number;
  /** How many messages may be sent in the window of the interval. */
  sendLimit: number;
  /** The window in which the limit of sending is counted. */
  sendInterval: MailSendingInterval;
}

/** The fields of a product that carry the limits of a plan. */
export interface MailPlanProduct {
  mailMaxDomains: number | null;
  mailMaxMailboxes: number | null;
  mailMaxAliases: number | null;
  mailMaxForwarding: number | null;
  mailTotalStorageMb: number | null;
  mailMailboxQuotaMb: number | null;
  mailSendLimit: number | null;
  mailSendInterval: MailSendingInterval | null;
}

/**
 * The ceiling of the platform.
 *
 * Every limit of a plan is under this ceiling, whatever the plan says. The
 * values come from the environment of the platform, so the operator can
 * lower them without touching the catalog.
 */
export function platformLimits(): MailPlanLimits {
  const mailboxQuotaMb = env.MAIL_MAX_QUOTA_MB_PER_MAILBOX;
  const maxMailboxes = env.MAIL_MAX_MAILBOXES_PER_DOMAIN;
  return {
    maxDomains: env.MAIL_MAX_DOMAINS_PER_CUSTOMER,
    maxMailboxes,
    maxAliases: env.MAIL_MAX_ALIASES_PER_DOMAIN,
    maxForwarding: env.MAIL_MAX_FORWARDING_PER_DOMAIN,
    // The total of the plan is the ceiling of a domain multiplied by the
    // number of domains: the platform cannot hold more per domain than the
    // ceiling of a domain.
    totalStorageMb: env.MAIL_MAX_QUOTA_MB_PER_DOMAIN * Math.max(1, env.MAIL_MAX_DOMAINS_PER_CUSTOMER),
    mailboxQuotaMb,
    sendLimit: env.MAIL_MAX_SEND_LIMIT,
    sendInterval: 'HOURLY',
  };
}

/**
 * The limits of a plan, under the ceiling of the platform.
 *
 * A plan that says nothing about a limit gets the limit of the platform, and
 * a plan that asks for more than the platform holds gets the limit of the
 * platform. The customer is never promised more than the platform can keep.
 */
export function effectivePlanLimits(product: MailPlanProduct): MailPlanLimits {
  const cap = platformLimits();
  const mailboxQuotaMb = Math.min(product.mailMailboxQuotaMb ?? cap.mailboxQuotaMb, cap.mailboxQuotaMb);
  const maxMailboxes = Math.min(product.mailMaxMailboxes ?? cap.maxMailboxes, cap.maxMailboxes);
  const maxAliases = Math.min(product.mailMaxAliases ?? cap.maxAliases, cap.maxAliases);
  const maxDomains = Math.min(product.mailMaxDomains ?? cap.maxDomains, cap.maxDomains);
  const maxForwarding = Math.min(product.mailMaxForwarding ?? cap.maxForwarding, cap.maxForwarding);
  const totalStorageMb = Math.min(
    product.mailTotalStorageMb ?? maxMailboxes * mailboxQuotaMb,
    cap.totalStorageMb,
  );
  const sendLimit = Math.min(product.mailSendLimit ?? cap.sendLimit, cap.sendLimit);
  const sendInterval = product.mailSendInterval ?? cap.sendInterval;
  return {
    maxDomains,
    maxMailboxes,
    maxAliases,
    maxForwarding,
    totalStorageMb,
    mailboxQuotaMb,
    sendLimit,
    sendInterval,
  };
}

/** The window in which the mail system counts the messages of a domain. */
export function rateLimitFrame(interval: MailSendingInterval): 'h' | 'm' | 's' {
  if (interval === 'MINUTELY') return 'm';
  if (interval === 'HOURLY') return 'h';
  // The mail system counts by hour, by minute and by second and knows no
  // day. A limit of a day is written as an hourly limit of a twenty-fourth,
  // so the day of the customer holds at most what the plan allows.
  return 'h';
}

/** The limit of sending that is written in the mail system. */
export function rateLimitValue(limits: MailPlanLimits): number {
  if (limits.sendInterval === 'DAILY') return Math.max(1, Math.ceil(limits.sendLimit / 24));
  return Math.max(1, limits.sendLimit);
}

/** The mark the platform leaves on a domain of the mail system. */
export function serviceMarker(serviceId: string): string {
  return `blipmade-service:${serviceId}`;
}

/** The service whose mark is on a domain of the mail system. */
export function markerServiceId(description: string | null | undefined): string | null {
  if (!description) return null;
  const match = /^blipmade-service:([A-Za-z0-9_-]+)$/.exec(description.trim());
  return match?.[1] ?? null;
}

/** The view of a domain of a mail service. */
export interface MailServiceDomainView {
  id: string;
  name: string;
  status: string;
  ownershipStatus: string;
  /** The name of the record of DNS that carries the proof. */
  verificationHost: string | null;
  /** The token the customer has to publish. */
  verificationToken: string | null;
  verifiedAt: string | null;
  quotaMb: number;
  usedMb: number;
  mailboxCount: number;
  aliasCount: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  lastError: string | null;
  /** Where the customer reads the mail, when the platform has a webmail. */
  webmailUrl?: string | null;
}

/** The view of a mail service that the platform gives to its customer. */
export interface MailServiceView {
  id: string;
  status: string;
  plan: { slug: string; name: string; category: string };
  limits: MailPlanLimits;
  usage: {
    domains: number;
    mailboxes: number;
    storageMb: number;
    storageLimitMb: number;
  };
  domains: MailServiceDomainView[];
  /** Where the customer reads the mail, when the platform has a webmail. */
  webmailUrl: string | null;
  graceUntil: string | null;
  suspendedAt: string | null;
  cancelledAt: string | null;
  retentionUntil: string | null;
  lastError: string | null;
  createdAt: string;
}

function iso(date: Date | null | undefined): string | null {
  return date ? date.toISOString() : null;
}

/** The state of a service, in the words of the customer. */
export function mailServiceStatusLabel(status: string): string {
  switch (status) {
    case 'PENDING':
      return 'Waiting for the domain';
    case 'PROVISIONING':
      return 'Being set up';
    case 'ACTIVE':
      return 'Active';
    case 'GRACE':
      return 'Grace period';
    case 'SUSPENDED':
      return 'Suspended';
    case 'CANCELLED':
      return 'Cancelled';
    default:
      return status;
  }
}

/** The limits that are stored on a service. */
export function limitsOfService(service: {
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  totalStorageMb: number;
  mailboxQuotaMb: number;
  sendLimit: number;
  sendInterval: MailSendingInterval;
}): MailPlanLimits {
  return {
    maxDomains: service.maxDomains,
    maxMailboxes: service.maxMailboxes,
    maxAliases: service.maxAliases,
    maxForwarding: service.maxForwarding,
    totalStorageMb: service.totalStorageMb,
    mailboxQuotaMb: service.mailboxQuotaMb,
    sendLimit: service.sendLimit,
    sendInterval: service.sendInterval,
  };
}

type ServiceRow = {
  id: string;
  userId: string;
  status: string;
  maxDomains: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  totalStorageMb: number;
  mailboxQuotaMb: number;
  sendLimit: number;
  sendInterval: MailSendingInterval;
  graceUntil: Date | null;
  suspendedAt: Date | null;
  cancelledAt: Date | null;
  retentionUntil: Date | null;
  lastError: string | null;
  createdAt: Date;
  product: { slug: string; name: string; category: string };
  domains: {
    id: string;
    name: string;
    status: string;
    ownershipStatus: string;
    verificationHost: string | null;
    verificationToken: string | null;
    verifiedAt: Date | null;
    quotaMb: number;
    usedMb: number;
    maxMailboxes: number;
    maxAliases: number;
    maxForwarding: number;
    lastError: string | null;
    _count: { mailboxes: number; aliases: number };
  }[];
};

const serviceInclude = {
  product: { select: { slug: true, name: true, category: true } },
  domains: {
    orderBy: { createdAt: 'asc' },
    include: { _count: { select: { mailboxes: true, aliases: true } } },
  },
} as const;

function viewOfService(service: ServiceRow): MailServiceView {
  const storageMb = service.domains.reduce((sum, domain) => sum + domain.usedMb, 0);
  return {
    id: service.id,
    status: service.status,
    plan: {
      slug: service.product.slug,
      name: service.product.name,
      category: service.product.category,
    },
    limits: limitsOfService(service),
    usage: {
      domains: service.domains.length,
      mailboxes: service.domains.reduce((sum, domain) => sum + domain._count.mailboxes, 0),
      storageMb,
      storageLimitMb: service.totalStorageMb,
    },
    domains: service.domains.map((domain) => ({
      id: domain.id,
      name: domain.name,
      status: domain.status,
      ownershipStatus: domain.ownershipStatus,
      verificationHost: domain.verificationHost,
      verificationToken: domain.verificationToken,
      verifiedAt: iso(domain.verifiedAt),
      quotaMb: domain.quotaMb,
      usedMb: domain.usedMb,
      mailboxCount: domain._count.mailboxes,
      aliasCount: domain._count.aliases,
      maxMailboxes: domain.maxMailboxes,
      maxAliases: domain.maxAliases,
      maxForwarding: domain.maxForwarding,
      lastError: domain.lastError,
    })),
    webmailUrl: env.MAIL_WEBMAIL_URL || null,
    graceUntil: iso(service.graceUntil),
    suspendedAt: iso(service.suspendedAt),
    cancelledAt: iso(service.cancelledAt),
    retentionUntil: iso(service.retentionUntil),
    lastError: service.lastError,
    createdAt: service.createdAt.toISOString(),
  };
}

/** The mail services of a customer. */
export async function listMailServices(userId: string): Promise<MailServiceView[]> {
  const services = await prisma.mailService.findMany({
    where: { userId },
    include: serviceInclude,
    orderBy: { createdAt: 'desc' },
  });
  return services.map((service) => viewOfService(service as unknown as ServiceRow));
}

/** One mail service of a customer. */
export async function getMailService(userId: string, serviceId: string): Promise<MailServiceView> {
  const service = await prisma.mailService.findFirst({
    where: { id: serviceId, userId },
    include: serviceInclude,
  });
  if (!service) throw notFound('This mail service does not exist.');
  return viewOfService(service as unknown as ServiceRow);
}

/** The service of the platform, without the customer bound to it. */
export async function getMailServiceById(serviceId: string): Promise<ServiceRow> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: serviceInclude,
  });
  if (!service) throw notFound('This mail service does not exist.');
  return service as unknown as ServiceRow;
}

/**
 * The key that makes the creation of a service safe to repeat.
 *
 * The key is built from the order and the line, so a payment event that
 * arrives twice finds the service that is already there instead of making a
 * second one.
 */
export function mailServiceKey(orderId: string, itemId: string): string {
  return `order:${orderId}:item:${itemId}`;
}

/**
 * The mark of an order that changes the plan of a mail service.
 *
 * The mark travels with the order, so the payment of the order is what
 * decides that the plan changes and not before.
 */
export function mailPlanChangeMarker(serviceId: string): Record<string, unknown> {
  return { mailPlanChange: { serviceId } };
}

/**
 * Reads the mark of a change of plan.
 *
 * It answers with nothing when the order is not a change of plan, so the
 * ordinary fulfilment of an order is not disturbed by it.
 */
export function readMailPlanChange(config: unknown): { serviceId: string } | null {
  if (!config || typeof config !== 'object') return null;
  const marker = (config as { mailPlanChange?: { serviceId?: unknown } }).mailPlanChange;
  if (!marker || typeof marker !== 'object') return null;
  const serviceId = (marker as { serviceId?: unknown }).serviceId;
  if (typeof serviceId !== 'string' || !serviceId) return null;
  return { serviceId };
}

/**
 * Creates the mail service of a paid order line.
 *
 * The function is idempotent: it is safe to call it again for the same line,
 * and it answers with the service that is already there. The domain of the
 * line is written down with its proof, and it is not hosted until the
 * customer has shown that the domain is theirs.
 */
export async function createMailServiceForOrderItem(input: {
  orderId: string;
  itemId: string;
  userId: string;
  productId: string;
  domain: string;
  subscriptionId?: string | null;
}): Promise<{ serviceId: string; created: boolean }> {
  const provisioningKey = mailServiceKey(input.orderId, input.itemId);
  const existing = await prisma.mailService.findUnique({ where: { provisioningKey } });
  if (existing) return { serviceId: existing.id, created: false };

  const product = await prisma.product.findUnique({ where: { id: input.productId } });
  if (!product) throw notFound('The plan of this mail service does not exist.');
  if (product.fulfilment !== 'EMAIL') {
    throw badRequest('This product is not a plan of hosted mail.');
  }
  const limits = effectivePlanLimits(product);
  const name = assertValidMailDomain(input.domain);

  // A domain that another customer already hosts is refused here, so a
  // second customer cannot take a domain that is already paid for.
  const otherDomain = await prisma.mailDomain.findFirst({
    where: { name, userId: { not: input.userId } },
    select: { id: true, userId: true },
  });
  if (otherDomain) {
    throw conflict('This domain is already hosted for another customer.');
  }

  const existingDomain = await prisma.mailDomain.findFirst({
    where: { name, userId: input.userId },
    select: { id: true, serviceId: true },
  });
  if (existingDomain?.serviceId) {
    throw conflict('This domain already belongs to one of your mail services.');
  }

  const verificationHost = verificationHostFor(name);
  const verificationToken = randomToken(24);

  const service = await prisma.$transaction(async (tx) => {
    const created = await tx.mailService.create({
      data: {
        userId: input.userId,
        productId: input.productId,
        orderId: input.orderId,
        orderItemId: input.itemId,
        subscriptionId: input.subscriptionId ?? null,
        status: 'PENDING',
        provisioningKey,
        maxDomains: limits.maxDomains,
        maxMailboxes: limits.maxMailboxes,
        maxAliases: limits.maxAliases,
        maxForwarding: limits.maxForwarding,
        totalStorageMb: limits.totalStorageMb,
        mailboxQuotaMb: limits.mailboxQuotaMb,
        sendLimit: limits.sendLimit,
        sendInterval: limits.sendInterval,
      },
    });

    if (existingDomain) {
      // The domain was already known to the platform: it joins the service
      // and waits for its proof, like any other domain.
      await tx.mailDomain.update({
        where: { id: existingDomain.id },
        data: {
          serviceId: created.id,
          ownershipStatus: 'UNVERIFIED',
          verificationHost,
          verificationToken,
          verifiedAt: null,
          maxMailboxes: limits.maxMailboxes,
          maxAliases: limits.maxAliases,
          maxForwarding: limits.maxForwarding,
          quotaMb: quotaForService(limits),
        },
      });
    } else {
      await tx.mailDomain.create({
        data: {
          userId: input.userId,
          serviceId: created.id,
          name,
          status: 'PENDING',
          ownershipStatus: 'UNVERIFIED',
          verificationHost,
          verificationToken,
          maxMailboxes: limits.maxMailboxes,
          maxAliases: limits.maxAliases,
          maxForwarding: limits.maxForwarding,
          quotaMb: quotaForService(limits),
        },
      });
    }
    return created;
  });

  await audit({
    actorId: input.userId,
    action: 'mail.service_created',
    targetType: 'mail_service',
    targetId: service.id,
    meta: { orderId: input.orderId, itemId: input.itemId, domain: name, plan: product.slug },
  });

  return { serviceId: service.id, created: true };
}

/** How much a domain of a service may hold, in megabytes. */
export function quotaForService(limits: MailPlanLimits): number {
  return Math.max(1, Math.min(limits.totalStorageMb, env.MAIL_MAX_QUOTA_MB_PER_DOMAIN));
}

/**
 * Adds a domain to a service.
 *
 * The domain is not hosted yet: it waits for the proof that the customer owns
 * it. The number of domains of the plan is checked here, so a customer that
 * is at the limit is told so instead of being half served.
 */
export async function addMailDomainToService(
  userId: string,
  serviceId: string,
  rawName: string,
): Promise<MailServiceDomainView> {
  const service = await prisma.mailService.findFirst({
    where: { id: serviceId, userId },
    include: { domains: true },
  });
  if (!service) throw notFound('This mail service does not exist.');
  if (service.status === 'CANCELLED') {
    throw conflict('This mail service was cancelled. Reactivate it before adding a domain.');
  }
  const name = assertValidMailDomain(rawName);

  const otherDomain = await prisma.mailDomain.findFirst({
    where: { name, userId: { not: userId } },
    select: { id: true },
  });
  if (otherDomain) throw conflict('This domain is already hosted for another customer.');

  const known = await prisma.mailDomain.findFirst({ where: { name, userId } });
  if (known?.serviceId && known.serviceId !== serviceId) {
    throw conflict('This domain already belongs to one of your mail services.');
  }
  if (!known && service.domains.length >= service.maxDomains) {
    throw conflict(
      `Your plan holds ${service.maxDomains} domain(s). Remove one or change your plan before adding another.`,
    );
  }
  if (known) {
    throw conflict('This domain is already one of your domains.');
  }

  const verificationHost = verificationHostFor(name);
  const verificationToken = randomToken(24);
  const created = await prisma.mailDomain.create({
    data: {
      userId,
      serviceId,
      name,
      status: 'PENDING',
      ownershipStatus: 'UNVERIFIED',
      verificationHost,
      verificationToken,
      maxMailboxes: service.maxMailboxes,
      maxAliases: service.maxAliases,
      maxForwarding: service.maxForwarding,
      quotaMb: quotaForService(limitsOfService(service)),
    },
  });

  await audit({
    actorId: userId,
    action: 'mail.domain_added',
    targetType: 'mail_domain',
    targetId: created.id,
    meta: { serviceId, domain: name },
  });

  return {
    id: created.id,
    name: created.name,
    status: created.status,
    ownershipStatus: created.ownershipStatus,
    verificationHost: created.verificationHost,
    verificationToken: created.verificationToken,
    verifiedAt: iso(created.verifiedAt),
    quotaMb: created.quotaMb,
    usedMb: created.usedMb,
    mailboxCount: 0,
    aliasCount: 0,
    maxMailboxes: created.maxMailboxes,
    maxAliases: created.maxAliases,
    maxForwarding: created.maxForwarding,
    lastError: created.lastError,
  };
}

/**
 * Checks the proof of a domain and hosts it when the proof is good.
 *
 * The proof is a record of DNS that the customer publishes at the name of the
 * platform: "_blipmade-verify" followed by the domain. The record holds a
 * token that the platform gave to the customer, and it is compared without
 * telling anybody how long it took.
 */
export async function verifyMailDomainOwnership(
  userId: string,
  domainId: string,
): Promise<{ verified: boolean; message: string; domain: MailServiceDomainView }> {
  const domain = await prisma.mailDomain.findFirst({
    where: { id: domainId, userId },
    include: { service: true },
  });
  if (!domain) throw notFound('This domain does not exist.');
  if (!domain.service) {
    throw conflict('This domain is not part of a mail service.');
  }
  if (!domain.verificationToken || !domain.verificationHost) {
    throw badRequest('This domain has no proof to check. Ask for a new one.');
  }

  let values: string[];
  try {
    const lookup = await resolveTxt(domain.verificationHost);
    values = lookup.values;
  } catch (error) {
    await prisma.mailDomain.update({
      where: { id: domain.id },
      data: { ownershipStatus: 'FAILED', lastError: (error as Error).message },
    });
    return {
      verified: false,
      message: `The DNS of the world could not be read: ${(error as Error).message}`,
      // The row is read again after the change, so the answer tells the
      // customer that the proof was refused and not that it was never tried.
      domain: await domainView(await prisma.mailDomain.findUniqueOrThrow({ where: { id: domain.id } })),
    };
  }

  if (!matchesToken(values, domain.verificationToken)) {
    await prisma.mailDomain.update({
      where: { id: domain.id },
      data: {
        ownershipStatus: 'FAILED',
        lastError: `The record ${domain.verificationHost} does not hold the token of this domain yet.`,
      },
    });
    return {
      verified: false,
      message: `The record ${domain.verificationHost} does not hold the token of this domain yet. It can take a few minutes for a change of DNS to be seen.`,
      // The row is read again after the change, so the answer tells the
      // customer that the proof was refused and not that it was never tried.
      domain: await domainView(await prisma.mailDomain.findUniqueOrThrow({ where: { id: domain.id } })),
    };
  }

  await prisma.mailDomain.update({
    where: { id: domain.id },
    data: { ownershipStatus: 'VERIFIED', verifiedAt: new Date(), lastError: null },
  });

  await audit({
    actorId: userId,
    action: 'mail.domain_verified',
    targetType: 'mail_domain',
    targetId: domain.id,
    meta: { serviceId: domain.serviceId, domain: domain.name },
  });

  // The domain is proved, so it can be hosted. The hosting is done by the
  // queue, so the customer does not wait for the mail system.
  if (domain.serviceId) {
    await enqueueMailProvisioning(domain.serviceId, { reason: 'domain verified' });
  }

  const fresh = await prisma.mailDomain.findUnique({ where: { id: domain.id } });
  return {
    verified: true,
    message: 'The domain is yours. It is being hosted now.',
    domain: await domainView(fresh ?? domain),
  };
}

async function domainView(domain: {
  id: string;
  name: string;
  status: string;
  ownershipStatus: string;
  verificationHost: string | null;
  verificationToken: string | null;
  verifiedAt: Date | null;
  quotaMb: number;
  usedMb: number;
  maxMailboxes: number;
  maxAliases: number;
  maxForwarding: number;
  lastError: string | null;
}): Promise<MailServiceDomainView> {
  const counts = await prisma.mailDomain.findUnique({
    where: { id: domain.id },
    select: { _count: { select: { mailboxes: true, aliases: true } } },
  });
  return {
    id: domain.id,
    name: domain.name,
    status: domain.status,
    ownershipStatus: domain.ownershipStatus,
    verificationHost: domain.verificationHost,
    verificationToken: domain.verificationToken,
    verifiedAt: iso(domain.verifiedAt),
    quotaMb: domain.quotaMb,
    usedMb: domain.usedMb,
    mailboxCount: counts?._count.mailboxes ?? 0,
    aliasCount: counts?._count.aliases ?? 0,
    maxMailboxes: domain.maxMailboxes,
    maxAliases: domain.maxAliases,
    maxForwarding: domain.maxForwarding,
    lastError: domain.lastError,
    webmailUrl: env.MAIL_WEBMAIL_URL || null,
  };
}

/**
 * Hosts the domains of a service in the mail system.
 *
 * Only a domain whose owner has been proved is hosted. The function is safe
 * to repeat: a domain that is already held by the service is only brought
 * back in line with the limits of the plan.
 */
export async function provisionMailService(serviceId: string): Promise<{
  provisioned: number;
  waiting: number;
  failed: number;
}> {
  const service = await getMailServiceById(serviceId);
  if (service.status === 'CANCELLED') {
    throw conflict('This mail service was cancelled.');
  }

  const limits = limitsOfService(service);
  const proved = service.domains.filter((domain) => domain.ownershipStatus === 'VERIFIED');
  const waiting = service.domains.length - proved.length;

  if (!mailcow.mailcowConfigured()) {
    const message = 'The mail system is not configured on this environment.';
    await prisma.mailService.update({
      where: { id: serviceId },
      data: { status: 'PENDING', lastError: message },
    });
    throw new Error(message);
  }

  await prisma.mailService.update({
    where: { id: serviceId },
    data: { status: 'PROVISIONING', lastError: null },
  });

  let provisioned = 0;
  let failed = 0;
  for (const domain of proved) {
    try {
      await hostDomainInMailSystem(serviceId, service.userId, domain.name, limits);
      await prisma.mailDomain.update({
        where: { id: domain.id },
        data: { status: 'ACTIVE', lastError: null },
      });
      provisioned += 1;
    } catch (error) {
      failed += 1;
      await prisma.mailDomain.update({
        where: { id: domain.id },
        data: { status: 'ERROR', lastError: (error as Error).message },
      });
    }
  }

  const status = provisioned > 0 ? 'ACTIVE' : failed > 0 ? 'PROVISIONING' : 'PENDING';
  await prisma.mailService.update({
    where: { id: serviceId },
    data: {
      status,
      lastError: failed > 0 ? `${failed} domain(s) could not be hosted.` : null,
    },
  });

  await audit({
    action: 'mail.service_provisioned',
    targetType: 'mail_service',
    targetId: serviceId,
    meta: { provisioned, waiting, failed },
  });

  return { provisioned, waiting, failed };
}

/**
 * Hosts one domain of a service in the mail system.
 *
 * The domain of the mail system holds one domain for everybody, so the
 * platform writes its mark on it: a domain that carries the mark of another
 * service is refused, so two customers can never hold the same domain.
 */
async function hostDomainInMailSystem(
  serviceId: string,
  userId: string,
  name: string,
  limits: MailPlanLimits,
): Promise<void> {
  const existing = await mailcow.mailcowDomain(name);
  if (existing) {
    const owner = markerServiceId(existing.description);
    if (owner && owner !== serviceId) {
      throw conflict('This domain is already hosted for another customer.');
    }
    if (!owner) {
      throw conflict('This domain is already used by the mail system.');
    }
    await mailcow.mailcowSetDomainActive(name, true);
  } else {
    await mailcow.mailcowCreateDomain({
      domain: name,
      description: serviceMarker(serviceId),
      quotaMb: quotaForService(limits),
      maxQuotaMb: quotaForService(limits),
      defQuotaMb: limits.mailboxQuotaMb,
      mailboxes: limits.maxMailboxes,
      aliases: limits.maxAliases,
    });
  }

  // The limit of sending of the plan is written in the mail system, so the
  // mass mail that the plan does not allow is refused there and not only by
  // the platform.
  await mailcow.mailcowSetDomainRateLimit(name, rateLimitValue(limits), rateLimitFrame(limits.sendInterval));

  // The key of DKIM is written down, so the customer can publish it.
  const dkim = await mailcow.mailcowEnsureDkim(name);
  if (dkim?.pubkey) {
    await prisma.mailDomain.updateMany({
      where: { userId, name },
      data: { dkimPublic: dkim.pubkey },
    });
  }
}

/**
 * Suspends a mail service.
 *
 * The mail of the service stops at once and the data stays where it is, so
 * the service can be brought back.
 */
export async function suspendMailService(
  serviceId: string,
  reason: string,
  actorId?: string,
): Promise<void> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: true },
  });
  if (!service) throw notFound('This mail service does not exist.');
  if (service.status === 'SUSPENDED') return;

  for (const domain of service.domains) {
    if (domain.status === 'ACTIVE') {
      await mailcow.mailcowSetDomainActive(domain.name, false).catch(() => undefined);
    }
    await prisma.mailDomain.update({
      where: { id: domain.id },
      data: { status: 'SUSPENDED' },
    });
  }

  await prisma.mailService.update({
    where: { id: serviceId },
    data: { status: 'SUSPENDED', suspendedAt: new Date(), lastError: reason || null },
  });

  await audit({
    actorId,
    action: 'mail.service_suspended',
    targetType: 'mail_service',
    targetId: serviceId,
    meta: { reason },
  });
}

/**
 * Brings a suspended service back.
 *
 * The domains are hosted again and the service goes back to work. The data
 * was never deleted, so there is nothing to restore.
 */
export async function resumeMailService(serviceId: string, actorId?: string): Promise<void> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: true },
  });
  if (!service) throw notFound('This mail service does not exist.');
  if (service.status !== 'SUSPENDED' && service.status !== 'GRACE') {
    throw conflict('This mail service is not suspended.');
  }

  for (const domain of service.domains) {
    if (domain.ownershipStatus !== 'VERIFIED') continue;
    await mailcow.mailcowSetDomainActive(domain.name, true).catch(() => undefined);
    await prisma.mailDomain.update({ where: { id: domain.id }, data: { status: 'ACTIVE' } });
  }

  await prisma.mailService.update({
    where: { id: serviceId },
    data: { status: 'ACTIVE', suspendedAt: null, graceUntil: null, lastError: null },
  });

  await audit({
    actorId,
    action: 'mail.service_resumed',
    targetType: 'mail_service',
    targetId: serviceId,
  });
}

/**
 * Cancels a mail service.
 *
 * The mail goes into the period of grace: it keeps working until the grace
 * ends and it is suspended then. The data is kept until the retention ends,
 * so nothing is deleted the moment a payment fails.
 */
export async function cancelMailService(serviceId: string, actorId?: string): Promise<{
  graceUntil: string;
  retentionUntil: string;
}> {
  const service = await prisma.mailService.findUnique({ where: { id: serviceId } });
  if (!service) throw notFound('This mail service does not exist.');
  if (service.status === 'CANCELLED') {
    return {
      graceUntil: iso(service.graceUntil) ?? new Date().toISOString(),
      retentionUntil: iso(service.retentionUntil) ?? new Date().toISOString(),
    };
  }

  const now = new Date();
  const graceUntil = new Date(now.getTime() + env.MAIL_GRACE_PERIOD_DAYS * 24 * 60 * 60 * 1000);
  const retentionUntil = new Date(now.getTime() + env.MAIL_RETENTION_DAYS * 24 * 60 * 60 * 1000);

  await prisma.mailService.update({
    where: { id: serviceId },
    data: { status: 'GRACE', cancelledAt: now, graceUntil, retentionUntil },
  });

  await audit({
    actorId,
    action: 'mail.service_cancelled',
    targetType: 'mail_service',
    targetId: serviceId,
    meta: { graceUntil: graceUntil.toISOString(), retentionUntil: retentionUntil.toISOString() },
  });

  return { graceUntil: graceUntil.toISOString(), retentionUntil: retentionUntil.toISOString() };
}

/**
 * Brings a service that is in the period of grace back to work.
 *
 * The service is only brought back when it has a domain that is proved, so a
 * customer that never proved anything does not get an empty service.
 */
export async function reactivateMailService(serviceId: string, actorId?: string): Promise<void> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: true },
  });
  if (!service) throw notFound('This mail service does not exist.');
  if (service.status !== 'GRACE' && service.status !== 'SUSPENDED' && service.status !== 'CANCELLED') {
    throw conflict('This mail service is not cancelled.');
  }
  // A service that has no domain at all cannot be brought back: there would
  // be nothing to host. A service whose domain waits for its proof can be
  // brought back: the domain stays waiting, and the customer proves it
  // afterwards.
  if (!service.domains.length) {
    throw conflict('Add a domain to this mail service before you bring it back.');
  }

  await prisma.mailService.update({
    where: { id: serviceId },
    data: {
      status: 'ACTIVE',
      cancelledAt: null,
      graceUntil: null,
      retentionUntil: null,
      suspendedAt: null,
      lastError: null,
    },
  });

  for (const domain of service.domains) {
    if (domain.ownershipStatus !== 'VERIFIED') continue;
    await mailcow.mailcowSetDomainActive(domain.name, true).catch(() => undefined);
    await prisma.mailDomain.update({ where: { id: domain.id }, data: { status: 'ACTIVE' } });
  }

  await audit({
    actorId,
    action: 'mail.service_reactivated',
    targetType: 'mail_service',
    targetId: serviceId,
  });
}

/**
 * Applies a new plan to a service.
 *
 * The limits of the service are replaced by the limits of the new plan, and
 * the domains of the service are brought in line with them. Nothing is
 * deleted: a domain that holds more mailboxes than the new plan allows stays
 * where it is and is counted as over the limit, so a customer that goes to a
 * smaller plan never loses anything.
 */
export async function applyMailPlanToService(
  serviceId: string,
  productId: string,
  actorId?: string,
): Promise<void> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: true },
  });
  if (!service) throw notFound('This mail service does not exist.');
  const product = await prisma.product.findUnique({ where: { id: productId } });
  if (!product) throw notFound('This plan does not exist.');
  if (product.fulfilment !== 'EMAIL') throw badRequest('This product is not a plan of hosted mail.');

  const limits = effectivePlanLimits(product);
  await prisma.mailService.update({
    where: { id: serviceId },
    data: {
      productId,
      maxDomains: limits.maxDomains,
      maxMailboxes: limits.maxMailboxes,
      maxAliases: limits.maxAliases,
      maxForwarding: limits.maxForwarding,
      totalStorageMb: limits.totalStorageMb,
      mailboxQuotaMb: limits.mailboxQuotaMb,
      sendLimit: limits.sendLimit,
      sendInterval: limits.sendInterval,
    },
  });

  for (const domain of service.domains) {
    await prisma.mailDomain.update({
      where: { id: domain.id },
      data: {
        maxMailboxes: limits.maxMailboxes,
        maxAliases: limits.maxAliases,
        maxForwarding: limits.maxForwarding,
        quotaMb: quotaForService(limits),
      },
    });
  }

  await audit({
    actorId,
    action: 'mail.service_plan_changed',
    targetType: 'mail_service',
    targetId: serviceId,
    meta: { productId, limits },
  });
}

/**
 * The use of a service: how many domains, mailboxes and megabytes it holds.
 */
export async function mailServiceUsage(serviceId: string): Promise<{
  domains: number;
  mailboxes: number;
  storageMb: number;
  storageLimitMb: number;
}> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: { include: { _count: { select: { mailboxes: true, aliases: true } } } } },
  });
  if (!service) throw notFound('This mail service does not exist.');
  return {
    domains: service.domains.length,
    mailboxes: service.domains.reduce((sum, domain) => sum + domain._count.mailboxes, 0),
    storageMb: service.domains.reduce((sum, domain) => sum + domain.usedMb, 0),
    storageLimitMb: service.totalStorageMb,
  };
}

/**
 * The sweep of the life of the mail services.
 *
 * A service in the period of grace is suspended when the grace ends, and a
 * suspended service is deleted when the retention ends. The data of a
 * customer is never deleted the moment a payment fails: it is kept for the
 * whole retention.
 */
export async function sweepMailServices(): Promise<{ suspended: number; deleted: number }> {
  const now = new Date();
  let suspended = 0;
  let deleted = 0;

  const inGrace = await prisma.mailService.findMany({
    where: { status: 'GRACE', graceUntil: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const service of inGrace) {
    await suspendMailService(service.id, 'The period of grace ended.').catch(() => undefined);
    suspended += 1;
  }

  const expired = await prisma.mailService.findMany({
    where: { status: { in: ['SUSPENDED', 'CANCELLED'] }, retentionUntil: { lte: now } },
    select: { id: true },
    take: 50,
  });
  for (const service of expired) {
    await deleteMailServiceData(service.id).catch(() => undefined);
    deleted += 1;
  }

  return { suspended, deleted };
}

/**
 * Deletes the data of a service when the retention has ended.
 *
 * This is the only place where the data of a mail service is deleted, and it
 * only runs when the retention of the service has ended.
 */
export async function deleteMailServiceData(serviceId: string): Promise<void> {
  const service = await prisma.mailService.findUnique({
    where: { id: serviceId },
    include: { domains: true },
  });
  if (!service) return;
  if (service.retentionUntil && service.retentionUntil.getTime() > Date.now()) {
    throw conflict('The data of this mail service is still kept. The retention has not ended.');
  }
  for (const domain of service.domains) {
    await mailcow.mailcowDeleteDomain(domain.name).catch(() => undefined);
  }
  await prisma.mailService.delete({ where: { id: serviceId } });
  await audit({
    action: 'mail.service_deleted',
    targetType: 'mail_service',
    targetId: serviceId,
    meta: { retentionEnded: true },
  });
}

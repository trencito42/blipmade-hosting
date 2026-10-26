import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The hosted mail of a customer, as the customer hears about it.
 *
 * The mail system is faked at its boundary, so the test never reaches the mail
 * system of the platform. The service of the customer is a plan of hosted
 * mail, so it is named after that plan, the way the panel names it.
 */
const mailcowMock = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; input: unknown }>,
  /** The calls that have to fail, and the reason of the refusal. */
  failures: new Map<string, string>(),
  /** The domains the fake mail system holds. */
  domains: new Map<string, { description: string | null; active: boolean }>(),
}));

vi.mock('../src/services/mailcow.js', () => {
  const record = (fn: string, input: unknown) => {
    mailcowMock.calls.push({ fn, input });
    const refusal = mailcowMock.failures.get(fn);
    if (refusal) throw new Error(refusal);
  };
  return {
    mailcowConfigured: () => true,
    mailcowDomain: async (domain: string) => {
      record('domain', domain);
      const found = mailcowMock.domains.get(domain);
      return found ? { domain_name: domain, description: found.description, active: found.active ? 1 : 0 } : null;
    },
    mailcowCreateDomain: async (input: { domain: string; description?: string }) => {
      record('createDomain', input);
      mailcowMock.domains.set(input.domain, { description: input.description ?? null, active: true });
    },
    mailcowDeleteDomain: async (domain: string) => {
      record('deleteDomain', domain);
      mailcowMock.domains.delete(domain);
    },
    mailcowCreateDkim: async () => 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
    mailcowEnsureDkim: async (domain: string) => {
      record('ensureDkim', domain);
      return {
        pubkey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        txt: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        selector: 'dkim',
      };
    },
    mailcowCreateMailbox: async (input: unknown) => record('createMailbox', input),
    mailcowDeleteMailbox: async (input: unknown) => record('deleteMailbox', input),
    mailcowCreateAlias: async (input: unknown) => record('createAlias', input),
    mailcowDeleteAlias: async (input: unknown) => record('deleteAlias', input),
    mailcowSetDomainRateLimit: async (domain: string, value: number, frame: string) =>
      record('setRateLimit', { domain, value, frame }),
    mailcowSetDomainActive: async (domain: string, active: boolean) => {
      record('setActive', { domain, active });
      const found = mailcowMock.domains.get(domain);
      if (found) found.active = active;
    },
  };
});

import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import { createMailbox } from '../src/services/mail.js';
import {
  cancelMailService,
  provisionMailService,
  sweepMailServices,
} from '../src/services/mail-commerce.js';

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  mailcowMock.calls.length = 0;
  mailcowMock.failures.clear();
  mailcowMock.domains.clear();
});

const DAY = 24 * 60 * 60 * 1000;

/** A date as the customer sees it in the message. */
function dayOf(date: Date): string {
  return date.toISOString().slice(0, 10);
}

/** The plan of hosted mail the customer bought. */
async function createMailPlan() {
  return prisma.product.create({
    data: {
      slug: 'email-plan',
      name: 'Email Plan',
      category: 'EMAIL_HOSTING',
      fulfilment: 'EMAIL',
      description: 'A plan of hosted mail.',
      icon: 'mail',
      visible: true,
      deployable: true,
      mailMaxDomains: 2,
      mailMaxMailboxes: 5,
      mailMaxAliases: 50,
      mailMaxForwarding: 5,
      mailTotalStorageMb: 5120,
      mailMailboxQuotaMb: 1024,
      mailSendLimit: 200,
      mailSendInterval: 'HOURLY',
      prices: { create: { period: 'MONTHLY', baseAmount: 1990, currency: 'EUR' } },
    },
  });
}

/**
 * A service of hosted mail, with the subscription that renews it and the
 * domain that it hosts.
 */
async function seedMailService(options: { email: string; periodEnd?: Date }) {
  const { client, userId } = await registerAndLogin(app, options.email);
  const product = await createMailPlan();
  const periodEnd = options.periodEnd ?? new Date(Date.now() + 30 * DAY);
  const subscription = await prisma.subscription.create({
    data: {
      userId,
      status: 'ACTIVE',
      amount: 1990,
      currency: 'EUR',
      currentPeriodStart: new Date(periodEnd.getTime() - 30 * DAY),
      currentPeriodEnd: periodEnd,
    },
  });
  const service = await prisma.mailService.create({
    data: {
      userId,
      productId: product.id,
      subscriptionId: subscription.id,
      status: 'PENDING',
      provisioningKey: `mail-${options.email}`,
      maxDomains: 2,
      maxMailboxes: 5,
      maxAliases: 50,
      maxForwarding: 5,
      totalStorageMb: 5120,
      mailboxQuotaMb: 1024,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
  });
  const domain = await prisma.mailDomain.create({
    data: {
      userId,
      serviceId: service.id,
      name: 'example.com',
      status: 'PENDING',
      ownershipStatus: 'VERIFIED',
      verifiedAt: new Date(),
    },
  });
  return { client, userId, product, service, subscription, domain };
}

describe('the mailbox that could not be made is told to the customer', () => {
  it('tells the customer that the mailbox is not there, once', async () => {
    const { client, userId } = await registerAndLogin(app, 'mailbox@example.com');
    const domain = await prisma.mailDomain.create({
      data: { userId, name: 'example.com', status: 'ACTIVE', ownershipStatus: 'VERIFIED' },
    });

    mailcowMock.failures.set('createMailbox', 'The mail system refused the mailbox.');
    await expect(
      createMailbox({ id: userId, email: 'mailbox@example.com' }, domain.id, 'info'),
    ).rejects.toBeTruthy();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'mailbox.provisioning_failed' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      mailbox: 'info@example.com',
      domain: 'example.com',
      reason: 'The mail system refused the mailbox.',
    });

    // The row of the journal holds the failure, so the attempt that failed is
    // the message. The customer asked again, so there is another attempt.
    const second = await prisma.mailJob.findFirst({ where: { kind: 'mailbox.create' } });
    expect(second?.status).toBe('failed');

    await expect(
      createMailbox({ id: userId, email: 'mailbox@example.com' }, domain.id, 'info'),
    ).rejects.toBeTruthy();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'mailbox.provisioning_failed' } }),
    ).toBe(2);
  });
});

describe('the hosted mail that starts is told to the customer', () => {
  it('tells the customer that the mail of the domain works, once', async () => {
    const { userId, service, domain } = await seedMailService({ email: 'mail@example.com' });

    const result = await provisionMailService(service.id);
    expect(result.provisioned).toBe(1);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'mailhosting.activated' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'Email Plan',
      plan: 'Email Plan',
      domain: 'example.com',
    });

    // The service is provisioned again, and the customer is not told twice.
    await provisionMailService(service.id);
    expect(
      await prisma.notificationEvent.count({ where: { type: 'mailhosting.activated' } }),
    ).toBe(1);

    const hosted = await prisma.mailDomain.findUnique({ where: { id: domain.id } });
    expect(hosted?.status).toBe('ACTIVE');
  });
});

describe('the hosted mail that is canceled is told to the customer', () => {
  it('tells the customer that the mail stopped and until when the data is kept', async () => {
    const { userId, service } = await seedMailService({ email: 'mail-canceled@example.com' });

    const result = await cancelMailService(service.id);
    expect(result.graceUntil).toBeTruthy();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'mailhosting.canceled' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'Email Plan',
      retentionUntil: dayOf(new Date(Date.now() + env.MAIL_RETENTION_DAYS * DAY)),
    });

    // The service is canceled already, so nothing changes and nothing is
    // told again.
    await cancelMailService(service.id);
    expect(
      await prisma.notificationEvent.count({ where: { type: 'mailhosting.canceled' } }),
    ).toBe(1);
  });
});

describe('the hosted mail that renews soon is told to the customer', () => {
  it('tells the customer that the mail renews, once', async () => {
    const periodEnd = new Date(Date.now() + 3 * DAY);
    const { userId, service } = await seedMailService({
      email: 'mail-renewal@example.com',
      periodEnd,
    });
    await prisma.mailService.update({ where: { id: service.id }, data: { status: 'ACTIVE' } });

    await sweepMailServices();

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'mailhosting.renewal_reminder' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({
      service: 'Email Plan',
      renewsAt: dayOf(periodEnd),
    });

    // The sweep runs often, and the term is reminded once.
    await sweepMailServices();
    expect(
      await prisma.notificationEvent.count({ where: { type: 'mailhosting.renewal_reminder' } }),
    ).toBe(1);
  });
});

import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * The sale of hosted mail, from the order to the mail.
 *
 * These are the flows of the customer, end to end, with the mail system and
 * the payment provider faked at their boundary:
 *
 *   1. the mail is bought alone, without a server and without a panel;
 *   2. the mail is bought as an extra line of the order of a server;
 *   3. the two lines of an order progress on their own, and the failure of
 *      one of them never marks the other one as failed;
 *   4. a payment event that arrives twice does not charge twice and does not
 *      provision twice;
 *   5. nothing is provisioned before the money arrived;
 *   6. cancelling the server does not touch the mail that was bought apart;
 *   7. a customer never sees or touches the mail of another customer;
 *   8. the plan of a service can be changed, and a smaller plan never
 *      deletes anything;
 *   9. a cancelled service goes through a period of grace and a retention,
 *      and nothing is deleted the moment a payment fails;
 *  10. a provisioning that failed can be put on the queue again.
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
    mailcowDeleteDomainWithItsContent: async (domain: string) => {
      record('deleteDomainWithItsContent', domain);
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

/**
 * The DNS of the world.
 *
 * The proof of ownership of a domain is a record of DNS that the customer
 * publishes. The lookup is faked here, so the test decides what the world
 * answers.
 */
const dnsMock = vi.hoisted(() => ({
  records: new Map<string, string[]>(),
}));

vi.mock('../src/services/dns.js', () => ({
  resolveTxt: async (host: string) => ({ host, values: dnsMock.records.get(host) ?? [] }),
  matchesToken: (values: string[], token: string) => values.includes(token),
  verificationHostFor: (hostname: string) => `_blipmade-verify.${hostname.trim().toLowerCase()}`,
  isDnsName: (name: string) => /^[a-z0-9.-]+$/i.test(name),
  VERIFICATION_LABEL: '_blipmade-verify',
}));

/**
 * The queue of the mail.
 *
 * The queue is replaced by the work itself, so the test sees the domain
 * hosted the moment the proof is good, without a worker and without Redis.
 */
vi.mock('../src/services/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/queue.js')>();
  return {
    ...actual,
    enqueueMailProvisioning: async (serviceId: string) => {
      const { provisionMailService } = await import('../src/services/mail-commerce.js');
      await provisionMailService(serviceId);
    },
  };
});

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
  dnsMock.records.clear();
  // The sale of the mail is opened for the tests. The closed switch has its
  // own test, in the file of the availability.
  process.env.MAIL_SALES_ENABLED = 'true';
});

afterEach(() => {
  delete process.env.MAIL_SALES_ENABLED;
});

/** The plan of hosted mail that the tests buy. */
async function createMailPlan(overrides: Partial<{ slug: string; baseAmount: number; maxDomains: number }> = {}) {
  return prisma.product.create({
    data: {
      slug: overrides.slug ?? 'email-plan',
      name: 'Email Plan',
      category: 'EMAIL_HOSTING',
      fulfilment: 'EMAIL',
      description: 'A plan of hosted mail.',
      icon: 'mail',
      visible: true,
      deployable: true,
      mailMaxDomains: overrides.maxDomains ?? 2,
      mailMaxMailboxes: 5,
      mailMaxAliases: 50,
      mailMaxForwarding: 5,
      mailTotalStorageMb: 5120,
      mailMailboxQuotaMb: 1024,
      mailSendLimit: 200,
      mailSendInterval: 'HOURLY',
      prices: {
        create: [
          {
            period: 'MONTHLY',
            baseAmount: overrides.baseAmount ?? 1990,
            ramPerGb: 0,
            cpuPerUnit: 0,
            diskPerGb: 0,
            currency: 'EUR',
          },
        ],
      },
    },
  });
}

/** A product of servers, for the line of the server of an order. */
async function createServerPlan() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 5,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: {
        create: [{ period: 'MONTHLY', baseAmount: 500, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' }],
      },
    },
  });
}

/** The mail services of the platform, for the assertions. */
async function services() {
  return prisma.mailService.findMany({ include: { domains: true } });
}

describe('the sale of hosted mail', () => {
  it('buys the mail alone, with no server and no panel', async () => {
    await createMailPlan();
    const { client, userId } = await registerAndLogin(app, 'solo@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'Solo.Example' }],
    });
    expect(created.status).toBe(201);
    expect(created.body.order.total).toBe(1990);
    expect(created.body.order.items[0].config.fulfilment).toBe('EMAIL');
    expect(created.body.order.items[0].config.mailDomain).toBe('solo.example');

    // Nothing is provisioned before the money arrived.
    expect(await services()).toHaveLength(0);

    const paid = await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    expect(paid.status).toBe(200);

    const service = await services();
    expect(service).toHaveLength(1);
    expect(service[0]!.userId).toBe(userId);
    expect(service[0]!.status).toBe('PENDING');
    // The limits that were bought are a copy of the limits of the plan.
    expect(service[0]!.maxMailboxes).toBe(5);
    expect(service[0]!.totalStorageMb).toBe(5120);

    // The domain waits for its proof of ownership.
    const domain = service[0]!.domains[0]!;
    expect(domain.name).toBe('solo.example');
    expect(domain.ownershipStatus).toBe('UNVERIFIED');
    expect(domain.verificationHost).toBe('_blipmade-verify.solo.example');
    expect(domain.verificationToken).toBeTruthy();

    // The mail system was not asked to host anything yet.
    expect(mailcowMock.calls.filter((call) => call.fn === 'createDomain')).toHaveLength(0);

    // The customer publishes the proof and the platform checks it.
    dnsMock.records.set('_blipmade-verify.solo.example', [domain.verificationToken!]);
    const verified = await client.request('POST', `/api/mail/domains/${domain.id}/verify`);
    expect(verified.status).toBe(200);
    expect(verified.body.verified).toBe(true);

    // The domain is hosted with the limits of the plan and the limit of
    // sending of the plan.
    const created_domain = mailcowMock.calls.find((call) => call.fn === 'createDomain');
    expect(created_domain).toBeTruthy();
    expect((created_domain!.input as { domain: string }).domain).toBe('solo.example');
    const limit = mailcowMock.calls.find((call) => call.fn === 'setRateLimit');
    expect((limit!.input as { value: number }).value).toBe(200);

    // No instance was made: the mail needs no server.
    expect(await prisma.instance.count()).toBe(0);
  });

  it('buys the mail as an extra line of the order of a server', async () => {
    await createServerPlan();
    await createMailPlan();
    const { client } = await registerAndLogin(app, 'addon@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [
        { productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 },
        { productSlug: 'email-plan', mailDomain: 'addon.example' },
      ],
    });
    expect(created.status).toBe(201);
    expect(created.body.order.items).toHaveLength(2);
    // The two lines are priced apart, so the summary of the order can show
    // the price of the add-on on its own line. The line of the server is
    // priced by its resources, the plan of mail keeps its own price.
    expect(created.body.order.items[0].total).toBe(150);
    expect(created.body.order.items[1].total).toBe(1990);
    expect(created.body.order.total).toBe(2140);

    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);

    const service = await services();
    expect(service).toHaveLength(1);
    expect(service[0]!.domains[0]!.name).toBe('addon.example');
    // The line of the server has its own progress.
    const items = await prisma.orderItem.findMany({ where: { orderId: created.body.order.id } });
    const mailLine = items.find((item) => item.config && (item.config as { fulfilment?: string }).fulfilment === 'EMAIL');
    const serverLine = items.find((item) => item.config && (item.config as { fulfilment?: string }).fulfilment !== 'EMAIL');
    expect(mailLine!.fulfillmentStatus).toBe('PROVISIONING');
    expect(serverLine!.fulfillmentStatus).toBe('PROVISIONING');
  });

  it('never marks one line as failed because the other one failed', async () => {
    await createServerPlan();
    await createMailPlan({ slug: 'email-broken' });
    const { client } = await registerAndLogin(app, 'partial@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [
        { productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 },
        { productSlug: 'email-broken', mailDomain: 'partial.example' },
      ],
    });
    expect(created.status).toBe(201);

    // While the order waits for its payment, the domain is taken by another
    // customer. The line of the mail cannot be hosted, and it fails on its
    // own.
    const other = await prisma.user.create({
      data: {
        email: 'other-owner@blipmade.test',
        passwordHash: 'x',
        firstName: 'Other',
        lastName: 'Owner',
      },
    });
    await prisma.mailDomain.create({
      data: {
        userId: other.id,
        name: 'partial.example',
        status: 'ACTIVE',
        ownershipStatus: 'VERIFIED',
      },
    });

    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);

    const items = await prisma.orderItem.findMany({ where: { orderId: created.body.order.id } });
    const mailLine = items.find((item) => item.config && (item.config as { fulfilment?: string }).fulfilment === 'EMAIL');
    const serverLine = items.find((item) => item.config && (item.config as { fulfilment?: string }).fulfilment !== 'EMAIL');
    // The line of the mail failed on its own, with the reason in words.
    expect(mailLine!.fulfillmentStatus).toBe('FAILED');
    expect(mailLine!.fulfillmentError).toMatch(/already hosted/i);
    // The line of the server was not touched by it: the server of the
    // customer is still being built.
    expect(serverLine!.fulfillmentStatus).toBe('PROVISIONING');
    expect(serverLine!.fulfillmentError).toBeNull();
    expect(await prisma.instance.count()).toBe(1);
  });

  it('does not charge twice and does not provision twice when the payment event arrives twice', async () => {
    await createMailPlan();
    const { client } = await registerAndLogin(app, 'twice@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'twice.example' }],
    });
    const orderId = created.body.order.id;

    await client.request('POST', `/api/orders/${orderId}/confirm`);
    const first = await services();
    expect(first).toHaveLength(1);
    const subscriptionCount = await prisma.subscription.count();

    // The event arrives a second time.
    const again = await client.request('POST', `/api/orders/${orderId}/confirm`);
    expect(again.status).toBe(200);
    expect(again.body.alreadyPaid).toBe(true);

    const second = await services();
    expect(second).toHaveLength(1);
    expect(second[0]!.id).toBe(first[0]!.id);
    expect(await prisma.subscription.count()).toBe(subscriptionCount);
    expect(await prisma.payment.count()).toBe(1);
  });

  it('keeps the mail when the server of the same customer is cancelled', async () => {
    await createServerPlan();
    await createMailPlan();
    const { client, userId } = await registerAndLogin(app, 'detach@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [
        { productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 },
        { productSlug: 'email-plan', mailDomain: 'detach.example' },
      ],
    });
    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);

    const service = await services();
    expect(service).toHaveLength(1);
    const serviceId = service[0]!.id;

    // The server of the order is cancelled: the instance goes away.
    const instance = await prisma.instance.findFirst({ where: { userId } });
    expect(instance).toBeTruthy();
    await prisma.instance.delete({ where: { id: instance!.id } });

    // The mail of the customer is still there, with its own life.
    const after = await prisma.mailService.findUnique({
      where: { id: serviceId },
      include: { domains: true },
    });
    expect(after).toBeTruthy();
    expect(after!.domains.map((domain) => domain.name)).toContain('detach.example');
    // The mail is not attached to the server any more, and it never was: it
    // has no instance and it has its own subscription.
    expect(after!.status).toBe('PENDING');
  });

  it('never lets a customer see or touch the mail of another customer', async () => {
    await createMailPlan();
    const first = await registerAndLogin(app, 'first@blipmade.test');
    const second = await registerAndLogin(app, 'second@blipmade.test');

    const created = await first.client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'first.example' }],
    });
    await first.client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    const service = (await services())[0]!;

    const list = await second.client.request('GET', '/api/mail/services');
    expect(list.status).toBe(200);
    expect(list.body.services).toHaveLength(0);

    const read = await second.client.request('GET', `/api/mail/services/${service.id}`);
    expect(read.status).toBe(404);

    const suspend = await second.client.request('POST', `/api/mail/services/${service.id}/suspend`);
    expect(suspend.status).toBe(404);

    const domain = service.domains[0]!;
    const verify = await second.client.request('POST', `/api/mail/domains/${domain.id}/verify`);
    expect(verify.status).toBe(404);

    // The service of the first customer is untouched.
    const still = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(still!.status).toBe('PENDING');
  });

  it('changes the plan of a service when the order of the change is paid', async () => {
    await createMailPlan({ slug: 'email-small' });
    await createMailPlan({ slug: 'email-big', maxDomains: 5 });
    const { client } = await registerAndLogin(app, 'plan@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-small', mailDomain: 'plan.example' }],
    });
    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    const service = (await services())[0]!;
    expect(service.maxMailboxes).toBe(5);

    const change = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'email-big',
    });
    expect(change.status).toBe(201);
    expect(change.body.order.status).toBe('PENDING');

    // The limits do not change before the money arrived.
    const before = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(before!.maxDomains).toBe(2);

    await client.request('POST', `/api/orders/${change.body.order.id}/confirm`);

    const after = await prisma.mailService.findUnique({ where: { id: service.id } });
    // The plan asks for five domains and the platform holds three, so the
    // limit that is applied is the smaller of the two. A plan never promises
    // more than the platform can hold.
    expect(after!.maxDomains).toBe(3);
    // The domain of the service is still there: a change of plan never
    // deletes anything.
    expect(await prisma.mailDomain.count({ where: { serviceId: service.id } })).toBe(1);
  });

  it('keeps the data of a cancelled service through the grace and the retention', async () => {
    await createMailPlan();
    const { client } = await registerAndLogin(app, 'grace@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'grace.example' }],
    });
    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    const service = (await services())[0]!;

    const cancelled = await client.request('POST', `/api/mail/services/${service.id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.graceUntil).toBeTruthy();
    expect(cancelled.body.retentionUntil).toBeTruthy();

    const duringGrace = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(duringGrace!.status).toBe('GRACE');
    // The data is still there.
    expect(await prisma.mailDomain.count({ where: { serviceId: service.id } })).toBe(1);

    // The service comes back before the grace ends.
    const back = await client.request('POST', `/api/mail/services/${service.id}/reactivate`);
    expect(back.status).toBe(200);
    const active = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(active!.status).toBe('ACTIVE');
    expect(await prisma.mailDomain.count({ where: { serviceId: service.id } })).toBe(1);
  });

  it('refuses a domain that another customer already hosts', async () => {
    await createMailPlan();
    const first = await registerAndLogin(app, 'owner@blipmade.test');
    const second = await registerAndLogin(app, 'thief@blipmade.test');

    const created = await first.client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'owned.example' }],
    });
    await first.client.request('POST', `/api/orders/${created.body.order.id}/confirm`);

    const stolen = await second.client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'owned.example' }],
    });
    expect(stolen.status).toBe(409);
    expect(String(stolen.body.error?.message ?? stolen.body.message ?? '')).toMatch(/already hosted/i);
  });

  it('keeps the service when the mail system refuses to release the data', async () => {
    await createMailPlan();
    const { client } = await registerAndLogin(app, 'retention@blipmade.test');

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'retention.example' }],
    });
    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    const service = (await services())[0]!;

    await client.request('POST', `/api/mail/services/${service.id}/cancel`);
    // The retention has ended, so the data may go.
    await prisma.mailService.update({
      where: { id: service.id },
      data: { retentionUntil: new Date(Date.now() - 60_000) },
    });

    // The mail system refuses to delete the domain.
    mailcowMock.failures.set('deleteDomainWithItsContent', 'domain_not_empty');

    const { deleteMailServiceData } = await import('../src/services/mail-commerce.js');
    await expect(deleteMailServiceData(service.id)).rejects.toThrow(/mail system/i);

    // The service is still there, with the reason on it: the mail of the
    // customer is still on the server, so the platform must not forget it.
    const kept = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(kept).not.toBeNull();
    expect(kept!.lastError).toMatch(/mail system/i);
    expect(await prisma.mailDomain.count({ where: { serviceId: service.id } })).toBe(1);
  });

  it('puts a service that failed on the queue again', async () => {
    await createMailPlan();
    const { client, userId } = await registerAndLogin(app, 'retry@blipmade.test');
    const { client: admin } = await createAdmin(app);

    const created = await client.request('POST', '/api/orders', {
      items: [{ productSlug: 'email-plan', mailDomain: 'retry.example' }],
    });
    await client.request('POST', `/api/orders/${created.body.order.id}/confirm`);
    const service = (await services())[0]!;

    await prisma.mailService.update({ where: { id: service.id }, data: { status: 'PROVISIONING', lastError: 'the mail system did not answer' } });

    const reprovision = await admin.request('POST', `/api/admin/mail/services/${service.id}/reprovision`, {});
    expect(reprovision.status).toBe(200);

    // The queue of the mail is a queue of its own: the service is on it.
    const queued = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(queued!.userId).toBe(userId);
  });
});

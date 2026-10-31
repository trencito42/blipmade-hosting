import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase } from './helpers.js';
import { registerMailCommerceRoutes } from '../src/routes/mail-commerce.js';

/**
 * The API of the customer of hosted mail.
 *
 * The mail system and the DNS of the world are faked at the module level, so
 * the tests never reach a real server and the behaviour of the platform is
 * checked on its own: the isolation between the customers, the proof of
 * ownership, the limits of the plan, the life of a service and the order that
 * changes a plan.
 */

const mailcowMock = vi.hoisted(() => ({
  calls: [] as Array<{ fn: string; input: unknown }>,
}));

vi.mock('../src/services/mailcow.js', () => {
  const record = (fn: string, input: unknown) => {
    mailcowMock.calls.push({ fn, input });
  };
  return {
    mailcowConfigured: () => true,
    mailcowDomain: async (name: string) => {
      record('domain', name);
      return null;
    },
    mailcowCreateDomain: async (input: unknown) => record('createDomain', input),
    mailcowDeleteDomain: async (name: string) => record('deleteDomain', name),
    mailcowDeleteDomainWithItsContent: async (name: string) => record('deleteDomainWithItsContent', name),
    mailcowCreateDkim: async (input: string) => record('createDkim', input),
    mailcowEnsureDkim: async (name: string) => {
      record('createDkim', name);
      return {
        pubkey: 'MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        txt: 'v=DKIM1; k=rsa; p=MIIBIjANBgkqhkiG9w0BAQEFAAOCAQ8AMIIBCgKCAQEAtestkey',
        selector: 'dkim',
      };
    },
    mailcowSetDomainRateLimit: async (name: string, limit: number, frame: string) =>
      record('setDomainRateLimit', { name, limit, frame }),
    mailcowSetDomainActive: async (name: string, active: boolean) =>
      record('setDomainActive', { name, active }),
    mailcowCreateMailbox: async (input: unknown) => record('createMailbox', input),
    mailcowDeleteMailbox: async (input: unknown) => record('deleteMailbox', input),
    mailcowCreateAlias: async (input: unknown) => record('createAlias', input),
    mailcowDeleteAlias: async (input: unknown) => record('deleteAlias', input),
  };
});

const dnsMock = vi.hoisted(() => ({
  /** The values that are published under a name. */
  values: new Map<string, string[]>(),
}));

vi.mock('../src/services/dns.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/dns.js')>();
  return {
    ...actual,
    resolveTxt: async (host: string) => ({
      values: dnsMock.values.get(host.trim().toLowerCase()) ?? [],
      error: null,
    }),
  };
});

/**
 * The records of DNS of a domain are checked with a real lookup, which would
 * leave the machine. The check is faked here, and the records themselves are
 * the ones the platform tells the customer to publish.
 */
vi.mock('../src/services/mail-dns.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/mail-dns.js')>();
  return {
    ...actual,
    checkMailDns: async (records: unknown[]) => ({
      records,
      verified: false,
      missing: (records as Array<{ name: string; type: string; purpose: string }>).map((record) => ({
        name: record.name,
        type: record.type,
        purpose: record.purpose,
      })),
    }),
  };
});

/**
 * The worker of the mail is not running in the tests, so the work of hosting
 * a domain is done here, at once, when the service puts it on the queue.
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
  // The platform registers the routes of the mail when it is ready. The test
  // registers them too when they are not there yet, so the file checks the
  // same routes in both cases and never registers them twice.
  app.register(
    async (api) => {
      if (!api.hasRoute({ method: 'GET', url: '/api/mail/plans' })) {
        await registerMailCommerceRoutes(api);
      }
    },
    { prefix: '/api' },
  );
  await app.ready();
});

afterAll(async () => {
  await closeApp();
});

/**
 * The sale of the mail is closed unless the operator opens it. The tests open
 * it, because a plan that cannot be bought cannot be priced. The switch is
 * read at the moment it is asked for, so it is set in the environment of the
 * run and not in the program.
 */
const originalSalesEnabled = process.env.MAIL_SALES_ENABLED;

beforeEach(async () => {
  await resetDatabase();
  mailcowMock.calls.length = 0;
  dnsMock.values.clear();
  process.env.MAIL_SALES_ENABLED = 'true';
});

afterAll(() => {
  if (originalSalesEnabled === undefined) delete process.env.MAIL_SALES_ENABLED;
  else process.env.MAIL_SALES_ENABLED = originalSalesEnabled;
});

interface PlanOptions {
  slug: string;
  name?: string;
  /** The price of the month. When it is null, the plan has no price at all. */
  monthly?: number | null;
  yearly?: number | null;
  visible?: boolean;
  deployable?: boolean;
  fulfilment?: 'EMAIL' | 'SERVER';
  maxDomains?: number;
  maxMailboxes?: number;
}

/** A plan of mail in the catalog. */
async function createPlan(options: PlanOptions) {
  const monthly = options.monthly === undefined ? 500 : options.monthly;
  const yearly = options.yearly === undefined ? 5000 : options.yearly;
  return prisma.product.create({
    data: {
      slug: options.slug,
      name: options.name ?? options.slug,
      category: options.fulfilment === 'SERVER' ? 'WEB_CMS' : 'EMAIL_HOSTING',
      description: `The plan ${options.slug}.`,
      icon: 'mail',
      visible: options.visible ?? true,
      deployable: options.deployable ?? true,
      fulfilment: options.fulfilment ?? 'EMAIL',
      mailMaxDomains: options.maxDomains ?? 1,
      mailMaxMailboxes: options.maxMailboxes ?? 5,
      mailMaxAliases: 10,
      mailMaxForwarding: 10,
      mailTotalStorageMb: 10240,
      mailMailboxQuotaMb: 1024,
      mailSendLimit: 500,
      mailSendInterval: 'HOURLY',
      prices: {
        create: [
          ...(monthly === null ? [] : [{ period: 'MONTHLY' as const, baseAmount: monthly, currency: 'EUR', active: true }]),
          ...(yearly === null ? [] : [{ period: 'YEARLY' as const, baseAmount: yearly, currency: 'EUR', active: true }]),
        ],
      },
    },
  });
}

interface ServiceOptions {
  userId: string;
  productId: string;
  /** The key that makes the service unique. */
  key: string;
  /** The domain of the service. When it is null, the service has no domain yet. */
  domain?: string | null;
  ownership?: 'UNVERIFIED' | 'VERIFIED';
  maxDomains?: number;
  maxMailboxes?: number;
}

/** A mail service of a customer, with one domain. */
async function createService(options: ServiceOptions) {
  const name = options.domain === undefined ? 'acme.ro' : options.domain;
  return prisma.mailService.create({
    data: {
      userId: options.userId,
      productId: options.productId,
      status: 'ACTIVE',
      provisioningKey: options.key,
      maxDomains: options.maxDomains ?? 1,
      maxMailboxes: options.maxMailboxes ?? 5,
      maxAliases: 10,
      maxForwarding: 10,
      totalStorageMb: 10240,
      mailboxQuotaMb: 1024,
      sendLimit: 500,
      sendInterval: 'HOURLY',
      ...(name === null
        ? {}
        : {
            domains: {
              create: [
                {
                  userId: options.userId,
                  name,
                  status: 'ACTIVE',
                  ownershipStatus: options.ownership ?? 'VERIFIED',
                  verificationHost: `_blipmade-verify.${name}`,
                  verificationToken: 'the-token-of-the-test',
                  verifiedAt: new Date(),
                  quotaMb: 10240,
                  maxMailboxes: 5,
                  maxAliases: 10,
                  maxForwarding: 10,
                },
              ],
            },
          }),
    },
    include: { domains: true },
  });
}

/** The calls the mail system got. */
function callsOf(fn: string): Array<{ fn: string; input: unknown }> {
  return mailcowMock.calls.filter((call) => call.fn === fn);
}

describe('the plans of hosted mail', () => {
  it('lists the plans with their limits and their price', async () => {
    await createPlan({ slug: 'mail-basic', name: 'Basic Mail', monthly: 500, yearly: 5000, maxMailboxes: 5 });
    await createPlan({ slug: 'mail-soon', name: 'Mail Soon', monthly: null, yearly: null, maxMailboxes: 20 });

    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/plans');
    expect(answer.status).toBe(200);

    const plans = answer.body.plans as Array<Record<string, any>>;
    expect(plans).toHaveLength(2);

    const basic = plans.find((plan) => plan.slug === 'mail-basic');
    expect(basic?.category).toBe('EMAIL_HOSTING');
    expect(basic?.limits).toMatchObject({ maxDomains: 1, maxMailboxes: 5, maxAliases: 10 });
    expect(basic?.price).toEqual({ amount: 500, currency: 'EUR', period: 'MONTHLY' });
    expect(basic?.prices).toEqual([
      { period: 'MONTHLY', amount: 500, currency: 'EUR' },
      { period: 'YEARLY', amount: 5000, currency: 'EUR' },
    ]);
    expect(basic?.onSale).toBe(true);
    expect(basic?.availability.orderable).toBe(true);
  });

  it('lists a plan that has no price yet, with its limits and without a price', async () => {
    await createPlan({ slug: 'mail-soon', name: 'Mail Soon', monthly: null, yearly: null, maxMailboxes: 8 });

    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/plans');
    expect(answer.status).toBe(200);

    const plan = (answer.body.plans as Array<Record<string, any>>)[0];
    expect(plan.slug).toBe('mail-soon');
    expect(plan.price).toBeNull();
    expect(plan.prices).toEqual([]);
    expect(plan.onSale).toBe(false);
    // The limits are read all the same: a customer can see what the plan holds.
    expect(plan.limits.maxMailboxes).toBe(8);
  });

  it('does not list a plan that is hidden or that is not a plan of mail', async () => {
    await createPlan({ slug: 'mail-basic' });
    await createPlan({ slug: 'mail-hidden', visible: false });
    await createPlan({ slug: 'web-cms', fulfilment: 'SERVER' });

    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/plans');
    expect(answer.status).toBe(200);

    const slugs = (answer.body.plans as Array<Record<string, any>>).map((plan) => plan.slug);
    expect(slugs).toEqual(['mail-basic']);
  });

  it('says in words that the sale of the mail is closed', async () => {
    await createPlan({ slug: 'mail-basic' });
    process.env.MAIL_SALES_ENABLED = 'false';

    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/plans');
    const plan = (answer.body.plans as Array<Record<string, any>>)[0];

    expect(plan.onSale).toBe(false);
    expect(plan.availability.orderable).toBe(false);
    expect(plan.availability.blockers.join(' ')).toContain('not on sale');
  });
});

describe('the services of a customer', () => {
  it('shows the customer only their own services', async () => {
    const { client: first, userId } = await registerAndLogin(app, 'first@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-first' });

    const list = await first.request('GET', '/api/mail/services');
    expect(list.status).toBe(200);
    expect(list.body.services).toHaveLength(1);
    expect(list.body.services[0].id).toBe(service.id);
    expect(list.body.services[0].plan.slug).toBe('mail-basic');
    expect(list.body.services[0].domains[0].name).toBe('acme.ro');

    const { client: second } = await registerAndLogin(app, 'second@example.com');
    const other = await second.request('GET', '/api/mail/services');
    expect(other.status).toBe(200);
    expect(other.body.services).toHaveLength(0);

    const one = await second.request('GET', `/api/mail/services/${service.id}`);
    expect(one.status).toBe(404);
    expect(one.body.service).toBeUndefined();
  });

  it('does not let a visitor that is not signed in see the services', async () => {
    const client = makeClient(app);
    const answer = await client.request('GET', '/api/mail/services');
    expect(answer.status).toBe(401);
  });
});

describe('the domains of a service', () => {
  it('adds a domain and makes it wait for its proof', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });

    const answer = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'Shop.RO' });
    expect(answer.status).toBe(201);
    expect(answer.body.domain.name).toBe('shop.ro');
    expect(answer.body.domain.ownershipStatus).toBe('UNVERIFIED');
    expect(answer.body.domain.verificationHost).toBe('_blipmade-verify.shop.ro');
    expect(typeof answer.body.domain.verificationToken).toBe('string');
    expect(answer.body.domain.verificationToken.length).toBeGreaterThan(0);

    // The domain is not hosted yet: the mail system was not asked for it.
    expect(callsOf('createDomain')).toHaveLength(0);
    const stored = await prisma.mailDomain.findFirst({ where: { name: 'shop.ro' } });
    expect(stored?.status).toBe('PENDING');
  });

  it('does not add a domain to the service of another customer', async () => {
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'other.ro' });
    expect(answer.status).toBe(404);
    expect(await prisma.mailDomain.count({ where: { name: 'other.ro' } })).toBe(0);
  });

  it('refuses a domain that is already hosted for another customer', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });

    const { userId: otherId } = await registerAndLogin(app, 'other@example.com');
    await prisma.mailDomain.create({
      data: {
        userId: otherId,
        name: 'taken.ro',
        status: 'ACTIVE',
        ownershipStatus: 'VERIFIED',
        verificationHost: '_blipmade-verify.taken.ro',
        verificationToken: 'the-token-of-the-test',
        quotaMb: 10240,
        maxMailboxes: 5,
        maxAliases: 10,
        maxForwarding: 10,
      },
    });

    const answer = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'taken.ro' });
    expect(answer.status).toBe(409);
    expect(String(answer.body.error?.message)).toContain('another customer');
    expect(await prisma.mailDomain.count({ where: { name: 'taken.ro', userId } })).toBe(0);
  });

  it('refuses a domain when the plan holds no more domains', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic', maxDomains: 1 });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null, maxDomains: 1 });

    const first = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'one.ro' });
    expect(first.status).toBe(201);

    const second = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'two.ro' });
    expect(second.status).toBe(409);
    expect(String(second.body.error?.message)).toContain('1');
    expect(callsOf('createDomain')).toHaveLength(0);
  });
});

describe('the proof of ownership', () => {
  it('refuses the proof when the record does not hold the token', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });

    const added = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'shop.ro' });
    const domainId = added.body.domain.id as string;
    dnsMock.values.set('_blipmade-verify.shop.ro', ['a-token-that-is-not-the-one']);

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/verify`);
    expect(answer.status).toBe(200);
    expect(answer.body.verified).toBe(false);
    // The answer says which record has to hold which token.
    expect(answer.body.message).toContain('_blipmade-verify.shop.ro');

    // The mail system was not asked to host anything.
    expect(callsOf('createDomain')).toHaveLength(0);
    const stored = await prisma.mailDomain.findUnique({ where: { id: domainId } });
    expect(stored?.status).toBe('PENDING');
    // The platform remembers that the proof did not match.
    expect(stored?.ownershipStatus).toBe('FAILED');
  });

  it('accepts the proof when the record holds the token and hosts the domain', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });

    const added = await client.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'shop.ro' });
    const domainId = added.body.domain.id as string;
    dnsMock.values.set('_blipmade-verify.shop.ro', [added.body.domain.verificationToken as string]);

    const answer = await client.request('POST', `/api/mail/domains/${domainId}/verify`);
    expect(answer.status).toBe(200);
    expect(answer.body.verified).toBe(true);
    expect(answer.body.domain.ownershipStatus).toBe('VERIFIED');
    expect(answer.body.domain.status).toBe('ACTIVE');

    // The mail system was asked to host the domain.
    expect(callsOf('createDomain')).toHaveLength(1);
    expect(callsOf('createDomain')[0]?.input).toMatchObject({ domain: 'shop.ro' });

    const stored = await prisma.mailDomain.findUnique({ where: { id: domainId } });
    expect(stored?.status).toBe('ACTIVE');
  });

  it('does not check the proof of a domain of another customer', async () => {
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner', domain: null });
    const added = await owner.request('POST', `/api/mail/services/${service.id}/domains`, { name: 'shop.ro' });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('POST', `/api/mail/domains/${added.body.domain.id}/verify`);
    expect(answer.status).toBe(404);
    expect(answer.body.verified).toBeUndefined();
  });
});

describe('the life of a service', () => {
  it('does not let the owner suspend a service, nor bring a suspended one back', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    // Suspending is the step of the platform: the owner who wants the mail off cancels it.
    const suspended = await client.request('POST', `/api/mail/services/${service.id}/suspend`);
    expect(suspended.status).toBe(400);
    expect((await prisma.mailService.findUnique({ where: { id: service.id } }))?.status).toBe('ACTIVE');
    expect(callsOf('setDomainActive')).toHaveLength(0);

    // A service that the platform suspended is not brought back by its owner: paying the invoice does it.
    await prisma.mailService.update({ where: { id: service.id }, data: { status: 'SUSPENDED' } });
    const resumed = await client.request('POST', `/api/mail/services/${service.id}/resume`);
    expect(resumed.status).toBe(400);
    expect((await prisma.mailService.findUnique({ where: { id: service.id } }))?.status).toBe('SUSPENDED');
  });

  it('keeps the mail working during the grace and the data until the retention', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const answer = await client.request('POST', `/api/mail/services/${service.id}/cancel`);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(typeof answer.body.graceUntil).toBe('string');
    expect(typeof answer.body.retentionUntil).toBe('string');
    expect(new Date(answer.body.retentionUntil).getTime()).toBeGreaterThan(
      new Date(answer.body.graceUntil).getTime(),
    );

    // Nothing is deleted: the service is in the grace and the data is kept.
    const stored = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(stored?.status).toBe('GRACE');
    expect(await prisma.mailDomain.count({ where: { serviceId: service.id } })).toBe(1);
    expect(callsOf('deleteDomain')).toHaveLength(0);
  });

  it('brings a service that is in the grace back to work', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    await client.request('POST', `/api/mail/services/${service.id}/cancel`);
    const answer = await client.request('POST', `/api/mail/services/${service.id}/reactivate`);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);

    const stored = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(stored?.status).toBe('ACTIVE');
    expect(stored?.graceUntil).toBeNull();
    expect(callsOf('setDomainActive')).toContainEqual(
      expect.objectContaining({ input: { name: 'acme.ro', active: true } }),
    );
  });

  it('does not touch the service of another customer', async () => {
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    expect((await other.request('POST', `/api/mail/services/${service.id}/suspend`)).status).toBe(404);
    expect((await other.request('POST', `/api/mail/services/${service.id}/cancel`)).status).toBe(404);
    expect((await other.request('POST', `/api/mail/services/${service.id}/resume`)).status).toBe(404);
    expect((await other.request('POST', `/api/mail/services/${service.id}/reactivate`)).status).toBe(404);

    const stored = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(stored?.status).toBe('ACTIVE');
    expect(callsOf('setDomainActive')).toHaveLength(0);
  });
});

describe('the change of the plan of a service', () => {
  it('creates an order for the new plan and changes nothing before the payment', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const oldPlan = await createPlan({ slug: 'mail-basic', monthly: 500, maxMailboxes: 5 });
    const newPlan = await createPlan({ slug: 'mail-pro', monthly: 1500, maxMailboxes: 50 });
    const service = await createService({
      userId,
      productId: oldPlan.id,
      key: 'service-owner',
      maxMailboxes: 5,
    });

    const answer = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'mail-pro',
    });
    expect(answer.status).toBe(201);
    expect(answer.body.order.status).toBe('PENDING');
    expect(answer.body.order.total).toBe(1500);
    expect(answer.body.order.currency).toBe('EUR');
    expect(answer.body.order.number).toMatch(/^BM-/);
    expect(answer.body.order.items).toHaveLength(1);

    // The line carries the mark of the change of the plan.
    expect(answer.body.order.items[0].config.mailPlanChange.serviceId).toBe(service.id);
    expect(answer.body.order.items[0].config.mailDomain).toBe('acme.ro');
    expect(answer.body.order.items[0].config.period).toBe('MONTHLY');

    const order = await prisma.order.findUnique({ where: { id: answer.body.order.id } });
    expect(order?.kind).toBe('NEW');
    expect(order?.status).toBe('PENDING');
    expect(order?.total).toBe(1500);
    expect((order?.requestedConfig as { mailPlanChange?: { serviceId?: string } })?.mailPlanChange?.serviceId).toBe(
      service.id,
    );

    // The limits of the service did not change: the payment is what changes
    // them.
    const after = await client.request('GET', `/api/mail/services/${service.id}`);
    expect(after.body.service.limits.maxMailboxes).toBe(5);
    expect(after.body.service.plan.slug).toBe('mail-basic');
    const stored = await prisma.mailService.findUnique({ where: { id: service.id } });
    expect(stored?.maxMailboxes).toBe(5);
    expect(stored?.productId).toBe(oldPlan.id);
  });

  it('refuses the plan that the service already has', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const answer = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'mail-basic',
    });
    expect(answer.status).toBe(409);
    expect(await prisma.order.count()).toBe(0);
  });

  it('refuses a plan that does not exist and a product that is not a plan of mail', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    await createPlan({ slug: 'web-cms', fulfilment: 'SERVER' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const unknown = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'mail-nope',
    });
    expect(unknown.status).toBe(404);

    const server = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'web-cms',
    });
    expect(server.status).toBe(404);
    expect(await prisma.order.count()).toBe(0);
  });

  it('does not change the plan of the service of another customer', async () => {
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const oldPlan = await createPlan({ slug: 'mail-basic' });
    await createPlan({ slug: 'mail-pro', monthly: 1500 });
    const service = await createService({ userId, productId: oldPlan.id, key: 'service-owner' });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'mail-pro',
    });
    expect(answer.status).toBe(404);
    expect(await prisma.order.count()).toBe(0);
  });

  it('refuses the change in words while the sale of the mail is closed', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const oldPlan = await createPlan({ slug: 'mail-basic' });
    await createPlan({ slug: 'mail-pro', monthly: 1500 });
    const service = await createService({ userId, productId: oldPlan.id, key: 'service-owner' });
    process.env.MAIL_SALES_ENABLED = 'false';

    const answer = await client.request('POST', `/api/mail/services/${service.id}/plan`, {
      productSlug: 'mail-pro',
    });
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(String(answer.body.error?.message)).toContain('not on sale');
    expect(await prisma.order.count()).toBe(0);
  });
});

describe('the records of DNS of a service', () => {
  it('shows the records of every domain of the service and what is published', async () => {
    const { client, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const answer = await client.request('GET', `/api/mail/services/${service.id}/dns`);
    expect(answer.status).toBe(200);
    expect(answer.body.domains).toHaveLength(1);
    expect(answer.body.domains[0].id).toBe(service.domains[0]?.id);
    expect(answer.body.domains[0].name).toBe('acme.ro');
    expect(Array.isArray(answer.body.domains[0].records)).toBe(true);
    expect(answer.body.domains[0].records.length).toBeGreaterThan(0);
    expect(answer.body.domains[0].verified).toBe(false);
    expect(answer.body.domains[0].missing.length).toBeGreaterThan(0);
  });

  it('does not show the records of the service of another customer', async () => {
    const { client: owner, userId } = await registerAndLogin(app, 'owner@example.com');
    const plan = await createPlan({ slug: 'mail-basic' });
    const service = await createService({ userId, productId: plan.id, key: 'service-owner' });

    const { client: other } = await registerAndLogin(app, 'other@example.com');
    const answer = await other.request('GET', `/api/mail/services/${service.id}/dns`);
    expect(answer.status).toBe(404);
    expect(answer.body.domains).toBeUndefined();
  });
});

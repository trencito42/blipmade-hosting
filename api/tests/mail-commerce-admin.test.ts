import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { hashPassword } from '../src/lib/password.js';
import { registerAdminMailPlansRoutes } from '../src/routes/admin-mail-plans.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The back office of the sale of hosted mail.
 *
 * The mail system and the queue of the mail are faked at the module level, so
 * the tests never reach a real mail server and never wait for a real queue:
 * what is checked here is the work of the back office itself.
 */

const mailcowMock = vi.hoisted(() => ({
  version: '55982ac',
  domains: [] as unknown[],
  /** The calls that have to fail, and the reason of the refusal. */
  failures: new Map<string, string>(),
}));

vi.mock('../src/services/mailcow.js', () => {
  const refuse = (fn: string) => {
    const reason = mailcowMock.failures.get(fn);
    if (reason) throw new Error(reason);
  };
  return {
    mailcowConfigured: () => true,
    mailcowVersion: async () => {
      refuse('version');
      return mailcowMock.version;
    },
    mailcowDisk: async () => {
      refuse('disk');
      return { used: '6.6G', total: '127G', usedPercent: '6%' };
    },
    mailcowDomains: async () => {
      refuse('domains');
      return mailcowMock.domains;
    },
    mailcowDomain: async () => null,
    mailcowCreateDomain: async (input: unknown) => input,
    mailcowDeleteDomain: async (input: unknown) => input,
    mailcowSetDomainActive: async (input: unknown) => input,
    mailcowSetDomainRateLimit: async (input: unknown) => input,
    mailcowEnsureDkim: async () => ({
      pubkey: 'thekey',
      txt: 'v=DKIM1; k=rsa; p=thekey',
      selector: 'dkim',
    }),
    mailcowCreateDkim: async () => 'thekey',
    mailcowCreateMailbox: async (input: unknown) => input,
    mailcowDeleteMailbox: async (input: unknown) => input,
    mailcowCreateAlias: async (input: unknown) => input,
    mailcowDeleteAlias: async (input: unknown) => input,
    mailcowMailboxes: async () => [],
    mailcowAliases: async () => [],
  };
});

const queueMock = vi.hoisted(() => ({
  calls: [] as Array<{ serviceId: string; options: Record<string, unknown> }>,
}));

vi.mock('../src/services/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/queue.js')>();
  return {
    ...actual,
    enqueueMailProvisioning: async (
      serviceId: string,
      options: { reason?: string; requestedBy?: string } = {},
    ) => {
      queueMock.calls.push({ serviceId, options: options as Record<string, unknown> });
    },
  };
});

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
  // The platform registers the back office of the mail when it is ready. The
  // test registers it too when it is not there yet: the plugin of the test
  // boots after the plugin of the platform, so the routes of the platform are
  // already known when the test looks for them and they are never registered
  // twice.
  app.register(
    async (api) => {
      if (app.hasRoute({ method: 'GET', url: '/api/admin/mail/plans' })) return;
      try {
        await registerAdminMailPlansRoutes(api);
      } catch (error) {
        // The platform registered the same route at the same time. The first
        // registration is the one that counts and the second one is refused.
        if ((error as { code?: string }).code !== 'FST_ERR_DUPLICATED_ROUTE') throw error;
      }
    },
    { prefix: '/api' },
  );
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  mailcowMock.version = '55982ac';
  mailcowMock.domains = [];
  mailcowMock.failures.clear();
  queueMock.calls.length = 0;
});

/** Creates a staff member with the given permissions and logs them in. */
async function createStaff(
  email: string,
  permissions: string[],
): Promise<{ client: TestClient; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'STAFF',
      firstName: 'Test',
      lastName: 'Staff',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });

  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return { client, userId: user.id };
}

/** The body of a plan of hosted mail, with the prices of the operator. */
function planBody(overrides: Record<string, unknown> = {}): Record<string, unknown> {
  return {
    slug: 'mail-basic',
    name: 'Mail Basic',
    description: 'A small plan of hosted mail for a single domain.',
    maxDomains: 1,
    maxMailboxes: 5,
    maxAliases: 20,
    maxForwarding: 2,
    totalStorageMb: 2048,
    mailboxQuotaMb: 512,
    sendLimit: 200,
    sendInterval: 'HOURLY',
    prices: [
      { period: 'MONTHLY', amount: 500, currency: 'EUR' },
      { period: 'YEARLY', amount: 5000, currency: 'EUR' },
    ],
    ...overrides,
  };
}

/** Creates a plan of hosted mail through the back office. */
async function createPlan(client: TestClient, overrides: Record<string, unknown> = {}) {
  return client.request('POST', '/api/admin/mail/plans', planBody(overrides));
}

/**
 * A mail service of a customer, with a proved domain and a mailbox.
 *
 * The service is written down directly: what is tested here is the back
 * office, not the order that creates a service. The name of the domain is
 * given, because the address of a mailbox is unique in the platform.
 */
async function createService(
  userId: string,
  productId: string,
  key = 'order:1:item:1',
  domain = 'acme.ro',
): Promise<string> {
  const service = await prisma.mailService.create({
    data: {
      userId,
      productId,
      status: 'ACTIVE',
      provisioningKey: key,
      maxDomains: 1,
      maxMailboxes: 5,
      maxAliases: 20,
      maxForwarding: 2,
      totalStorageMb: 2048,
      mailboxQuotaMb: 512,
      sendLimit: 200,
      sendInterval: 'HOURLY',
    },
  });
  const row = await prisma.mailDomain.create({
    data: {
      userId,
      serviceId: service.id,
      name: domain,
      status: 'ACTIVE',
      ownershipStatus: 'VERIFIED',
      verificationHost: `_blipmade-verify.${domain}`,
      verificationToken: 'thetokenofthecustomer',
      verifiedAt: new Date(),
      quotaMb: 2048,
      usedMb: 120,
      maxMailboxes: 5,
      maxAliases: 20,
      maxForwarding: 2,
    },
  });
  await prisma.mailbox.create({
    data: {
      domainId: row.id,
      localPart: 'contact',
      address: `contact@${domain}`,
      usedMb: 12,
    },
  });
  return service.id;
}

describe('the plans of hosted mail in the back office', () => {
  it('creates a plan with its limits and its prices and shows it in the list', async () => {
    const { client: admin } = await createAdmin(app);

    const created = await createPlan(admin);
    expect(created.status).toBe(201);
    expect(created.body.plan.slug).toBe('mail-basic');
    expect(created.body.plan.visible).toBe(true);
    expect(created.body.plan.deployable).toBe(false);
    expect(created.body.plan.limits.maxDomains).toBe(1);
    expect(created.body.plan.limits.maxMailboxes).toBe(5);
    expect(created.body.plan.limits.sendLimit).toBe(200);
    expect(created.body.plan.limits.sendInterval).toBe('HOURLY');
    expect(created.body.plan.catalogLimits.maxDomains).toBe(1);
    expect(created.body.plan.prices).toHaveLength(2);
    const monthly = created.body.plan.prices.find((price: { period: string }) => price.period === 'MONTHLY');
    expect(monthly.amount).toBe(500);
    expect(monthly.currency).toBe('EUR');
    expect(monthly.active).toBe(true);

    const list = await admin.request('GET', '/api/admin/mail/plans');
    expect(list.status).toBe(200);
    expect(list.body.plans).toHaveLength(1);
    expect(list.body.plans[0].slug).toBe('mail-basic');
    expect(list.body.plans[0].services).toBe(0);
    expect(list.body.plans[0].customers).toBe(0);
  });

  it('refuses a slug that is already taken', async () => {
    const { client: admin } = await createAdmin(app);
    expect((await createPlan(admin)).status).toBe(201);

    const again = await createPlan(admin, { name: 'Another name' });
    expect(again.status).toBe(409);
  });

  it('changes the limits and the prices of a plan and the change is visible', async () => {
    const { client: admin } = await createAdmin(app);
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;

    const patched = await admin.request('PATCH', `/api/admin/mail/plans/${id}`, {
      name: 'Mail Basic Plus',
      maxMailboxes: 9,
      prices: [{ period: 'MONTHLY', amount: 750, currency: 'EUR' }],
    });
    expect(patched.status).toBe(200);
    expect(patched.body.plan.name).toBe('Mail Basic Plus');
    expect(patched.body.plan.limits.maxMailboxes).toBe(9);
    expect(patched.body.plan.catalogLimits.maxMailboxes).toBe(9);

    // The price of the month changed and the price of the year was left alone.
    const prices = patched.body.plan.prices as Array<{ period: string; amount: number }>;
    expect(prices.find((price) => price.period === 'MONTHLY')?.amount).toBe(750);
    expect(prices.find((price) => price.period === 'YEARLY')?.amount).toBe(5000);

    const list = await admin.request('GET', '/api/admin/mail/plans');
    expect(list.body.plans[0].limits.maxMailboxes).toBe(9);
  });

  it('takes a plan off sale without deleting it and says why in words', async () => {
    const { client: admin } = await createAdmin(app);
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;

    const taken = await admin.request('PATCH', `/api/admin/mail/plans/${id}`, { deployable: false });
    expect(taken.status).toBe(200);
    expect(taken.body.plan.deployable).toBe(false);
    expect(taken.body.plan.visible).toBe(true);
    expect(taken.body.plan.availability.orderable).toBe(false);
    expect(String(taken.body.plan.availability.blockers.join(' '))).toMatch(/sale/i);

    // The plan is still there, it is simply not sold any more.
    const list = await admin.request('GET', '/api/admin/mail/plans');
    expect(list.body.plans).toHaveLength(1);
  });

  it('accepts a draft that asks for more than the ceiling and caps it', async () => {
    const { client: admin } = await createAdmin(app);
    const tooMany = env.MAIL_MAX_DOMAINS_PER_CUSTOMER + 5;

    const draft = await createPlan(admin, { slug: 'mail-huge', maxDomains: tooMany });
    expect(draft.status).toBe(201);
    // The draft records the intent...
    expect(draft.body.plan.catalogLimits.maxDomains).toBe(tooMany);
    // ...and the limits that are really applied are the ceiling.
    expect(draft.body.plan.limits.maxDomains).toBe(env.MAIL_MAX_DOMAINS_PER_CUSTOMER);
    expect(draft.body.plan.ceiling.maxDomains).toBe(env.MAIL_MAX_DOMAINS_PER_CUSTOMER);
    expect(draft.body.plan.cappedByPlatform).toBe(true);
  });

  it('refuses to put on sale a plan that asks for more than the ceiling', async () => {
    const { client: admin } = await createAdmin(app);
    const tooMany = env.MAIL_MAX_DOMAINS_PER_CUSTOMER + 5;

    const draft = await createPlan(admin, { slug: 'mail-huge', maxDomains: tooMany });
    expect(draft.status).toBe(201);
    const id = draft.body.plan.id as string;

    const onSale = await admin.request('PATCH', `/api/admin/mail/plans/${id}`, { deployable: true });
    expect(onSale.status).toBe(400);
    expect(String(onSale.body.error?.message)).toContain('holds at most');
    expect(String(onSale.body.error?.message)).toContain(String(env.MAIL_MAX_DOMAINS_PER_CUSTOMER));

    // The plan was not changed: the refusal leaves it as it was.
    const row = await prisma.product.findUnique({ where: { id } });
    expect(row?.deployable).toBe(false);
  });

  it('refuses to create on sale a plan that asks for more than the ceiling', async () => {
    const { client: admin } = await createAdmin(app);

    const answer = await createPlan(admin, {
      slug: 'mail-huge',
      deployable: true,
      maxDomains: env.MAIL_MAX_DOMAINS_PER_CUSTOMER + 5,
    });
    expect(answer.status).toBe(400);
    expect(String(answer.body.error?.message)).toContain('holds at most');
    expect(await prisma.product.count({ where: { slug: 'mail-huge' } })).toBe(0);
  });

  it('refuses to put on sale a plan that has no price', async () => {
    const { client: admin } = await createAdmin(app);

    const draft = await createPlan(admin, { slug: 'mail-draft', prices: [] });
    expect(draft.status).toBe(201);
    expect(draft.body.plan.prices).toHaveLength(0);

    const id = draft.body.plan.id as string;
    const onSale = await admin.request('PATCH', `/api/admin/mail/plans/${id}`, { deployable: true });
    expect(onSale.status).toBe(400);
    expect(String(onSale.body.error?.message)).toMatch(/price/i);
  });

  it('refuses to delete a plan that a customer bought', async () => {
    const { client: admin } = await createAdmin(app);
    const { client: customer, userId: customerId } = await registerAndLogin(app, 'owner@example.com');
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;
    await createService(customerId, id);

    const answer = await admin.request('DELETE', `/api/admin/mail/plans/${id}`);
    expect(answer.status).toBe(409);
    expect(String(answer.body.error?.message)).toMatch(/bought/i);
    expect(await prisma.product.count({ where: { id } })).toBe(1);
    expect(customer).toBeTruthy();
  });

  it('deletes a plan that nobody bought, with its prices', async () => {
    const { client: admin } = await createAdmin(app);
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;

    const answer = await admin.request('DELETE', `/api/admin/mail/plans/${id}`);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(await prisma.product.count({ where: { id } })).toBe(0);
    expect(await prisma.productPrice.count({ where: { productId: id } })).toBe(0);
  });

  it('counts the customers and the services of every plan', async () => {
    const { client: admin } = await createAdmin(app);
    const { userId: first } = await registerAndLogin(app, 'first@example.com');
    const { userId: second } = await registerAndLogin(app, 'second@example.com');
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;
    await createService(first, id, 'order:1:item:1', 'one.ro');
    await createService(second, id, 'order:2:item:1', 'two.ro');

    const list = await admin.request('GET', '/api/admin/mail/plans');
    expect(list.body.plans[0].customers).toBe(2);
    expect(list.body.plans[0].services).toBe(2);
  });
});

describe('the mail services in the back office', () => {
  it('shows the customer, the plan, the state and the use of every service', async () => {
    const { client: admin } = await createAdmin(app);
    const { userId: customerId } = await registerAndLogin(app, 'owner@example.com');
    const created = await createPlan(admin);
    await createService(customerId, created.body.plan.id as string);

    const list = await admin.request('GET', '/api/admin/mail/services');
    expect(list.status).toBe(200);
    expect(list.body.services).toHaveLength(1);
    const service = list.body.services[0];
    expect(service.customer.email).toBe('owner@example.com');
    expect(service.plan.slug).toBe('mail-basic');
    expect(service.status).toBe('ACTIVE');
    expect(service.usage.domains).toBe(1);
    expect(service.usage.mailboxes).toBe(1);
    expect(service.usage.storageMb).toBe(120);
    expect(service.usage.storageLimitMb).toBe(2048);
    expect(service.life.graceUntil).toBeNull();
    expect(service.life.retentionUntil).toBeNull();
    expect(list.body.nextCursor).toBeNull();
  });

  it('shows one service with its domains and never shows the token of the proof', async () => {
    const { client: admin } = await createAdmin(app);
    const { userId: customerId } = await registerAndLogin(app, 'owner@example.com');
    const created = await createPlan(admin);
    const id = await createService(customerId, created.body.plan.id as string);

    const answer = await admin.request('GET', `/api/admin/mail/services/${id}`);
    expect(answer.status).toBe(200);
    expect(answer.body.service.customer.email).toBe('owner@example.com');
    expect(answer.body.domains).toHaveLength(1);
    expect(answer.body.domains[0].name).toBe('acme.ro');
    expect(answer.body.domains[0].mailboxes).toBe(1);
    expect(JSON.stringify(answer.body)).not.toContain('thetokenofthecustomer');
  });

  it('does not show a service that does not exist', async () => {
    const { client: admin } = await createAdmin(app);
    const answer = await admin.request('GET', '/api/admin/mail/services/does-not-exist');
    expect(answer.status).toBe(404);
  });

  it('suspends a service, brings it back, cancels it and brings it back from the grace', async () => {
    const { client: admin, userId: adminId } = await createAdmin(app);
    const { userId: customerId } = await registerAndLogin(app, 'owner@example.com');
    const created = await createPlan(admin);
    const id = await createService(customerId, created.body.plan.id as string);

    const suspended = await admin.request('POST', `/api/admin/mail/services/${id}/suspend`, {
      reason: 'The customer asked for it.',
    });
    expect(suspended.status).toBe(200);
    expect(suspended.body.ok).toBe(true);
    let row = await prisma.mailService.findUnique({ where: { id } });
    expect(row?.status).toBe('SUSPENDED');
    expect(row?.suspendedAt).toBeTruthy();

    const entry = await prisma.auditLog.findFirst({ where: { action: 'mail.service_suspended' } });
    expect(entry?.actorId).toBe(adminId);

    const resumed = await admin.request('POST', `/api/admin/mail/services/${id}/resume`);
    expect(resumed.status).toBe(200);
    row = await prisma.mailService.findUnique({ where: { id } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.suspendedAt).toBeNull();

    const cancelled = await admin.request('POST', `/api/admin/mail/services/${id}/cancel`);
    expect(cancelled.status).toBe(200);
    expect(cancelled.body.ok).toBe(true);
    expect(cancelled.body.graceUntil).toBeTruthy();
    expect(cancelled.body.retentionUntil).toBeTruthy();
    row = await prisma.mailService.findUnique({ where: { id } });
    expect(row?.status).toBe('GRACE');

    const reactivated = await admin.request('POST', `/api/admin/mail/services/${id}/reactivate`);
    expect(reactivated.status).toBe(200);
    row = await prisma.mailService.findUnique({ where: { id } });
    expect(row?.status).toBe('ACTIVE');
    expect(row?.graceUntil).toBeNull();
    expect(row?.retentionUntil).toBeNull();
  });

  it('puts a service on the queue of the mail when it is asked for', async () => {
    const { client: admin, userId: adminId } = await createAdmin(app);
    const { userId: customerId } = await registerAndLogin(app, 'owner@example.com');
    const created = await createPlan(admin);
    const id = await createService(customerId, created.body.plan.id as string);

    const answer = await admin.request('POST', `/api/admin/mail/services/${id}/reprovision`);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(queueMock.calls).toHaveLength(1);
    expect(queueMock.calls[0].serviceId).toBe(id);
    expect(queueMock.calls[0].options.reason).toBe('requested by the operator');
    expect(queueMock.calls[0].options.requestedBy).toBe(adminId);

    const entry = await prisma.auditLog.findFirst({ where: { action: 'mail.service_reprovisioned' } });
    expect(entry?.actorId).toBe(adminId);
  });

  it('answers with the use of the whole platform', async () => {
    const { client: admin } = await createAdmin(app);
    const { userId: first } = await registerAndLogin(app, 'first@example.com');
    const { userId: second } = await registerAndLogin(app, 'second@example.com');
    const created = await createPlan(admin);
    const id = created.body.plan.id as string;
    await createService(first, id, 'order:1:item:1', 'one.ro');
    await createService(second, id, 'order:2:item:2', 'two.ro');
    await prisma.mailService.update({
      where: { provisioningKey: 'order:2:item:2' },
      data: { status: 'GRACE' },
    });

    const answer = await admin.request('GET', '/api/admin/mail/usage');
    expect(answer.status).toBe(200);
    expect(answer.body.services).toBe(2);
    expect(answer.body.domains).toBe(2);
    expect(answer.body.mailboxes).toBe(2);
    expect(answer.body.storageMb).toBe(240);
    expect(answer.body.byState.ACTIVE).toBe(1);
    expect(answer.body.byState.GRACE).toBe(1);
    expect(answer.body.byState.SUSPENDED).toBe(0);
    expect(answer.body.sending.platform.limit).toBe(env.MAIL_MAX_SEND_LIMIT);
    expect(answer.body.health.reachable).toBe(true);
    expect(answer.body.health.version).toBe('55982ac');
  });

  it('says in words that the mail system did not answer', async () => {
    const { client: admin } = await createAdmin(app);
    mailcowMock.failures.set('version', 'the mail system did not answer');

    const answer = await admin.request('GET', '/api/admin/mail/usage');
    expect(answer.status).toBe(200);
    expect(answer.body.health.reachable).toBe(false);
    expect(answer.body.health.version).toBeNull();
    expect(String(answer.body.health.message)).toContain('did not answer');
  });
});

describe('the permissions of the back office of the mail', () => {
  it('refuses a staff member without mail.write on a write', async () => {
    const { client: staff } = await createStaff('reader@blipmade.test', ['mail.read']);

    const answer = await staff.request('POST', '/api/admin/mail/plans', planBody());
    expect(answer.status).toBe(403);
    expect(answer.body.error.code).toBe('forbidden');
    expect(await prisma.product.count({ where: { slug: 'mail-basic' } })).toBe(0);
  });

  it('refuses a staff member without mail.read on a read', async () => {
    const { client: staff } = await createStaff('writer@blipmade.test', ['mail.write']);

    const answer = await staff.request('GET', '/api/admin/mail/plans');
    expect(answer.status).toBe(403);
    expect(answer.body.error.code).toBe('forbidden');
  });

  it('lets a staff member with the right permission work', async () => {
    const { client: reader } = await createStaff('reader@blipmade.test', ['mail.read']);

    const answer = await reader.request('GET', '/api/admin/mail/plans');
    expect(answer.status).toBe(200);
    expect(answer.body.plans).toEqual([]);
  });

  it('is not open to a customer', async () => {
    const { client: customer } = await registerAndLogin(app, 'owner@example.com');

    expect((await customer.request('GET', '/api/admin/mail/plans')).status).toBe(403);
    expect((await customer.request('GET', '/api/admin/mail/services')).status).toBe(403);
    expect((await customer.request('GET', '/api/admin/mail/usage')).status).toBe(403);
  });

  it('is not open to a visitor that is not signed in', async () => {
    const answer = await app.inject({ method: 'GET', url: '/api/admin/mail/plans' });
    expect(answer.statusCode).toBe(401);
  });
});

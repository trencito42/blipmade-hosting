import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { MAIL_PLAN_DRAFTS, seedMailPlanDrafts } from '../src/lib/mail-plan-drafts.js';
import { deploymentAvailability } from '../src/services/availability.js';
import { platformLimits } from '../src/services/mail-commerce.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase } from './helpers.js';

/**
 * The draft plans of hosted mail.
 *
 * The plans of the mail exist in the catalog, so the operator can work on
 * them, and they cannot be bought. This file checks the three things that
 * keep them closed:
 *
 *   - the flags of the draft: `deployable` stops the order and `visible`
 *     keeps the plan out of the public catalog;
 *   - the answer of the catalog, of the quote and of the order, which is the
 *     same predicate everywhere (`deploymentAvailability`);
 *   - the price: there is none, and a plan without a price is not an offer.
 *
 * The five products of servers are written before every test, so the file
 * also proves that the drafts of the mail did not touch them.
 */

const DRAFT_SLUGS = ['email-hosting-starter', 'email-hosting-plus', 'email-hosting-business'];
const DRAFT_NAMES = ['Email Hosting Starter', 'Email Hosting Plus', 'Email Hosting Business'];

/** The five products of servers, as the seed writes them. */
const SERVER_PRODUCTS = [
  { slug: 'wordpress', name: 'WordPress', category: 'WEB_CMS', deployable: false, amount: 149 },
  { slug: 'code-server', name: 'Code Server', category: 'DEVELOPER_TOOLS', deployable: false, amount: 299 },
  { slug: 'discord-bot', name: 'Discord Bot', category: 'BOTS', deployable: true, amount: 149 },
  { slug: 'uptime-kuma', name: 'Uptime Kuma', category: 'MONITORING', deployable: false, amount: 149 },
  { slug: 'postgresql', name: 'PostgreSQL', category: 'DATABASES', deployable: false, amount: 449 },
] as const;

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

/** Writes the five products of servers, as the seed writes them. */
async function seedServers(): Promise<void> {
  for (const product of SERVER_PRODUCTS) {
    await prisma.product.create({
      data: {
        slug: product.slug,
        name: product.name,
        category: product.category,
        description: 'A product of servers, used by the test of the drafts of the mail.',
        icon: 'bot',
        eggId: product.deployable ? 15 : null,
        visible: true,
        deployable: product.deployable,
        prices: { create: { period: 'MONTHLY', baseAmount: product.amount, currency: 'EUR' } },
      },
    });
  }
}

beforeEach(async () => {
  await resetDatabase();
  await seedServers();
  await seedMailPlanDrafts(prisma);
});

describe('the draft plans of hosted mail', () => {
  it('writes the three drafts with their names and their slugs', async () => {
    const rows = await prisma.product.findMany({
      where: { fulfilment: 'EMAIL' },
      orderBy: { sortOrder: 'asc' },
    });

    expect(rows.map((row) => row.slug)).toEqual(DRAFT_SLUGS);
    expect(rows.map((row) => row.name)).toEqual(DRAFT_NAMES);
    for (const row of rows) {
      expect(row.category).toBe('EMAIL_HOSTING');
    }
  });

  it('writes every draft as a draft: it cannot be ordered and it is not in the public catalog', async () => {
    const rows = await prisma.product.findMany({ where: { fulfilment: 'EMAIL' } });
    expect(rows).toHaveLength(3);

    for (const row of rows) {
      // The flag that stops the order.
      expect(row.deployable).toBe(false);
      // The flag that keeps the plan out of the public catalog, out of the
      // shop of the mail and out of the public page of the plan.
      expect(row.visible).toBe(false);
      // A plan of mail is delivered by the mail system: no egg, no server.
      expect(row.eggId).toBeNull();
      expect(row.fulfilment).toBe('EMAIL');
    }
  });

  it('keeps the limits of the plans under the ceiling of the platform', async () => {
    const ceiling = platformLimits();

    for (const draft of MAIL_PLAN_DRAFTS) {
      expect(draft.maxDomains).toBeLessThanOrEqual(ceiling.maxDomains);
      expect(draft.maxMailboxes).toBeLessThanOrEqual(ceiling.maxMailboxes);
      expect(draft.maxAliases).toBeLessThanOrEqual(ceiling.maxAliases);
      expect(draft.maxForwarding).toBeLessThanOrEqual(ceiling.maxForwarding);
      expect(draft.totalStorageMb).toBeLessThanOrEqual(ceiling.totalStorageMb);
      expect(draft.mailboxQuotaMb).toBeLessThanOrEqual(ceiling.mailboxQuotaMb);
      expect(draft.sendLimit).toBeLessThanOrEqual(ceiling.sendLimit);
    }

    // The rows of the catalog carry the same limits as the drafts.
    const rows = await prisma.product.findMany({ where: { fulfilment: 'EMAIL' }, orderBy: { sortOrder: 'asc' } });
    rows.forEach((row, index) => {
      const draft = MAIL_PLAN_DRAFTS[index]!;
      expect(row.mailMaxDomains).toBe(draft.maxDomains);
      expect(row.mailMaxMailboxes).toBe(draft.maxMailboxes);
      expect(row.mailMaxAliases).toBe(draft.maxAliases);
      expect(row.mailMaxForwarding).toBe(draft.maxForwarding);
      expect(row.mailTotalStorageMb).toBe(draft.totalStorageMb);
      expect(row.mailMailboxQuotaMb).toBe(draft.mailboxQuotaMb);
      expect(row.mailSendLimit).toBe(draft.sendLimit);
      expect(row.mailSendInterval).toBe(draft.sendInterval);
    });
  });

  it('gives every plan more than the smaller one, in every column', () => {
    expect(MAIL_PLAN_DRAFTS).toHaveLength(3);

    for (let index = 1; index < MAIL_PLAN_DRAFTS.length; index += 1) {
      const smaller = MAIL_PLAN_DRAFTS[index - 1]!;
      const bigger = MAIL_PLAN_DRAFTS[index]!;
      expect(bigger.maxDomains).toBeGreaterThan(smaller.maxDomains);
      expect(bigger.maxMailboxes).toBeGreaterThan(smaller.maxMailboxes);
      expect(bigger.maxAliases).toBeGreaterThan(smaller.maxAliases);
      expect(bigger.maxForwarding).toBeGreaterThan(smaller.maxForwarding);
      expect(bigger.totalStorageMb).toBeGreaterThan(smaller.totalStorageMb);
      expect(bigger.mailboxQuotaMb).toBeGreaterThan(smaller.mailboxQuotaMb);
      expect(bigger.sendLimit).toBeGreaterThan(smaller.sendLimit);
    }
  });

  it('writes no price at all', async () => {
    const rows = await prisma.product.findMany({ where: { fulfilment: 'EMAIL' }, include: { prices: true } });

    for (const row of rows) {
      // A price of zero would be an offer of zero, so the price is missing
      // and not written.
      expect(row.prices).toHaveLength(0);
      expect(await prisma.productPrice.count({ where: { productId: row.id } })).toBe(0);
      // The description is text for the customer: it says what the plan holds and never states a
      // price or a sale that the plan does not have. Whether a plan can be ordered is what the
      // flags say, not the words.
      expect(row.description).not.toMatch(/\d+\s*(€|eur)/i);
    }
  });

  it('answers that no draft can be ordered', async () => {
    const rows = await prisma.product.findMany({ where: { fulfilment: 'EMAIL' } });

    for (const row of rows) {
      // The same predicate that the catalog, the quote and the order use.
      const availability = deploymentAvailability(row, { emailSalesEnabled: env.MAIL_SALES_ENABLED });
      expect(availability.orderable).toBe(false);
      expect(availability.blockers.length).toBeGreaterThan(0);

      // The switch of the sale of the mail is not what closes the draft: the
      // draft stays closed even when the switch is open.
      const open = deploymentAvailability(row, { emailSalesEnabled: true });
      expect(open.orderable).toBe(false);
    }
  });

  it('keeps the drafts out of the public catalog and refuses the quote', async () => {
    const client = makeClient(app);

    const catalog = await client.request('GET', '/api/catalog/products');
    expect(catalog.status).toBe(200);
    const slugs = catalog.body.products.map((product: { slug: string }) => product.slug);
    for (const slug of DRAFT_SLUGS) {
      expect(slugs).not.toContain(slug);
    }
    // The products of servers are still there.
    expect(slugs).toContain('wordpress');
    expect(slugs).toContain('discord-bot');

    // The page of a draft is not public either.
    const one = await client.request('GET', `/api/catalog/products/${DRAFT_SLUGS[0]}`);
    expect(one.status).toBe(404);

    // The quote of a draft is refused, in words.
    const quote = await client.request('POST', '/api/catalog/quote', {
      items: [{ productSlug: DRAFT_SLUGS[0], mailDomain: 'acme.ro' }],
    });
    expect(quote.status).toBe(400);
    expect(String(quote.body.error?.message)).toMatch(/not available to order yet/i);
  });

  it('shows the drafts to the operator in the back office', async () => {
    const { client: admin } = await createAdmin(app);

    const plans = await admin.request('GET', '/api/admin/mail/plans');
    expect(plans.status).toBe(200);
    expect(plans.body.plans.map((plan: { slug: string }) => plan.slug)).toEqual(DRAFT_SLUGS);
    for (const plan of plans.body.plans) {
      expect(plan.deployable).toBe(false);
      expect(plan.availability.orderable).toBe(false);
      // No price: the plan is not an offer.
      expect(plan.prices).toHaveLength(0);
      expect(plan.limits.maxDomains).toBeGreaterThan(0);
    }

    const products = await admin.request('GET', '/api/admin/products');
    expect(products.status).toBe(200);
    const slugs = products.body.products.map((product: { slug: string }) => product.slug);
    for (const slug of DRAFT_SLUGS) {
      expect(slugs).toContain(slug);
    }
  });

  it('leaves the products of servers alone', async () => {
    const before = await prisma.product.findMany({
      where: { fulfilment: 'SERVER' },
      include: { prices: true },
      orderBy: { slug: 'asc' },
    });
    expect(before.map((row) => row.slug)).toEqual([
      'code-server',
      'discord-bot',
      'postgresql',
      'uptime-kuma',
      'wordpress',
    ]);

    // The seed can be run again on every deploy: it changes nothing.
    await seedMailPlanDrafts(prisma);
    await seedMailPlanDrafts(prisma);

    const after = await prisma.product.findMany({
      where: { fulfilment: 'SERVER' },
      include: { prices: true },
      orderBy: { slug: 'asc' },
    });
    expect(after).toEqual(before);

    // The draft of the mail is written once, and it is not written twice.
    expect(await prisma.product.count()).toBe(SERVER_PRODUCTS.length + DRAFT_SLUGS.length);
    const drafts = await prisma.product.count({ where: { fulfilment: 'EMAIL' } });
    expect(drafts).toBe(DRAFT_SLUGS.length);
  });
});

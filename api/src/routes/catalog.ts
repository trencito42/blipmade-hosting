import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BillingPeriod, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { badRequest, notFound } from '../lib/errors.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { breakdownOfResources, buildQuote, priceBook, resourceRates } from '../services/pricing.js';
import { companyDetails, taxOf } from '../services/billing.js';
import { parseCustomerVariableSpecs } from '../services/instance-credentials.js';
import { deploymentAvailability } from '../services/availability.js';
import { priceRowFor } from '../services/pricing.js';
import { MAX_OPTION_CODES, MAX_ORDER_LINES } from '../lib/bounded.js';
import { PUBLIC_OPERATOR_SETTING_KEYS } from '../services/operator-settings.js';
import { publicFamilies, publicFamily } from '../services/catalog-projection.js';
import { inspectGitUrl, inspectZip, zipLayoutProblem } from '../services/import-inspect.js';
import { IMPORT_ZIP_TTL_MS, zipQuotaProblem } from '../services/import-lifecycle.js';
import { purgeExpiredImportArchives } from '../services/import-apply.js';
import { cleanCommand, cleanRepoUrl } from '../services/git-deploy.js';

const quoteItemSchema = z.object({
  productSlug: z.string().min(1),
  // A line of servers carries its resources. A line of mail carries none:
  // the plan of the line is the whole configuration.
  ram: z.number().int().positive().optional(),
  // The processor is a share of a processor, and a share may be a half. The
  // limits of the product are checked when the line is priced.
  cpu: z.number().positive().optional(),
  disk: z.number().int().positive().optional(),
  optionCodes: z.array(z.string()).max(MAX_OPTION_CODES).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
  // The domain of mail the line brings.
  mailDomain: z.string().trim().max(253).optional(),
});

async function serializeProduct(product: {
  id: string;
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  minRam: number;
  minCpu: number;
  minDisk: number;
  defaultRam: number;
  defaultCpu: number;
  defaultDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  visible: boolean;
  deployable: boolean;
  eggId: number | null;
  eggName: string | null;
  docsUrl: string | null;
  fulfilment: string;
  customerVariables: unknown;
  mailMaxDomains: number | null;
  mailMaxMailboxes: number | null;
  mailMaxAliases: number | null;
  mailMaxForwarding: number | null;
  mailTotalStorageMb: number | null;
  mailMailboxQuotaMb: number | null;
  mailSendLimit: number | null;
  mailSendInterval: string | null;
  prices: {
    id: string;
    baseAmount: number;
    ramPerGb: number;
    cpuPerUnit: number;
    diskPerGb: number;
    currency: string;
    period: BillingPeriod;
    active: boolean;
    createdAt: Date;
  }[];
  options: { code: string; name: string; description: string | null; amount: number; currency: string; active: boolean }[];
}) {
  // The row is the one that prices the order, so the price that is shown
  // and the price that is charged cannot be two different numbers.
  const price = priceRowFor(product.prices);
  // The availability is derived from the product itself, so the catalog, the
  // quote and the order always answer the same way.
  const availability = deploymentAvailability(
    {
      name: product.name,
      slug: product.slug,
      deployable: product.deployable,
      eggId: product.eggId,
      eggName: product.eggName,
      visible: product.visible,
      fulfilment: product.fulfilment as never,
    },
    { emailSalesEnabled: env.MAIL_SALES_ENABLED },
  );
  // The price book: what the minimum configuration costs (the starting price
  // of the catalog) and what the recommended one costs. Both are calculated
  // with the function that prices an order.
  const rates = await resourceRates();
  const book = price
    ? priceBook(product, {
        baseAmount: price.baseAmount,
        ramPerGb: price.ramPerGb,
        cpuPerUnit: price.cpuPerUnit,
        diskPerGb: price.diskPerGb,
        currency: price.currency,
        period: price.period,
      }, rates)
    : null;
  return {
    id: product.id,
    slug: product.slug,
    name: product.name,
    category: product.category,
    description: product.description,
    icon: product.icon,
    minRam: product.minRam,
    minCpu: product.minCpu,
    minDisk: product.minDisk,
    defaultRam: product.defaultRam,
    defaultCpu: product.defaultCpu,
    defaultDisk: product.defaultDisk,
    maxRam: product.maxRam,
    maxCpu: product.maxCpu,
    maxDisk: product.maxDisk,
    visible: product.visible,
    deployable: product.deployable,
    eggId: product.eggId,
    docsUrl: product.docsUrl,
    // What the platform delivers: a server on a node, or a mail service that
    // needs no server at all.
    fulfilment: product.fulfilment,
    // The variables the customer has to fill at the order, such as the
    // licence of a game. A product that asks for nothing has none.
    customerVariables: parseCustomerVariableSpecs(product.customerVariables),
    // The limits of a mail plan. They are empty for a product of servers.
    mail: {
      maxDomains: product.mailMaxDomains,
      maxMailboxes: product.mailMaxMailboxes,
      maxAliases: product.mailMaxAliases,
      maxForwarding: product.mailMaxForwarding,
      totalStorageMb: product.mailTotalStorageMb,
      mailboxQuotaMb: product.mailMailboxQuotaMb,
      sendLimit: product.mailSendLimit,
      sendInterval: product.mailSendInterval,
    },
    // The starting price of the catalogue is the price of the smallest
    // configuration of the product. A server is priced by its resources, so
    // the price of the minimum configuration is not the base of the product.
    price: price
      ? {
          amount: book?.minimum.amount ?? price.baseAmount,
          currency: price.currency,
          period: price.period,
        }
      : null,
    pricing: book
      ? {
          currency: book.currency,
          period: book.period,
          minimum: book.minimum,
          recommended: book.recommended,
          // The card of the platform and the parts of the price. The
          // configurator shows the breakdown of the configuration the
          // customer chooses, and it needs the rates to do it: the server
          // recalculates the same numbers and the order is priced by the
          // server, never by the page.
          rates,
          breakdown: {
            minimum: breakdownOfResources(book.minimum, rates),
            recommended: breakdownOfResources(book.recommended, rates),
          },
        }
      : null,
    availability,
    options: product.options
      .filter((option) => option.active)
      .map((option) => ({
        code: option.code,
        name: option.name,
        description: option.description,
        amount: option.amount,
        currency: option.currency,
      })),
  };
}

export async function registerCatalogRoutes(app: FastifyInstance): Promise<void> {
  /**
   * Public operator facts used by legal pages and the public footer.
   * Only this explicit allow-list can leave the settings table.
   */
  app.get('/platform/settings', async () => {
    const rows = await prisma.setting.findMany({ where: { key: { in: PUBLIC_OPERATOR_SETTING_KEYS } }, select: { key: true, value: true } });
    return { settings: Object.fromEntries(rows.map((row) => [row.key, typeof row.value === 'string' ? row.value.trim() : row.value])) };
  });
  app.get('/catalog/products', async (request) => {
    const query = z
      .object({
        category: z.string().optional(),
        search: z.string().trim().optional(),
        includeHidden: z.enum(['true', 'false']).optional(),
      })
      .parse(request.query ?? {});

    const staff = request.user?.role === 'ADMIN' || request.user?.role === 'STAFF';
    const includeHidden = staff && query.includeHidden === 'true';

    const where: Prisma.ProductWhereInput = {
      // The public catalog only offers what is listed and what can actually
      // be priced. A product without an active price is not an offer, so it
      // never reaches the public list. A plan of mail is the exception: it is
      // shown with its limits even before it is on sale, so a customer can
      // read what the plan holds and see that it cannot be bought yet.
      ...(includeHidden
        ? {}
        : {
            visible: true,
            OR: [{ prices: { some: { active: true } } }, { fulfilment: 'EMAIL' }, { fulfilment: 'VPS' }],
          }),
      ...(query.category && query.category !== 'All' ? { category: query.category as never } : {}),
      ...(query.search
        ? {
            OR: [
              { name: { contains: query.search, mode: 'insensitive' } },
              { description: { contains: query.search, mode: 'insensitive' } },
            ],
          }
        : {}),
    };

    const products = await prisma.product.findMany({
      where,
      include: {
        prices: { where: { active: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
        options: { where: { active: true } },
      },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    // The products are serialized one by one, because the price of a product
    // needs the rate card of the platform, which is read from the settings.
    const serialized = await Promise.all(products.map((product) => serializeProduct(product)));
    return { products: serialized };
  });

  app.post('/catalog/import/inspect', {
    bodyLimit: 12_000_000,
    config: { rateLimit: { max: 20, timeWindow: '1 minute', keyGenerator: addressRateLimitKey } },
    handler: async (request) => {
      await requireAuth(request);
      const body = z.object({
        url: z.string().trim().max(300).optional(),
        zipBase64: z.string().max(12_000_000).optional(),
      }).parse(request.body ?? {});
      if (body.zipBase64) return { proposal: inspectZip(Buffer.from(body.zipBase64, 'base64')) };
      if (body.url) return { proposal: await inspectGitUrl(body.url) };
      return { proposal: { productSlug: null, runtime: null, confidence: 'unknown' as const, start: null, files: [], services: [], notes: ['Paste a repository URL or choose a zip.'] } };
    },
  });

  app.post('/catalog/import/plans', {
    bodyLimit: 12_000_000,
    config: { rateLimit: { max: 10, timeWindow: '1 minute', keyGenerator: addressRateLimitKey } },
    handler: async (request) => {
      const user = await requireAuth(request);
      const body = z.object({
        url: z.string().trim().max(300).optional(),
        zipBase64: z.string().max(12_000_000).optional(),
        buildCommand: z.string().max(500).optional(),
        startCommand: z.string().max(500).optional(),
      }).parse(request.body ?? {});
      const zip = body.zipBase64 ? Buffer.from(body.zipBase64, 'base64') : null;
      if (zip) {
        const problem = zipLayoutProblem(zip);
        if (problem) throw badRequest(problem);
        await purgeExpiredImportArchives();
        const held = await prisma.importSource.findMany({
          where: { userId: user.id, zipBytesLength: { gt: 0 }, appliedAt: null },
          select: { zipBytesLength: true },
        });
        const quota = zipQuotaProblem(held.map((row) => ({ bytes: row.zipBytesLength })), zip.length);
        if (quota) throw badRequest(quota);
      }
      const proposal = zip ? inspectZip(zip) : body.url ? await inspectGitUrl(body.url) : null;
      if (!proposal?.productSlug || !proposal.start) throw badRequest('This project has no supported runtime. Choose a product yourself from the catalogue.');
      const product = await prisma.product.findUnique({ where: { slug: proposal.productSlug }, select: { slug: true, defaultRam: true, defaultCpu: true, defaultDisk: true, deployable: true, visible: true } });
      if (!product?.visible || !product.deployable) throw badRequest('The detected product cannot be ordered.');
      const buildCommand = cleanCommand(body.buildCommand ?? (proposal.runtime === 'python' ? 'pip install -r requirements.txt' : 'npm install'), 'buildCommand', false);
      const startCommand = cleanCommand(body.startCommand ?? proposal.start, 'startCommand', true);
      const repoUrl = body.url ? cleanRepoUrl(body.url) : null;
      const quote = await buildQuote([{ productSlug: product.slug, ram: product.defaultRam, cpu: product.defaultCpu, disk: product.defaultDisk, name: proposal.productSlug }], null, user.id);
      const plan = await prisma.importSource.create({
        data: {
          userId: user.id,
          productSlug: product.slug,
          kind: zip ? 'zip' : 'git',
          repoUrl,
          branch: 'main',
          buildCommand,
          startCommand,
          zipBytes: zip,
          zipBytesLength: zip?.length ?? 0,
          zipExpiresAt: zip ? new Date(Date.now() + IMPORT_ZIP_TTL_MS) : null,
        },
      });
      return {
        plan: {
          id: plan.id,
          productSlug: product.slug,
          buildCommand,
          startCommand,
          ram: product.defaultRam,
          cpu: product.defaultCpu,
          disk: product.defaultDisk,
          total: quote.total,
          currency: quote.currency,
          services: proposal.services,
          notes: proposal.notes,
          continueTo: `/app/deploy/${product.slug}?import=${plan.id}`,
        },
      };
    },
  });

  app.get('/catalog/families', async () => ({ families: await publicFamilies() }));

  app.get('/catalog/families/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    return { family: await publicFamily(slug) };
  });

  app.get('/catalog/products/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const staff = request.user?.role === 'ADMIN' || request.user?.role === 'STAFF';
    const product = await prisma.product.findUnique({
      where: { slug },
      include: {
        prices: { where: { active: true }, orderBy: [{ createdAt: 'desc' }, { id: 'asc' }] },
        options: { where: { active: true } },
      },
    });
    if (!product) throw notFound('This product does not exist.');
    if (!staff) {
      // A hidden product is staff-only, and a product without an active price
      // is not something the public can look at or order. A plan of mail is
      // shown even without a price: the customer reads the limits of the plan
      // and sees that it is not on sale yet.
      if (!product.visible) throw notFound('This product does not exist.');
      if (!product.prices.length && product.fulfilment !== 'EMAIL') {
        throw notFound('This product has no active price.');
      }
    }
    return { product: await serializeProduct(product) };
  });

  app.post('/catalog/quote', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute', keyGenerator: addressRateLimitKey } },
    handler: async (request) => {
      const body = z
        .object({
          items: z.array(quoteItemSchema).min(1, 'Choose at least one app.').max(MAX_ORDER_LINES),
          promotionCode: z.string().trim().optional(),
          // The period of the price that is quoted. The order that follows
          // takes the same period, so the sum that was shown is the sum that
          // is charged.
          period: z.enum(['MONTHLY', 'YEARLY']).default('MONTHLY'),
        })
        .parse(request.body);

      // The customer who is signed in is known here, so the limit of a
      // campaign per account is checked while the quote is made. A code that
      // the customer has already used is refused here, not later at the order.
      const quote = await buildQuote(body.items, body.promotionCode, request.user?.id ?? null, body.period);
      // The tax of the platform is the one the operator wrote in the settings:
      // a rate and a tax identifier, or nothing. The same rule the invoice
      // uses is used here, so the amount the configurator shows is the amount
      // that lands on the invoice.
      const company = await companyDetails();
      // With real payments the card is charged the sum of the order: the flat rate of the settings is not collected, so it
      // is not promised either. VAT is shown only when the platform really adds it and says how much.
      const flatRateCollected = !env.paymentsEnabled;
      const applies = company.taxApplies && flatRateCollected;
      const tax = applies && company.taxRate !== null ? taxOf(quote.total, company.taxRate) : 0;
      return {
        period: body.period,
        items: quote.items.map((item) => ({
          productSlug: item.productSlug,
          name: item.name,
          ram: item.ram,
          cpu: item.cpu,
          disk: item.disk,
          optionCodes: item.optionCodes,
          quantity: 1,
          unitAmount: item.unitAmount,
          total: item.total,
          currency: item.currency,
          fulfilment: item.fulfilment,
          mailDomain: item.mailDomain ?? null,
          // The parts of the price of the line, for the lines of servers.
          breakdown: item.breakdown ?? null,
        })),
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: quote.total,
        currency: quote.currency,
        promotion: quote.promotion,
        // The tax of the invoice. It is zero as long as the operator has not
        // written a rate and a tax identifier.
        tax: {
          rate: company.taxRate,
          amount: tax,
          applies,
          note: company.taxNote ?? (company.taxApplies && !flatRateCollected ? 'No VAT is added to this price.' : null),
          total: quote.total + tax,
        },
      };
    },
  });
}

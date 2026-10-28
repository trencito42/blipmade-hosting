import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BillingPeriod, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { notFound } from '../lib/errors.js';
import { addressRateLimitKey } from '../plugins/auth.js';
import { buildQuote, priceBook, resourceRates } from '../services/pricing.js';
import { parseCustomerVariableSpecs } from '../services/instance-credentials.js';
import { deploymentAvailability } from '../services/availability.js';
import { priceRowFor } from '../services/pricing.js';
import { MAX_OPTION_CODES, MAX_ORDER_LINES } from '../lib/bounded.js';

const quoteItemSchema = z.object({
  productSlug: z.string().min(1),
  // A line of servers carries its resources. A line of mail carries none:
  // the plan of the line is the whole configuration.
  ram: z.number().int().positive().optional(),
  cpu: z.number().int().positive().optional(),
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
  const book = price
    ? priceBook(product, {
        baseAmount: price.baseAmount,
        ramPerGb: price.ramPerGb,
        cpuPerUnit: price.cpuPerUnit,
        diskPerGb: price.diskPerGb,
        currency: price.currency,
        period: price.period,
      }, await resourceRates())
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
            OR: [{ prices: { some: { active: true } } }, { fulfilment: 'EMAIL' }],
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

    return { products: products.map(serializeProduct) };
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
        })),
        subtotal: quote.subtotal,
        discount: quote.discount,
        total: quote.total,
        currency: quote.currency,
        promotion: quote.promotion,
      };
    },
  });
}

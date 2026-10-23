import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import type { BillingPeriod, Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { buildQuote, priceBook } from '../services/pricing.js';
import { deploymentAvailability } from '../services/availability.js';

const quoteItemSchema = z.object({
  productSlug: z.string().min(1),
  ram: z.number().int().positive(),
  cpu: z.number().int().positive(),
  disk: z.number().int().positive(),
  optionCodes: z.array(z.string()).optional(),
  quantity: z.number().int().min(1).max(20).optional(),
});

function serializeProduct(product: {
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
  docsUrl: string | null;
  prices: {
    baseAmount: number;
    ramPerGb: number;
    cpuPerUnit: number;
    diskPerGb: number;
    currency: string;
    period: BillingPeriod;
    active: boolean;
  }[];
  options: { code: string; name: string; description: string | null; amount: number; currency: string; active: boolean }[];
}) {
  const price = product.prices.find((p) => p.active && p.period === 'MONTHLY') ?? product.prices.find((p) => p.active);
  // The availability is derived from the product itself, so the catalog, the
  // quote and the order always answer the same way.
  const availability = deploymentAvailability({
    name: product.name,
    deployable: product.deployable,
    eggId: product.eggId,
    visible: product.visible,
  });
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
      })
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
    price: price ? { amount: price.baseAmount, currency: price.currency, period: price.period } : null,
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
      // never reaches the public list. Staff can ask for the hidden ones,
      // and they see a null price when a product has no price yet.
      ...(includeHidden ? {} : { visible: true, prices: { some: { active: true } } }),
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
      include: { prices: { where: { active: true } }, options: { where: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { products: products.map(serializeProduct) };
  });

  app.get('/catalog/products/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const staff = request.user?.role === 'ADMIN' || request.user?.role === 'STAFF';
    const product = await prisma.product.findUnique({
      where: { slug },
      include: { prices: { where: { active: true } }, options: { where: { active: true } } },
    });
    if (!product) throw notFound('This product does not exist.');
    if (!staff) {
      // A hidden product is staff-only, and a product without an active price
      // is not something the public can look at or order.
      if (!product.visible) throw notFound('This product does not exist.');
      if (!product.prices.length) throw notFound('This product has no active price.');
    }
    return { product: serializeProduct(product) };
  });

  app.post('/catalog/quote', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    handler: async (request) => {
      const body = z
        .object({ items: z.array(quoteItemSchema).min(1, 'Choose at least one app.'), promotionCode: z.string().trim().optional() })
        .parse(request.body);

      // The customer who is signed in is known here, so the limit of a
      // campaign per account is checked while the quote is made. A code that
      // the customer has already used is refused here, not later at the order.
      const quote = await buildQuote(body.items, body.promotionCode, request.user?.id ?? null);
      return {
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

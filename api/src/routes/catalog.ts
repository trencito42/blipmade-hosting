import type { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { notFound } from '../lib/errors.js';
import { buildQuote } from '../services/pricing.js';

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
  docsUrl: string | null;
  prices: { baseAmount: number; currency: string; period: string; active: boolean }[];
  options: { code: string; name: string; description: string | null; amount: number; currency: string; active: boolean }[];
}) {
  const price = product.prices.find((p) => p.active && p.period === 'MONTHLY') ?? product.prices.find((p) => p.active);
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
    docsUrl: product.docsUrl,
    price: price ? { amount: price.baseAmount, currency: price.currency, period: price.period } : null,
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

    const products = await prisma.product.findMany({
      where: {
        ...(includeHidden ? {} : { visible: true }),
        ...(query.category && query.category !== 'All' ? { category: query.category as never } : {}),
        ...(query.search
          ? {
              OR: [
                { name: { contains: query.search, mode: 'insensitive' } },
                { description: { contains: query.search, mode: 'insensitive' } },
              ],
            }
          : {}),
      },
      include: { prices: { where: { active: true } }, options: { where: { active: true } } },
      orderBy: [{ sortOrder: 'asc' }, { name: 'asc' }],
    });

    return { products: products.map(serializeProduct) };
  });

  app.get('/catalog/products/:slug', async (request) => {
    const { slug } = z.object({ slug: z.string() }).parse(request.params);
    const product = await prisma.product.findUnique({
      where: { slug },
      include: { prices: { where: { active: true } }, options: { where: { active: true } } },
    });
    if (!product || (!product.visible && request.user?.role === 'CUSTOMER')) {
      throw notFound('This product does not exist.');
    }
    return { product: serializeProduct(product) };
  });

  app.post('/catalog/quote', {
    config: { rateLimit: { max: 120, timeWindow: '1 minute' } },
    handler: async (request) => {
      const body = z
        .object({ items: z.array(quoteItemSchema).min(1, 'Choose at least one app.'), promotionCode: z.string().trim().optional() })
        .parse(request.body);

      const quote = await buildQuote(body.items, body.promotionCode);
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

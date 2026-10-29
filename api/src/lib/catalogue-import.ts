/**
 * The catalogue of the platform, written out of the manifest of the eggs.
 *
 * The manifest (`pterodactyl-eggs/manifest.json`) is the truth of the
 * catalogue: it names the products, the egg each of them runs on, the
 * resources it runs with, the variables the customer fills at the order and
 * where the product stands in the catalogue.
 *
 * This module writes that manifest into the database. It is idempotent: a
 * product that is already there is brought back to what the manifest says,
 * except for the two things that belong to the operator and not to the
 * manifest:
 *
 *   * the flag that opens the product for ordering, which is only true after
 *     a server of that product was really built and answered on a node;
 *   * the price, which is the rate card of the platform and not a number of
 *     the manifest.
 *
 * A product that the manifest does not name is left alone. The five products
 * that were on the platform before the catalogue of the eggs are not in the
 * manifest, and they keep the state the operator gave them.
 */
import type { PrismaClient } from '@prisma/client';

/** What a product of the manifest says. */
export interface CatalogueEntry {
  slug: string;
  name: string;
  category: string;
  description: string;
  icon: string;
  eggFile: string;
  eggName: string;
  dockerImage: string | null;
  minRam: number;
  defaultRam: number;
  minCpu: number;
  defaultCpu: number;
  minDisk: number;
  defaultDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  customerVariables?: Record<string, CustomerVariableDeclaration> | null;
  /**
   * The variables the platform makes for every instance of the product, such
   * as the password of the administration of a game. The customer is not asked
   * for them: the platform makes them and shows them to the owner.
   */
  generatedVariables?: Record<string, GeneratedVariableDeclaration> | null;
  /**
   * The values of the variables of the egg that the product names, such as the
   * version of PHP that a site runs with. They are written over the defaults
   * of the egg.
   */
  startup?: Record<string, string> | null;
  sortOrder: number;
}

/** What a product says about one variable the customer fills. */
export interface CustomerVariableDeclaration {
  label?: string;
  required?: boolean;
  type?: 'text' | 'password';
  description?: string;
}

/** What a product says about one variable the platform makes. */
export interface GeneratedVariableDeclaration {
  /** How long the value is. */
  length?: number;
  /** The label the customer sees. */
  label?: string;
}

/** The rate card of the platform, in minor units. */
export interface CatalogueRates {
  ramPerGb: number;
  cpuPerUnit: number;
  diskPerGb: number;
}

/** What the import did. */
export interface CatalogueReport {
  /** The products that did not exist and were written. */
  created: string[];
  /** The products that existed and were brought back to the manifest. */
  updated: string[];
  /** The products of the manifest whose egg the panel does not carry. */
  withoutEgg: string[];
  /** The rows of the prices that were given the card of the platform. */
  pricesSynced: number;
}

/**
 * Reads the manifest of the catalogue.
 *
 * The file is read as text and parsed, so a file that is not JSON is an error
 * that says what it is, instead of a stack of frames.
 */
export function parseManifest(text: string): CatalogueEntry[] {
  let parsed: unknown;
  try {
    parsed = JSON.parse(text);
  } catch (error) {
    throw new Error(`the manifest is not JSON: ${(error as Error).message}`);
  }
  const document = parsed as { products?: unknown };
  if (!document || !Array.isArray(document.products)) {
    throw new Error('the manifest has no products.');
  }
  const entries: CatalogueEntry[] = [];
  for (const raw of document.products) {
    const entry = raw as Partial<CatalogueEntry>;
    if (!entry || typeof entry.slug !== 'string' || entry.slug === '') {
      throw new Error('a product of the manifest has no slug.');
    }
    entries.push(entry as CatalogueEntry);
  }
  return entries;
}

/**
 * Writes the catalogue into the database.
 *
 * The number of the egg of the panel is given when the panel carries the egg.
 * A product whose egg the panel does not carry is still written, because the
 * egg may be imported afterwards; it is reported so the operator knows that
 * the product cannot be deployed yet.
 */
export async function importCatalogue(
  client: PrismaClient,
  entries: CatalogueEntry[],
  options: { rates: CatalogueRates; eggIds?: Map<string, number> },
): Promise<CatalogueReport> {
  const report: CatalogueReport = { created: [], updated: [], withoutEgg: [], pricesSynced: 0 };

  for (const entry of entries) {
    const eggId = options.eggIds?.get(entry.eggName.toLowerCase()) ?? null;
    if (eggId === null) report.withoutEgg.push(entry.slug);

    const data = {
      name: entry.name,
      category: entry.category as never,
      description: entry.description,
      icon: entry.icon,
      eggId,
      eggName: entry.eggName,
      dockerImage: entry.dockerImage,
      minRam: entry.minRam,
      defaultRam: entry.defaultRam,
      minCpu: entry.minCpu,
      defaultCpu: entry.defaultCpu,
      minDisk: entry.minDisk,
      defaultDisk: entry.defaultDisk,
      maxRam: entry.maxRam,
      maxCpu: entry.maxCpu,
      maxDisk: entry.maxDisk,
      customerVariables: (entry.customerVariables ?? undefined) as never,
      generatedVariables: (entry.generatedVariables ?? undefined) as never,
      startup: (entry.startup ?? undefined) as never,
      sortOrder: entry.sortOrder,
    };

    const existing = await client.product.findUnique({ where: { slug: entry.slug } });
    if (!existing) {
      await client.product.create({
        data: {
          slug: entry.slug,
          ...data,
          visible: true,
          // A product is opened for ordering only after a server of it was
          // really built and answered on a node.
          deployable: false,
          fulfilment: 'SERVER',
          prices: {
            create: {
              period: 'MONTHLY',
              // The price of a server is the price of its resources. The base
              // is kept at zero, and the card of the platform is written in
              // the row so the row shows the card that is really used.
              baseAmount: 0,
              ramPerGb: options.rates.ramPerGb,
              cpuPerUnit: options.rates.cpuPerUnit,
              diskPerGb: options.rates.diskPerGb,
              currency: 'EUR',
            },
          },
        },
      });
      report.created.push(entry.slug);
      continue;
    }

    // The flag that opens the product for ordering and the price belong to
    // the operator: they are not touched here. Everything else is what the
    // manifest says.
    await client.product.update({
      where: { slug: entry.slug },
      data: {
        ...data,
        eggId: eggId ?? existing.eggId,
      },
    });
    report.updated.push(entry.slug);
  }

  // The card of the resources is one card for the whole platform, and the
  // rows of the prices show the card that is really used. The rows that were
  // written before the card was settled still carry the old numbers, and the
  // back office would show them next to the prices that are charged. They
  // are given the card of the platform here.
  const synced = await client.productPrice.updateMany({
    where: { product: { fulfilment: 'SERVER' } },
    data: {
      ramPerGb: options.rates.ramPerGb,
      cpuPerUnit: options.rates.cpuPerUnit,
      diskPerGb: options.rates.diskPerGb,
    },
  });
  report.pricesSynced = synced.count;

  return report;
}

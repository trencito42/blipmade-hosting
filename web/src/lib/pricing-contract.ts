import type { CatalogProduct } from './api';

/**
 * The pricing contract between the catalog, the configurator, the review and
 * the checkout.
 *
 * The catalog shows a starting price. That price is the price of the
 * smallest configuration of the product, and the configurator has to start
 * from exactly that configuration. The recommended configuration is a bigger
 * one and it has its own price, which is always shown apart from the
 * starting price.
 *
 * The module holds no React and no browser code, so every rule of the
 * contract can be checked without a screen.
 */

/** The resources of one deployment. */
export interface ResourceConfiguration {
  ram: number;
  cpu: number;
  disk: number;
}

/** The limits of a product. */
export interface ConfigurationBounds {
  minRam: number;
  minCpu: number;
  minDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
}

/** The limits of a product and the configuration it recommends. */
export interface ProductBounds extends ConfigurationBounds {
  defaultRam: number;
  defaultCpu: number;
  defaultDisk: number;
}

/** Keeps a value inside the limits of a product. */
export function clampConfiguration(value: number, min: number, max: number): number {
  return Math.min(max, Math.max(min, value));
}

/**
 * The smallest configuration of a product. This is the configuration the
 * starting price of the catalog is the price of.
 */
export function minimumConfiguration(product: ConfigurationBounds): ResourceConfiguration {
  return {
    ram: clampConfiguration(product.minRam, product.minRam, product.maxRam),
    cpu: clampConfiguration(product.minCpu, product.minCpu, product.maxCpu),
    disk: clampConfiguration(product.minDisk, product.minDisk, product.maxDisk),
  };
}

/**
 * The configuration the platform recommends. It is the default of the
 * product, kept inside the limits of the product.
 */
export function recommendedConfiguration(product: ProductBounds): ResourceConfiguration {
  return {
    ram: clampConfiguration(product.defaultRam, product.minRam, product.maxRam),
    cpu: clampConfiguration(product.defaultCpu, product.minCpu, product.maxCpu),
    disk: clampConfiguration(product.defaultDisk, product.minDisk, product.maxDisk),
  };
}

/**
 * The configuration a deployment starts from.
 *
 * The price book of the server is the truth: it is calculated with the same
 * function that prices an order. The fields of the product are only a
 * fallback, for a server that does not send the book yet.
 */
export function startingConfiguration(product: CatalogProduct): ResourceConfiguration {
  const book = product.pricing?.minimum;
  if (book) return { ram: book.ram, cpu: book.cpu, disk: book.disk };
  return minimumConfiguration(product);
}

/** The configuration the catalog recommends, with its own price. */
export function recommendedPreset(product: CatalogProduct): ResourceConfiguration {
  const book = product.pricing?.recommended;
  if (book) return { ram: book.ram, cpu: book.cpu, disk: book.disk };
  return recommendedConfiguration(product);
}

/** The price of the starting configuration, in minor units. */
export function startingPrice(product: CatalogProduct): number | null {
  if (product.pricing) return product.pricing.minimum.amount;
  return product.price?.amount ?? null;
}

/** The price of the recommended configuration, in minor units. */
export function recommendedPrice(product: CatalogProduct): number | null {
  return product.pricing?.recommended.amount ?? null;
}

/** True when the two configurations are the same. */
export function sameConfiguration(a: ResourceConfiguration, b: ResourceConfiguration): boolean {
  return a.ram === b.ram && a.cpu === b.cpu && a.disk === b.disk;
}

/**
 * Reads the configuration from the query of the deploy page.
 *
 * A value that is not a whole number, or that is outside the limits of the
 * product, is replaced by the value of the starting configuration: the page
 * never shows a configuration the server would refuse.
 */
export function configurationFromQuery(
  query: Record<string, string | undefined>,
  product: CatalogProduct,
): ResourceConfiguration {
  const fallback = startingConfiguration(product);
  const read = (key: string, min: number, max: number, fallbackValue: number): number => {
    const raw = query[key];
    if (raw === undefined || raw === '') return fallbackValue;
    const value = Number(raw);
    if (!Number.isInteger(value)) return fallbackValue;
    return clampConfiguration(value, min, max);
  };
  return {
    ram: read('ram', product.minRam, product.maxRam, fallback.ram),
    cpu: read('cpu', product.minCpu, product.maxCpu, fallback.cpu),
    disk: read('disk', product.minDisk, product.maxDisk, fallback.disk),
  };
}

/** The query of the deploy page for a configuration. */
export function configurationToQuery(
  config: ResourceConfiguration,
  optionCodes: string[] = [],
): Record<string, string> {
  const query: Record<string, string> = {
    ram: String(config.ram),
    cpu: String(config.cpu),
    disk: String(config.disk),
  };
  if (optionCodes.length) query.opts = optionCodes.join(',');
  return query;
}

/**
 * The add-ons of the deploy page, read from the query. A code that the
 * product does not offer is dropped: the server would refuse it anyway.
 */
export function optionCodesFromQuery(
  query: Record<string, string | undefined>,
  product: CatalogProduct,
): string[] {
  const raw = query.opts;
  if (!raw) return [];
  const known = new Set(product.options.map((option) => option.code));
  return raw
    .split(',')
    .map((code) => code.trim())
    .filter((code) => code.length > 0 && known.has(code));
}

/**
 * The address of the deploy page of a product with a configuration in it.
 *
 * The configuration travels in the address, so a refresh, a link and the back
 * button all bring the customer back to the same deployment.
 */
export function deployPathFor(
  slug: string,
  config: ResourceConfiguration,
  optionCodes: string[] = [],
  extra: Record<string, string> = {},
): string {
  const params = new URLSearchParams({ ...configurationToQuery(config, optionCodes), ...extra });
  return `/app/deploy/${encodeURIComponent(slug)}?${params.toString()}`;
}

/**
 * Whether the product can be ordered.
 *
 * The answer comes from the server, which derives it from the product itself.
 * The flag of the catalog row is only a fallback for a server that does not
 * send the availability yet.
 */
export function isOrderable(product: CatalogProduct): boolean {
  if (product.availability) return product.availability.orderable;
  return product.deployable && Boolean(product.price);
}

/** Why the product cannot be ordered. Empty when it can. */
export function orderBlockers(product: CatalogProduct): string[] {
  if (product.availability) return product.availability.blockers;
  if (product.deployable) return ['This product has no price yet, so it cannot be ordered.'];
  return ['This product is not validated for deployment yet.'];
}

/**
 * The state of a product, as the server sees it.
 *
 * The four states are the same on every screen: deployable, coming soon,
 * temporarily unavailable and unpublished. The interface never decides on its
 * own whether a product can be bought.
 */
export type AvailabilityState = 'DEPLOYABLE' | 'COMING_SOON' | 'TEMPORARILY_UNAVAILABLE' | 'UNPUBLISHED';

export function availabilityState(product: CatalogProduct): AvailabilityState {
  if (product.availability?.state) return product.availability.state;
  // A server that does not send the state yet: the flag and the price decide.
  if (!product.visible) return 'UNPUBLISHED';
  if (isOrderable(product)) return 'DEPLOYABLE';
  return product.deployable ? 'TEMPORARILY_UNAVAILABLE' : 'COMING_SOON';
}

/**
 * The name of the state, in the words of the customer.
 *
 * One wording per state, used by the catalog, the product page, the
 * configurator and the customer area.
 */
export function availabilityLabel(product: CatalogProduct): string {
  switch (availabilityState(product)) {
    case 'DEPLOYABLE':
      return 'Ready to deploy';
    case 'COMING_SOON':
      return 'Coming soon';
    case 'TEMPORARILY_UNAVAILABLE':
      return 'Temporarily unavailable';
    default:
      return 'Not published';
  }
}

/** True when the state is one the customer can do nothing about yet. */
export function isUnavailable(product: CatalogProduct): boolean {
  return availabilityState(product) !== 'DEPLOYABLE';
}


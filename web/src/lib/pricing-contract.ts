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

/**
 * The options the customer can pick for a product.
 *
 * The control that edits a configuration, the estimate that prices it and the
 * price book of the server have to describe the same configuration, so the
 * grid lives here, in the contract, and not in the page that shows it.
 *
 * Three configurations are always among the options: the smallest one, the
 * recommended one of the price book and the largest one the product allows.
 * A control built on this grid can therefore always show the configuration a
 * price belongs to.
 */

/** The memory sizes the catalogue knows, in megabytes. */
const RAM_STEPS_MB = [512, 1024, 2048, 4096, 8192, 16384, 32768, 65536, 131072];

/** The vCPU counts the catalogue knows. */
const CPU_STEPS = [1, 2, 4, 8, 16];

/** The memory sizes the customer can pick, in megabytes. */
export function ramOptions(product: CatalogProduct): number[] {
  const min = product.minRam;
  const max = Math.max(min, product.maxRam);
  const values = new Set<number>([min, max, recommendedPreset(product).ram]);
  for (const step of RAM_STEPS_MB) if (step >= min && step <= max) values.add(step);
  return [...values].filter((value) => value >= min && value <= max).sort((a, b) => a - b);
}

/** The vCPU counts the customer can pick. */
export function cpuOptions(product: CatalogProduct): number[] {
  const min = product.minCpu;
  const max = Math.max(min, product.maxCpu);
  const values = new Set<number>([min, max, recommendedPreset(product).cpu]);
  for (const step of CPU_STEPS) if (step >= min && step <= max) values.add(step);
  return [...values].filter((value) => value >= min && value <= max).sort((a, b) => a - b);
}

/**
 * The storage sizes the customer can pick, in gigabytes.
 *
 * The server only accepts whole gigabytes, so the grid holds every whole
 * gigabyte between the smallest and the largest size of the product. The
 * maximum the catalogue announces is therefore reachable, and the recommended
 * configuration of the price book is one of them.
 */
export function diskOptions(product: CatalogProduct): number[] {
  const min = Math.max(1, Math.trunc(product.minDisk));
  const max = Math.max(min, Math.trunc(product.maxDisk));
  const options: number[] = [];
  for (let value = min; value <= max; value += 1) options.push(value);
  return options;
}

/** The option of a list that is the closest to a value. */
export function nearestOption(options: number[], value: number): number {
  if (!options.length) return value;
  return options.reduce((best, option) => (Math.abs(option - value) < Math.abs(best - value) ? option : best), options[0]!);
}

/**
 * A configuration the control can show and the server can price.
 *
 * Every value is moved onto the grid of the options, so the control, the
 * estimate and the price book always talk about the same configuration.
 */
export function selectableConfiguration(
  product: CatalogProduct,
  config: ResourceConfiguration,
): ResourceConfiguration {
  return {
    ram: nearestOption(ramOptions(product), config.ram),
    cpu: nearestOption(cpuOptions(product), config.cpu),
    disk: nearestOption(diskOptions(product), config.disk),
  };
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
 * never shows a configuration the server would refuse. A value that the
 * control cannot show is moved onto the grid of the options, so the control
 * and the estimate always describe the same configuration.
 */
export function configurationFromQuery(
  query: Record<string, string | undefined>,
  product: CatalogProduct,
): ResourceConfiguration {
  const fallback = startingConfiguration(product);
  const read = (key: string, options: number[], fallbackValue: number): number => {
    const raw = query[key];
    if (raw === undefined || raw === '') return fallbackValue;
    const value = Number(raw);
    if (!Number.isInteger(value)) return fallbackValue;
    return nearestOption(options, value);
  };
  return selectableConfiguration(product, {
    ram: read('ram', ramOptions(product), fallback.ram),
    cpu: read('cpu', cpuOptions(product), fallback.cpu),
    disk: read('disk', diskOptions(product), fallback.disk),
  });
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

/**
 * The product the teaser of the homepage shows.
 *
 * The teaser quotes a price, so it shows a product that can be ordered. The
 * server refuses the quote of a product that was not validated for
 * deployment, with a 400, so a teaser that quoted a closed product showed an
 * error in the console and no amount on the screen.
 *
 * A catalog without an orderable product still shows something: the first
 * product that has a price, so the page is never empty.
 */
export function teaserProduct(products: CatalogProduct[]): CatalogProduct | null {
  return (
    products.find((product) => product.pricing && isOrderable(product)) ??
    products.find((product) => product.pricing) ??
    products[0] ??
    null
  );
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


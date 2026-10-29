/**
 * The catalog of the site.
 *
 * The page starts from the snapshot that the build wrote, so a visitor sees
 * the products and their prices before the browser has asked the API for
 * anything. Then the live catalog is fetched and the snapshot is replaced by
 * it, when the API answers.
 *
 * The catalog holds every product the platform lists, not only the ones that
 * can be ordered today. A product that is listed but is not validated for
 * deployment yet is named, priced and marked as coming soon, so a visitor sees
 * what the platform is preparing. The API says which is which, and the site
 * never decides on its own: a product that cannot be ordered is never shown
 * with something that orders it.
 */

import { useSyncExternalStore } from 'react';
import { get } from '../lib/api';
import { DEFAULT_RATES, type Rates } from './pricing';
import snapshot from './data/products.json' with { type: 'json' };

/**
 * The state of a product, as the server names it.
 *
 * The four states are the ones of the platform: a product that can be
 * deployed, one that is coming, one that cannot be built at the moment and
 * one that is not listed at all.
 */
export type AvailabilityState = 'DEPLOYABLE' | 'COMING_SOON' | 'TEMPORARILY_UNAVAILABLE' | 'UNPUBLISHED';

/** What the site knows about the availability of a product. */
export interface ProductAvailability {
  /** The state of the product, seen from the outside. */
  state: AvailabilityState;
  /** The product can be ordered right now. */
  orderable: boolean;
  /** Why the product cannot be ordered. Empty when it can. */
  blockers: string[];
}

/** A product of the catalog, as the site holds it. */
export interface Product {
  slug: string;
  name: string;
  category: string;
  description: string;
  /** The smallest configuration the product accepts. */
  min: { ram: number; cpu: number; disk: number };
  /** The configuration the platform recommends. */
  def: { ram: number; cpu: number; disk: number };
  /** The largest configuration the product accepts. */
  max: { ram: number; cpu: number; disk: number };
  /** The price of the smallest configuration, in minor units. */
  minPrice: number;
  /** The price of the recommended configuration, in minor units. */
  recPrice: number;
  currency: string;
  /** The card of rates of the platform, as the catalog carries it. */
  rates: Rates;
  /** What the server says about the availability of the product. */
  availability: ProductAvailability;
}

/** The product, as the API sends it. */
interface ApiProduct {
  slug: string;
  name: string;
  category: string;
  description: string;
  minRam: number;
  minCpu: number;
  minDisk: number;
  defaultRam: number;
  defaultCpu: number;
  defaultDisk: number;
  maxRam: number;
  maxCpu: number;
  maxDisk: number;
  pricing: {
    currency: string;
    minimum: { amount: number };
    recommended: { amount: number };
    rates: Rates;
  };
  availability?: { state?: AvailabilityState; orderable?: boolean; visible?: boolean; blockers?: string[] };
  visible?: boolean;
  deployable?: boolean;
}

/**
 * The order of the products on the page.
 *
 * The order of the catalog is not the order a visitor reads best in: the
 * three products of the platform are shown in the order of what most people
 * come for. A product that is not named here comes after them.
 */
const ORDER = ['discord-bot', 'code-server', 'postgresql'];

const rank = (slug: string) => {
  const index = ORDER.indexOf(slug);
  return index === -1 ? ORDER.length : index;
};

/** The products of the snapshot, in the order of the page. */
const fromSnapshot = (list: Product[]): Product[] => list.slice().sort((a, b) => rank(a.slug) - rank(b.slug));

let current: Product[] = fromSnapshot(snapshot as Product[]);
const subscribers = new Set<() => void>();

/**
 * The availability of a product, as the site holds it.
 *
 * The API sends the state of the product, and the state is the answer: a
 * product that is not published is not in the catalog, and a product that is
 * not deployable is listed but cannot be ordered.
 *
 * A server that does not send the availability yet is answered with the flag
 * of the product: a product that is not listed is not published, and a
 * product that is listed but cannot be ordered is coming.
 */
export const availabilityOf = (product: ApiProduct): ProductAvailability => {
  const sent = product.availability;
  const visible = sent?.visible ?? product.visible ?? true;
  const orderable = sent?.orderable ?? (product.deployable ?? true);
  const state: AvailabilityState = sent?.state ?? (visible ? (orderable ? 'DEPLOYABLE' : 'COMING_SOON') : 'UNPUBLISHED');
  const blockers = sent?.blockers ?? (orderable ? [] : ['It has not been validated for deployment yet.']);
  return { state, orderable, blockers };
};

/** The product of the API, in the shape the site holds it. */
export const mapApi = (product: ApiProduct): Product => ({
  slug: product.slug,
  name: product.name,
  category: product.category,
  description: product.description,
  min: { ram: product.minRam, cpu: product.minCpu, disk: product.minDisk },
  def: { ram: product.defaultRam, cpu: product.defaultCpu, disk: product.defaultDisk },
  max: { ram: product.maxRam, cpu: product.maxCpu, disk: product.maxDisk },
  minPrice: product.pricing.minimum.amount,
  recPrice: product.pricing.recommended.amount,
  currency: product.pricing.currency,
  rates: product.pricing.rates,
  availability: availabilityOf(product),
});

/** True when the product can be ordered right now. */
export const isOrderable = (product: Product): boolean => product.availability.orderable;

/** The products of a list that can be ordered right now. */
export const orderableOf = (list: Product[]): Product[] => list.filter((product) => product.availability.orderable);

let started = false;

/**
 * Reads the live catalog once.
 *
 * The request is made once and the answer is kept, so a page with three
 * parts that show the catalog causes one request and not three.
 */
export async function refreshCatalog(): Promise<void> {
  if (started) return;
  started = true;
  try {
    const { products } = await get<{ products: ApiProduct[] }>('/catalog/products');
    const live = products
      .filter((product) => availabilityOf(product).state !== 'UNPUBLISHED')
      .map(mapApi)
      .sort((a, b) => rank(a.slug) - rank(b.slug));
    if (live.length) {
      current = live;
      for (const subscriber of subscribers) subscriber();
    }
  } catch {
    // The snapshot stays. A visitor still sees the products and their prices.
  }
}

const subscribe = (subscriber: () => void) => {
  subscribers.add(subscriber);
  return () => {
    subscribers.delete(subscriber);
  };
};

/** The products of the catalog, live. */
export const useProducts = (): Product[] => useSyncExternalStore(subscribe, () => current, () => fromSnapshot(snapshot as Product[]));

/** The card of rates the catalog carries. */
export const useRates = (): Rates => useProducts()[0]?.rates ?? DEFAULT_RATES;

/** The product of a slug, from the catalog that is on the page. */
export function useProduct(slug: string): Product | undefined {
  return useProducts().find((product) => product.slug === slug);
}

/**
 * The products of the catalog, outside of a component.
 *
 * The meta of the pages and the list of the routes of the site are written
 * outside of a component, and they read the catalog from here.
 */
export function productsNow(): Product[] {
  return current;
}

/**
 * The product of a slug, outside of a component.
 *
 * The pages of the documentation name the resources and the price of a product
 * in their text, and the text is written when the page is rendered.
 */
export function productBySlug(slug: string): Product | undefined {
  return current.find((product) => product.slug === slug) ?? (snapshot as Product[]).find((product) => product.slug === slug);
}

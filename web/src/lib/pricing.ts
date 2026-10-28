import { useEffect, useMemo, useState } from 'react';
import { get, type CatalogProduct } from './api';
import { isOrderable } from './pricing-contract';
import type { IconName } from '../icons';

/**
 * The prices that are shown on the public pages come from the catalog of the
 * platform, never from a number that was typed into the page. The amounts are
 * integer minor units, exactly like in the database.
 */
export interface CatalogSummary {
  /** The cheapest app, in minor units. */
  minAppPrice: number | null;
  /** The cheapest database, in minor units. */
  minDatabasePrice: number | null;
  /** How many apps the platform offers. */
  count: number | null;
  currency: string;
  loading: boolean;
}

const EMPTY: CatalogSummary = {
  minAppPrice: null,
  minDatabasePrice: null,
  count: null,
  currency: 'EUR',
  loading: true,
};

/** Loads the catalog once and keeps it for the whole page. */
let cached: { products: CatalogProduct[]; at: number } | null = null;
let pending: Promise<CatalogProduct[]> | null = null;
const listeners = new Set<(products: CatalogProduct[]) => void>();

async function load(): Promise<CatalogProduct[]> {
  if (cached && Date.now() - cached.at < 60_000) return cached.products;
  // The promise is kept as well as the result. Several parts of a page ask
  // for the catalog at the same time, and they must cause one request and not
  // one request per part.
  if (!pending) {
    pending = get<{ products: CatalogProduct[] }>('/catalog/products')
      .then((response) => {
        cached = { products: response.products, at: Date.now() };
        for (const listener of listeners) listener(response.products);
        return response.products;
      })
      .finally(() => {
        pending = null;
      });
  }
  return pending;
}

/**
 * The summary of the catalog: the lowest prices and the number of apps. It is
 * used by the marketing pages so they never show a price the platform does
 * not charge.
 */
export function useCatalogSummary(): CatalogSummary {
  const [summary, setSummary] = useState<CatalogSummary>(EMPTY);

  useEffect(() => {
    let active = true;

    const apply = (products: CatalogProduct[]) => {
      if (!active) return;
      const priced = products.filter((product) => product.price && product.price.amount > 0);
      const apps = priced.filter((product) => product.category !== 'DATABASES');
      const databases = priced.filter((product) => product.category === 'DATABASES');
      const lowest = (list: CatalogProduct[]) =>
        list.length ? Math.min(...list.map((product) => product.price!.amount)) : null;
      setSummary({
        minAppPrice: lowest(apps),
        minDatabasePrice: lowest(databases),
        count: products.length,
        currency: priced[0]?.price?.currency ?? 'EUR',
        loading: false,
      });
    };

    const onLoaded = (products: CatalogProduct[]) => apply(products);
    listeners.add(onLoaded);

    load()
      .then(apply)
      .catch(() => {
        if (!active) return;
        setSummary({ ...EMPTY, loading: false });
      });

    return () => {
      active = false;
      listeners.delete(onLoaded);
    };
  }, []);

  return summary;
}

/** Formats an amount of minor units as a price. */
export function formatPrice(amount: number | null, currency = 'EUR'): string {
  if (amount === null) return '—';
  const units = Math.trunc(Math.abs(amount) / 100);
  const cents = Math.abs(amount % 100).toString().padStart(2, '0');
  const value = `${units}.${cents}`;
  return currency === 'EUR' ? `€${value}` : `${value} ${currency}`;
}

/** The catalog itself, for the pages that show the products in detail. */
export function useCatalogProducts(): { products: CatalogProduct[]; loading: boolean } {
  const [products, setProducts] = useState<CatalogProduct[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let active = true;
    const onLoaded = (loaded: CatalogProduct[]) => {
      if (!active) return;
      setProducts(loaded);
      setLoading(false);
    };
    listeners.add(onLoaded);
    load()
      .then(onLoaded)
      .catch(() => {
        if (!active) return;
        setLoading(false);
      });
    return () => {
      active = false;
      listeners.delete(onLoaded);
    };
  }, []);

  return { products, loading };
}

/**
 * The products that can really be ordered: listed in the public catalog and
 * validated for deployment.
 */
export function useDeployableProducts(): { products: CatalogProduct[]; loading: boolean } {
  const { products, loading } = useCatalogProducts();
  const deployable = useMemo(
    () => products.filter((product) => isOrderable(product) && product.visible),
    [products],
  );
  return { products: deployable, loading };
}

/**
 * Where a "deploy" button leads: the first product that can really be ordered.
 *
 * A product that is only listed cannot be ordered, so a button must never
 * point at one. When nothing is deployable yet there is no target and the
 * button has to say so instead of leading to a dead end.
 *
 * This picks one product for the customer. A button that lets the customer
 * choose must not use it: it has to lead to the catalog instead.
 */
export function useDeployEntry(): { slug: string | null; loading: boolean } {
  const { products, loading } = useDeployableProducts();
  return { slug: products[0]?.slug ?? null, loading };
}

/** The path of the deploy page of a product. */
export function deployPath(slug: string): string {
  return `/app/deploy/${encodeURIComponent(slug)}`;
}

/** The path of the page of a product. It is public. */
export function productPath(slug: string): string {
  return `/apps/${encodeURIComponent(slug)}`;
}

/** The path of the catalog, where the customer picks a product. */
export function catalogPath(): string {
  return '/apps';
}

// --- how the catalog is shown ----------------------------------------------

/** The API stores categories as codes, the site shows friendly labels. */
const CATEGORY_CODE: Record<string, string> = {
  'Web & CMS': 'WEB_CMS',
  'Developer Tools': 'DEVELOPER_TOOLS',
  Monitoring: 'MONITORING',
  Automation: 'AUTOMATION',
  Bots: 'BOTS',
  Databases: 'DATABASES',
  Games: 'GAMES',
};

const CATEGORY_LABEL: Record<string, string> = {
  WEB_CMS: 'Web & CMS',
  DEVELOPER_TOOLS: 'Developer Tools',
  MONITORING: 'Monitoring',
  AUTOMATION: 'Automation',
  BOTS: 'Bots',
  DATABASES: 'Databases',
  EMAIL_HOSTING: 'Email Hosting',
  GAMES: 'Games',
};

/** The code of a category of the interface. */
export function categoryCode(label: string): string | undefined {
  return CATEGORY_CODE[label];
}

/** The label of a category of the API. An unknown code is shown as it is. */
export function categoryLabel(code: string): string {
  return CATEGORY_LABEL[code] ?? code;
}

/** Memory in the unit the customer reads it in. */
export function memLabel(mb: number): string {
  return mb < 1024 ? `${mb} MB` : `${Math.round((mb / 1024) * 10) / 10} GB`;
}

/** The short form of a period, used right after an amount. */
export function periodSuffix(period: string): string {
  if (period === 'MONTHLY') return '/mo';
  if (period === 'YEARLY') return '/yr';
  return '';
}

/** The period of a price in words. */
export function periodLabel(period: string): string {
  if (period === 'MONTHLY') return 'per month';
  if (period === 'YEARLY') return 'per year';
  return period.toLowerCase();
}

const ICONS: readonly IconName[] = [
  'globe', 'db', 'folder', 'term', 'chart', 'card',
  'rocket', 'shield', 'restart', 'box', 'bolt', 'bot',
  'mon', 'flow', 'code', 'doc', 'game',
];

/** A product may carry an icon the interface does not know. It still gets one. */
export function productIcon(name: string): IconName {
  return ICONS.includes(name as IconName) ? (name as IconName) : 'box';
}

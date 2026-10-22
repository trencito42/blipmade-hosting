import { useEffect, useState } from 'react';
import { get, type CatalogProduct } from './api';

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
const listeners = new Set<(products: CatalogProduct[]) => void>();

async function load(): Promise<CatalogProduct[]> {
  if (cached && Date.now() - cached.at < 60_000) return cached.products;
  const response = await get<{ products: CatalogProduct[] }>('/catalog/products');
  cached = { products: response.products, at: Date.now() };
  for (const listener of listeners) listener(response.products);
  return response.products;
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

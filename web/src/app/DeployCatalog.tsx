import { useMemo, useState } from 'react';
import { Icon } from '../icons';
import type { CatalogProduct } from '../lib/api';
import {
  categoryLabel,
  formatPrice,
  memLabel,
  periodSuffix,
  productIcon,
  useCatalogProducts,
} from '../lib/pricing';
import { Link } from '../router';
import { AppMark } from '../ui';
import { EmptyState, ErrorState, LoadingBlock, Panel, ScrollRow, TextInput } from '../ui-app';
import { cn } from '../lib';

/**
 * The product selector of the customer area.
 *
 * The list is the real catalog of the platform, read from
 * GET /api/catalog/products, and every name, price and limit on this page
 * comes from there. A product that is listed but not validated for deployment
 * is shown as it is, with the state it really has, instead of leading to a
 * page that cannot do anything.
 */

/** The order the categories are shown in. */
const CATEGORY_ORDER = [
  'WEB_CMS',
  'DEVELOPER_TOOLS',
  'MONITORING',
  'AUTOMATION',
  'BOTS',
  'DATABASES',
];

const deployLink =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg';

const idleLink =
  'inline-flex h-11 cursor-not-allowed items-center justify-center gap-2 rounded-full bg-s3 px-5 text-[14.5px] font-bold text-ink3';

function availability(product: CatalogProduct): { deployable: boolean; label: string; reason: string } {
  if (!product.deployable) {
    return {
      deployable: false,
      label: 'Coming soon',
      reason: 'This product is not validated for deployment yet. You cannot order it today.',
    };
  }
  if (!product.price) {
    return {
      deployable: false,
      label: 'Not priced yet',
      reason: 'This product has no active price, so it cannot be ordered.',
    };
  }
  return { deployable: true, label: 'Deploy', reason: '' };
}

function ProductCard({ product }: { product: CatalogProduct }) {
  const state = availability(product);
  const price = product.price;

  return (
    <li className="flex flex-col gap-3 rounded-[22px] bg-s1 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <AppMark icon={productIcon(product.icon)} size={44} />
        <div className="min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold tracking-[-0.03em] text-ink">{product.name}</p>
          <p className="mt-0.5 text-[12.5px] font-mono uppercase tracking-[0.08em] text-ink3">
            {categoryLabel(product.category)}
          </p>
        </div>
        {/* The state of the product gets a line of its own on a phone, so the
            name is not cut to make room for the badge. */}
        {!state.deployable && (
          <span className="w-full shrink-0 self-start rounded-full bg-s3 px-3 py-1 text-center text-[11.5px] font-bold uppercase tracking-[0.06em] text-ink2 sm:w-auto">
            {state.label}
          </span>
        )}
      </div>

      <p className="text-[13.5px] leading-relaxed text-ink2">{product.description}</p>

      <dl className="grid grid-cols-3 gap-2 rounded-2xl bg-s2 p-3">
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-ink3">Memory</dt>
          <dd className="mt-0.5 font-mono text-[13px] text-ink">{memLabel(product.minRam)}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-ink3">vCPU</dt>
          <dd className="mt-0.5 font-mono text-[13px] text-ink">{product.minCpu}</dd>
        </div>
        <div>
          <dt className="text-[11.5px] uppercase tracking-[0.06em] text-ink3">Disk</dt>
          <dd className="mt-0.5 font-mono text-[13px] text-ink">{product.minDisk} GB</dd>
        </div>
      </dl>

      {/* On a phone the price and the action are two rows: the price is never
          squeezed into a narrow column and the button is a full-width target. */}
      <div className="mt-auto grid gap-3 sm:flex sm:flex-wrap sm:items-end sm:justify-between">
        <div className="min-w-0">
          {price ? (
            <>
              <p className="font-mono text-[19px] font-semibold tracking-[-0.03em] text-ink">
                {formatPrice(price.amount, price.currency)}
                <span className="text-[13px] font-normal text-ink3"> {periodSuffix(price.period)}</span>
              </p>
              <p className="text-[12px] leading-relaxed text-ink3">Starting price. You choose the resources on the next screen.</p>
            </>
          ) : (
            <p className="text-[13.5px] text-ink3">No price yet.</p>
          )}
        </div>
        {state.deployable ? (
          <Link to={`/app/deploy/${encodeURIComponent(product.slug)}`} className={cn(deployLink, 'w-full sm:w-auto')}>
            Deploy
            <Icon name="arrowUR" size={15} />
          </Link>
        ) : (
          <span className={cn(idleLink, 'w-full sm:w-auto')} aria-disabled="true">
            {state.label}
          </span>
        )}
      </div>

      {!state.deployable && <p className="text-[12.5px] leading-relaxed text-ink3">{state.reason}</p>}
    </li>
  );
}

export default function DeployCatalog() {
  const { products, loading } = useCatalogProducts();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');

  // Only the categories that really exist in the catalog are offered.
  const categories = useMemo(() => {
    const seen = new Set(products.map((product) => product.category));
    const ordered = CATEGORY_ORDER.filter((code) => seen.has(code));
    for (const code of seen) if (!ordered.includes(code)) ordered.push(code);
    return ordered;
  }, [products]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const matchesQuery =
        !needle ||
        product.name.toLowerCase().includes(needle) ||
        product.description.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [products, query, category]);

  const deployableCount = useMemo(
    () => products.filter((product) => product.deployable && product.price).length,
    [products],
  );

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div className="min-w-0">
          <h2 className="text-[19px] font-extrabold tracking-[-0.035em] text-ink">Deploy an app</h2>
          <p className="text-[13.5px] text-ink3">
            {loading
              ? 'Loading the catalog.'
              : `${deployableCount} of ${products.length} products can be deployed right now.`}
          </p>
        </div>
      </div>

      <div className="grid gap-3">
        {/* The shared field: 16px of text, so iOS does not zoom the page when
            the field is focused. */}
        <TextInput
          label="Search the catalog"
          type="search"
          value={query}
          onChange={(event) => setQuery(event.target.value)}
          placeholder="Search by name or description"
          autoComplete="off"
        />

        {categories.length > 0 && (
          <ScrollRow
            label="Filter by category"
            className="-mx-4 sm:mx-0"
            innerClassName="gap-2 px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {['All', ...categories].map((code) => {
              const active = category === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(code)}
                  className={`h-11 shrink-0 rounded-full px-5 text-[14.5px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                    active ? 'bg-ink text-bg' : 'bg-s1 text-ink2 hover:bg-s2 hover:text-ink'
                  }`}
                >
                  {code === 'All' ? 'All' : categoryLabel(code)}
                </button>
              );
            })}
          </ScrollRow>
        )}
      </div>

      {loading ? (
        <LoadingBlock rows={4} label="Loading the catalog" />
      ) : products.length === 0 ? (
        <Panel>
          <EmptyState
            title="The catalog is empty."
            description="There is nothing to deploy at the moment. Please check back later."
          />
        </Panel>
      ) : filtered.length === 0 ? (
        <EmptyState
          title="No product matches your search."
          description="Clear the search or pick another category to see the catalog again."
          action={
            <button
              type="button"
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
              className="inline-flex h-11 items-center justify-center rounded-full bg-s3 px-5 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              Clear filters
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
          {filtered.map((product) => (
            <ProductCard key={product.id} product={product} />
          ))}
        </ul>
      )}
    </div>
  );
}

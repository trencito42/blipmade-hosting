import { useEffect, useMemo, useRef, useState } from 'react';
import { Link } from '../router';
import { useRevealOnChange } from '../lib/useReveal';
import { categoryOf, categoryOrder } from '../site/categories';
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
import {
  availabilityLabel,
  deployPathFor,
  isOrderable,
  orderBlockers,
  startingConfiguration,
  startingPrice,
} from '../lib/pricing-contract';
import { ProductTile } from '../ui';
import { mailCheckoutPath } from './EmailHosting';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, Segmented, SoftButton, StatusPill, TextInput } from '../ui-app';

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
  'GAMES',
  'MONITORING',
  'AUTOMATION',
  'BOTS',
  'DATABASES',
  'EMAIL_HOSTING',
];

function availability(product: CatalogProduct): { deployable: boolean; label: string; reason: string } {
  const blockers = orderBlockers(product);
  if (!isOrderable(product)) {
    return {
      deployable: false,
      // The wording comes from the state of the product on the server, so the
      // same product is called the same thing everywhere.
      label: availabilityLabel(product),
      reason: blockers.length
        ? blockers.join(' ')
        : 'This product is not validated for deployment yet. You cannot order it today.',
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

/** How many products a group shows before "Show more". Scrolling to the end of the list loads the next ones. */
const PAGE = 12;

function ProductCard({ product }: { product: CatalogProduct }) {
  const state = availability(product);
  const amount = startingPrice(product);
  const price = product.price;
  const category = categoryOf(product.category);
  const to = !state.deployable
    ? null
    : product.category === 'EMAIL_HOSTING'
      ? mailCheckoutPath(product.slug)
      : deployPathFor(product.slug, startingConfiguration(product));

  const body = (
    <>
      <div className="grid gap-3">
        <div className="flex items-center justify-between gap-3">
          <ProductTile slug={product.slug} icon={product.icon} size={44} />
          {state.deployable ? null : <StatusPill status="unavailable" label={state.label} />}
        </div>
        <div className="grid gap-1">
          <p className="truncate font-display text-[20px] leading-tight font-semibold tracking-[-0.03em] text-ink">{product.name}</p>
          <p className="text-[12.5px] text-ink3">{category.label}</p>
        </div>
        <p className="line-clamp-2 text-[13.5px] leading-relaxed text-ink2">{product.description}</p>
      </div>
      <p className="flex items-end justify-between gap-3">
        {amount !== null && price ? (
          <span>
            <span className="text-[12.5px] text-ink3">from </span>
            <span className="font-mono text-[22px] font-semibold tracking-[-0.04em] text-ink">{formatPrice(amount, price.currency)}</span>
            <span className="text-[12.5px] text-ink3"> {periodSuffix(price.period)}</span>
          </span>
        ) : (
          <span className="text-[13.5px] text-ink3">No price yet.</span>
        )}
        {state.deployable && <Icon name="arrow" size={14} className="mb-1.5 text-ink3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />}
      </p>
    </>
  );

  const frame = 'group grid h-full content-between gap-6 rounded-[24px] border border-line bg-card p-5';
  return (
    <li>
      {to ? (
        <Link to={to} className={`${frame} transition-colors hover:border-ink/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc`}>
          {body}
        </Link>
      ) : (
        <div className={`${frame} opacity-70`} title={state.reason}>
          {body}
        </div>
      )}
    </li>
  );
}

/** A grid of products that shows a page of them and loads the next page as the reader reaches the end. */
function ProductGrid({ products }: { products: CatalogProduct[] }) {
  const [shown, setShown] = useState(PAGE);
  const end = useRef<HTMLDivElement>(null);
  const visible = products.slice(0, shown);
  const more = products.length > shown;

  // A new list starts from its first page.
  useEffect(() => setShown(PAGE), [products]);

  useEffect(() => {
    const target = end.current;
    if (!target || !more || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) setShown((count) => count + PAGE);
    }, { rootMargin: '240px' });
    observer.observe(target);
    return () => observer.disconnect();
  }, [more, shown]);

  return (
    <>
      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3 2xl:grid-cols-4">
        {visible.map((product) => (
          <ProductCard key={product.id} product={product} />
        ))}
      </ul>
      {more && (
        <div ref={end} className="mt-4 flex justify-center">
          <SoftButton onClick={() => setShown((count) => count + PAGE)}>
            Show more <span className="num text-ink3">({products.length - shown} left)</span>
          </SoftButton>
        </div>
      )}
    </>
  );
}

export default function DeployCatalog() {
  const { products, loading } = useCatalogProducts();
  const [query, setQuery] = useState('');
  const [category, setCategory] = useState('All');
  const [showSoon, setShowSoon] = useState(false);
  const listRef = useRef<HTMLDivElement>(null);
  useRevealOnChange(listRef, [category, query, showSoon], 20);

  // Only the categories that really exist in the catalog are offered, in the
  // order of the public catalog.
  const categories = useMemo(() => {
    const seen = new Set(products.map((product) => product.category));
    return [...seen].sort((left, right) => categoryOrder(left) - categoryOrder(right) || left.localeCompare(right));
  }, [products]);

  const matching = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const matchesQuery = !needle || product.name.toLowerCase().includes(needle) || product.description.toLowerCase().includes(needle);
      return matchesCategory && matchesQuery;
    });
  }, [products, query, category]);

  const ready = matching.filter((product) => isOrderable(product));
  const soon = matching.filter((product) => !isOrderable(product));
  const deployableCount = useMemo(() => products.filter((product) => isOrderable(product)).length, [products]);

  const countOf = (code: string) => products.filter((product) => (code === 'All' ? true : product.category === code) && isOrderable(product)).length;

  return (
    <div className="grid gap-5">
      <div className="min-w-0">
        <h2 className="font-display text-[28px] leading-tight font-semibold tracking-[-0.04em] text-ink">What do you want to run?</h2>
        <p className="mt-1 text-[14px] text-ink3">
          {loading ? 'Loading the catalog.' : `${deployableCount} of ${products.length} products can be deployed right now.`}
        </p>
      </div>

      <div className="grid gap-3 sm:flex sm:items-center">
        <nav aria-label="Filter the catalog by category" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
          <div className="flex w-max gap-1.5">
            {['All', ...categories].map((code) => {
              const meta = categoryOf(code);
              const active = category === code;
              return (
                <button
                  key={code}
                  type="button"
                  aria-pressed={active}
                  onClick={() => setCategory(code)}
                  className={`inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${
                    active ? 'border-acc bg-acc text-on-acc' : 'border-line text-ink2 hover:border-ink/40 hover:text-ink'
                  }`}
                >
                  <Icon name={code === 'All' ? 'box' : meta.icon} size={13} />
                  {code === 'All' ? 'All' : meta.label} <span className="num text-[12.5px] opacity-70">{countOf(code)}</span>
                </button>
              );
            })}
          </div>
        </nav>
        <div className="relative sm:w-64">
          <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink3" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            aria-label="Search the catalog"
            placeholder="Search the catalog"
            autoComplete="off"
            className="h-10 w-full rounded-full border border-line bg-card pr-4 pl-10 text-[16px] text-ink placeholder:text-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:text-[14px]"
          />
        </div>
      </div>

      <div ref={listRef} className="grid gap-6">
        {loading ? (
          <LoadingBlock rows={4} label="Loading the catalog" />
        ) : products.length === 0 ? (
          <Panel>
            <EmptyState title="The catalog is empty." description="There is nothing to deploy at the moment. Please check back later." />
          </Panel>
        ) : matching.length === 0 ? (
          <EmptyState
            title="No product matches your search."
            description="Clear the search or pick another category to see the catalog again."
            action={
              <SoftButton onClick={() => { setQuery(''); setCategory('All'); }}>Clear filters</SoftButton>
            }
          />
        ) : (
          <>
            {ready.length > 0 ? (
              <ProductGrid products={ready} />
            ) : (
              <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">Nothing in this view can be deployed yet.</p>
            )}
            {soon.length > 0 && (
              <section aria-labelledby="soon-h">
                <div className="flex items-center justify-between gap-3 border-t border-line pt-5">
                  <h3 id="soon-h" className="font-display text-[18px] font-semibold tracking-[-0.03em] text-ink">
                    Coming soon <span className="num text-[14px] font-medium text-ink3">{soon.length}</span>
                  </h3>
                  <SoftButton onClick={() => setShowSoon((value) => !value)} aria-expanded={showSoon}>
                    {showSoon ? 'Hide' : 'Show'}
                  </SoftButton>
                </div>
                {showSoon && (
                  <div className="mt-4">
                    <ProductGrid products={soon} />
                  </div>
                )}
              </section>
            )}
          </>
        )}
      </div>
    </div>
  );
}

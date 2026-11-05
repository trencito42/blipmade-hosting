import { useEffect, useMemo, useRef, useState } from 'react';
import { ScrollRow } from '../ScrollRow';
import { Link } from '../router';
import { useRevealOnChange } from '../lib/useReveal';
import { categoryOf, categoryOrder, CATEGORIES } from '../site/categories';
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
import { get } from '../lib/api';
import { useRouter } from '../router';
import { ImportProject } from './ImportProject';
import { useAsync } from '../lib/useAsync';

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
  'VPS',
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
  const resources = product.category === 'EMAIL_HOSTING' ? null : startingConfiguration(product);
  const to = !state.deployable
    ? null
    : product.category === 'EMAIL_HOSTING'
      ? mailCheckoutPath(product.slug)
      : product.category === 'VPS'
        ? `/app/vps/new?plan=${encodeURIComponent(product.slug)}`
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
        {resources && (
          <p className="font-mono text-[12px] text-ink3">
            {memLabel(resources.ram)} · {resources.cpu} vCPU · {resources.disk} GB
          </p>
        )}
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

interface CatalogFamilyCard { slug: string; name: string; summary: string; group: string; variants: { slug?: string; label?: string; product: { slug: string; name?: string; category?: string; orderable: boolean } }[]; presets?: { slug: string; name: string; variantSlug: string | null }[] }

/**
 * What a search word means inside a family: a variant ("forge") or a preset ("survival"). The family opens with it
 * already chosen, so the search lands on the thing that was asked for and not on the first card.
 */
export function familyMatch(family: CatalogFamilyCard, word: string): { variant?: string; preset?: string } {
  const needle = word.trim().toLowerCase();
  if (needle.length < 2) return {};
  const variant = family.variants.find((entry) => entry.product.orderable && entry.slug && [entry.slug, entry.label, entry.product.slug, entry.product.name].some((text) => (text ?? '').toLowerCase().includes(needle)));
  if (variant) return { variant: variant.slug };
  const preset = (family.presets ?? []).find((entry) => `${entry.slug} ${entry.name}`.toLowerCase().includes(needle));
  return preset ? { preset: preset.slug, ...(preset.variantSlug ? { variant: preset.variantSlug } : {}) } : {};
}

/** The address of a family, with the variant or the preset that the search asked for. */
export function familyTo(family: CatalogFamilyCard, word: string): string {
  const match = familyMatch(family, word);
  const query = new URLSearchParams();
  if (match.variant) query.set('variant', match.variant);
  if (match.preset) query.set('preset', match.preset);
  const text = query.toString();
  return `/app/deploy/families/${encodeURIComponent(family.slug)}${text ? `?${text}` : ''}`;
}

export default function DeployCatalog() {
  const { query: routeQuery } = useRouter();
  const journeyFromQuery = routeQuery.journey === 'import' || routeQuery.journey === 'templates' ? routeQuery.journey : 'catalog';
  const [journey, setJourney] = useState<'catalog' | 'import' | 'templates'>(journeyFromQuery);
  const { products, loading } = useCatalogProducts();
  const familiesState = useAsync<{ families: CatalogFamilyCard[] }>((signal) => get('/catalog/families', undefined, signal), []);
  const families = familiesState.data?.families ?? [];
  const [search, setSearch] = useState('');
  const [category, setCategory] = useState('All');
  const [sort, setSort] = useState<'recommended' | 'name' | 'price-asc' | 'price-desc'>('recommended');
  // What is shown by default is what can be bought. The rest is one choice away, not a second list.
  const [availability, setAvailability] = useState<'ready' | 'all'>('ready');
  const listRef = useRef<HTMLDivElement>(null);
  useRevealOnChange(listRef, [category, search, sort, availability], 20);

  // Only the categories that really exist in the catalog are offered, in the
  // order of the public catalog.
  const grouped = useMemo(() => families.filter((family) => family.variants.filter((variant) => variant.product.orderable).length >= 1), [families]);
  const covered = useMemo(() => new Set(grouped.flatMap((family) => family.variants.map((variant) => variant.product.slug))), [grouped]);
  const listed = useMemo(() => products.filter((product) => !covered.has(product.slug)), [products, covered]);
  const categories = useMemo(() => {
    const seen = new Set(products.map((product) => product.category));
    return [...seen].sort((left, right) => categoryOrder(left) - categoryOrder(right) || left.localeCompare(right));
  }, [products]);
  const matching = useMemo(() => {
    const needle = search.trim().toLowerCase();
    const found = listed.filter((product) => {
      const matchesCategory = category === 'All' || product.category === category;
      const label = categoryOf(product.category).label.toLowerCase();
      const matchesQuery =
        !needle || product.name.toLowerCase().includes(needle) || product.description.toLowerCase().includes(needle) || label.includes(needle);
      return matchesCategory && matchesQuery;
    });
    if (sort === 'name') return [...found].sort((a, b) => a.name.localeCompare(b.name));
    if (sort === 'price-asc' || sort === 'price-desc') {
      // A product with no price goes last in both directions: there is nothing to compare.
      const price = (product: CatalogProduct) => startingPrice(product);
      return [...found].sort((a, b) => {
        const left = price(a);
        const right = price(b);
        if (left === null && right === null) return a.name.localeCompare(b.name);
        if (left === null) return 1;
        if (right === null) return -1;
        return sort === 'price-asc' ? left - right : right - left;
      });
    }
    return found;
  }, [listed, search, category, sort]);

  const shownFamilies = useMemo(() => {
    const needle = search.trim().toLowerCase();
    return grouped.filter((family) => {
      const familyCategory = family.variants.find((variant) => variant.product.category)?.product.category;
      const matchesCategory = category === 'All' || familyCategory === category;
      const matchesQuery = !needle || family.name.toLowerCase().includes(needle) || family.variants.some((variant) => (variant.label || variant.product.slug).toLowerCase().includes(needle)) || (family.presets ?? []).some((preset) => `${preset.slug} ${preset.name}`.toLowerCase().includes(needle));
      return matchesCategory && matchesQuery;
    });
  }, [grouped, search, category]);
  const ready = matching.filter((product) => isOrderable(product));
  const soon = availability === 'all' ? matching.filter((product) => !isOrderable(product)) : [];
  const deployableCount = useMemo(() => products.filter((product) => isOrderable(product)).length, [products]);

  const countOf = (code: string) => products.filter((product) => (code === 'All' ? true : product.category === code) && isOrderable(product)).length;

  const templateFamilies = useMemo(
    () => families.filter((family) => family.variants.some((variant) => variant.product.orderable)),
    [families],
  );

  return (
    <div className="grid gap-6">
      <header className="grid gap-3 border-b border-line pb-5">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="min-w-0">
            <h2 className="font-display text-[26px] leading-tight font-semibold tracking-[-0.03em] text-ink sm:text-[28px]">Deploy</h2>
            <p className="mt-1 max-w-2xl text-[14px] text-ink3">
              {loading ? 'Loading the catalog.' : `${deployableCount} products are ready to deploy on this platform.`}
            </p>
          </div>
          <Segmented
            value={journey}
            onChange={(value) => setJourney(value as typeof journey)}
            options={[
              { value: 'catalog', label: 'Catalog' },
              { value: 'import', label: 'Import project' },
              { value: 'templates', label: 'Templates' },
            ]}
            ariaLabel="Deploy journey"
          />
        </div>
      </header>

      {journey === 'import' && <ImportProject />}

      {journey === 'templates' && (
        <section className="grid gap-4" aria-label="Starter templates">
          <p className="max-w-2xl text-[14px] text-ink3">
            Templates are real catalog families with presets. Choose one, configure resources, and the preset is applied after the server is online.
          </p>
          {familiesState.loading ? (
            <LoadingBlock rows={3} label="Loading templates" />
          ) : templateFamilies.length === 0 ? (
            <EmptyState title="No templates yet." description="Order a product from the catalog, then pick a preset on the deploy page." action={<ButtonLink to="/app/deploy">Browse catalog</ButtonLink>} />
          ) : (
            <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
              {templateFamilies.map((family) => (
                <li key={family.slug}>
                  <Link
                    to={familyTo(family, search)}
                    className="grid h-full gap-3 rounded-[20px] border border-line bg-card p-5 transition-colors hover:border-ink/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  >
                    <div className="flex items-start justify-between gap-2">
                      <p className="font-display text-[18px] font-semibold tracking-[-0.02em] text-ink">{family.name}</p>
                      <Icon name="arrow" size={14} className="mt-1 text-ink3" />
                    </div>
                    <p className="line-clamp-3 text-[13.5px] leading-relaxed text-ink2">{family.summary}</p>
                    <p className="text-[12.5px] text-ink3">{family.variants.filter((variant) => variant.product.orderable).length} orderable variants</p>
                  </Link>
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {journey === 'catalog' && (
        <>
      {shownFamilies.length > 0 && category !== 'All' && (
        <section className="grid gap-2" aria-label="Product families">
          <h3 className="text-[13px] font-semibold uppercase tracking-wide text-ink3">Families</h3>
          <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {shownFamilies.map((family) => (
              <li key={family.slug}>
                <Link to={familyTo(family, search)} className="grid h-full gap-2 rounded-[20px] border border-line bg-card p-4 transition-colors hover:border-ink/35 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
                  <p className="font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">{family.name}</p>
                  <p className="line-clamp-2 text-[13px] text-ink2">{family.summary || family.variants.map((variant) => variant.label || variant.product.slug).join(', ')}</p>
                </Link>
              </li>
            ))}
          </ul>
        </section>
      )}
      <div className="grid gap-3 sm:flex sm:items-center">
        <ScrollRow label="Filter the catalog by category" className="flex-1">
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
        </ScrollRow>
        <div className="relative sm:w-64">
          <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink3" />
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            aria-label="Search the catalog"
            placeholder="Search the catalog"
            autoComplete="off"
            className="h-10 w-full rounded-full border border-line bg-card pr-4 pl-10 text-[16px] text-ink placeholder:text-ink3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:text-[14px]"
          />
        </div>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
        <label className="flex items-center gap-2 text-[13px] text-ink3">
          Show
          <select
            value={availability}
            onChange={(event) => setAvailability(event.target.value as 'ready' | 'all')}
            className="h-9 rounded-full border border-line bg-card px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <option value="ready">Ready to deploy</option>
            <option value="all">All products</option>
          </select>
        </label>
        <label className="flex items-center gap-2 text-[13px] text-ink3">
          Sort by
          <select
            value={sort}
            onChange={(event) => setSort(event.target.value as typeof sort)}
            className="h-9 rounded-full border border-line bg-card px-3 text-[14px] text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
          >
            <option value="recommended">Recommended</option>
            <option value="name">Name</option>
            <option value="price-asc">Price: low to high</option>
            <option value="price-desc">Price: high to low</option>
          </select>
        </label>
        <p aria-live="polite" className="ml-auto text-[13px] text-ink3">
          {matching.length + shownFamilies.length} {matching.length + shownFamilies.length === 1 ? 'match' : 'matches'}
        </p>
      </div>

      <div ref={listRef} className="grid gap-6">
        {loading ? (
          <LoadingBlock rows={4} label="Loading the catalog" />
        ) : products.length === 0 ? (
          <Panel>
            <EmptyState title="The catalog is empty." description="There is nothing to deploy at the moment. Please check back later." />
          </Panel>
        ) : matching.length === 0 && shownFamilies.length === 0 ? (
          <EmptyState
            title="No product matches your search."
            description="Clear the search or pick another category to see the catalog again."
            action={
              <SoftButton onClick={() => { setSearch(''); setCategory('All'); }}>Clear filters</SoftButton>
            }
          />
        ) : (
          <>
            {category === 'All' ? (
              CATEGORIES.filter((meta) => categories.includes(meta.id)).map((meta) => {
                const sectionProducts = ready.filter((product) => product.category === meta.id);
                const sectionFamilies = shownFamilies.filter((family) => family.variants.some((variant) => variant.product.category === meta.id));
                if (sectionProducts.length === 0 && sectionFamilies.length === 0) return null;
                return (
                  <section key={meta.id} aria-labelledby={`cat-${meta.id}`} className="grid gap-4 rounded-[24px] border border-line bg-card/40 p-5">
                    <header className="grid gap-1 border-b border-line/80 pb-4">
                      <h3 id={`cat-${meta.id}`} className="flex items-center gap-2 font-display text-[20px] font-semibold tracking-[-0.03em] text-ink">
                        <Icon name={meta.icon} size={18} />
                        {meta.label}
                      </h3>
                      <p className="max-w-2xl text-[14px] text-ink3">{meta.blurb}</p>
                    </header>
                    {sectionFamilies.length > 0 && (
                      <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
                        {sectionFamilies.map((family) => (
                          <li key={family.slug}>
                            <Link to={familyTo(family, search)} className="grid h-full gap-2 rounded-[18px] border border-line bg-card p-4 transition-colors hover:border-ink/35">
                              <p className="font-display text-[16px] font-semibold text-ink">{family.name}</p>
                              <p className="line-clamp-2 text-[13px] text-ink2">{family.summary}</p>
                            </Link>
                          </li>
                        ))}
                      </ul>
                    )}
                    {sectionProducts.length > 0 && <ProductGrid products={sectionProducts} />}
                  </section>
                );
              })
            ) : ready.length > 0 ? (
              <ProductGrid products={ready} />
            ) : shownFamilies.length > 0 ? null : (
              <p className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">Nothing in this view can be deployed yet.</p>
            )}
            {soon.length > 0 && (
              <section aria-labelledby="soon-h">
                <h3 id="soon-h" className="border-t border-line pt-5 font-display text-[17px] font-semibold tracking-[-0.02em] text-ink">
                  Not available yet <span className="num text-[14px] font-medium text-ink3">{soon.length}</span>
                </h3>
                <div className="mt-4">
                  <ProductGrid products={soon} />
                </div>
              </section>
            )}
          </>
        )}
      </div>
        </>
      )}
    </div>
  );
}

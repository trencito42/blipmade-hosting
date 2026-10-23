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
import {
  availabilityLabel,
  deployPathFor,
  isOrderable,
  orderBlockers,
  startingConfiguration,
  startingPrice,
} from '../lib/pricing-contract';
import { AppMark } from '../ui';
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
  'MONITORING',
  'AUTOMATION',
  'BOTS',
  'DATABASES',
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

function ProductCard({ product }: { product: CatalogProduct }) {
  const state = availability(product);
  const amount = startingPrice(product);
  const price = product.price;

  return (
    <li className="flex flex-col gap-3 rounded-[22px] bg-s1 p-4 sm:p-5">
      <div className="flex flex-wrap items-start gap-3">
        <AppMark icon={productIcon(product.icon)} size={44} />
        <div className="w-0 min-w-0 flex-1">
          <p className="truncate text-[16px] font-extrabold tracking-[-0.03em] text-ink">{product.name}</p>
          <p className="mt-0.5 text-[12.5px] font-mono uppercase tracking-[0.08em] text-ink3">
            {categoryLabel(product.category)}
          </p>
        </div>
        {/* The state of the product gets a line of its own on a phone, so the
            name is not cut to make room for the badge. */}
        {!state.deployable && (
          <div className="w-full shrink-0 self-start sm:w-auto">
            <StatusPill status="unavailable" label={state.label} />
          </div>
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
          {amount !== null && price ? (
            <>
              <p className="font-mono text-[19px] font-semibold tracking-[-0.03em] text-ink">
                {formatPrice(amount, price.currency)}
                <span className="text-[13px] font-normal text-ink3"> {periodSuffix(price.period)}</span>
              </p>
              <p className="text-[12px] leading-relaxed text-ink3">
                Starting price, for the smallest configuration: {memLabel(product.minRam)} · {product.minCpu} vCPU · {product.minDisk} GB.
                You choose the resources on the next screen.
              </p>
            </>
          ) : (
            <p className="text-[13.5px] text-ink3">No price yet.</p>
          )}
        </div>
        {state.deployable ? (
          <ButtonLink to={deployPathFor(product.slug, startingConfiguration(product))} className="w-full sm:w-auto">
            Deploy
            <Icon name="arrowUR" size={15} />
          </ButtonLink>
        ) : (
          <SoftButton disabled className="w-full sm:w-auto">
            {state.label}
          </SoftButton>
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
    () => products.filter((product) => isOrderable(product)).length,
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
          /* The band of filters is the shared selector of the interface: it
             scrolls sideways on a phone and its right edge fades. */
          <Segmented
            role="group"
            ariaLabel="Filter the catalog by category"
            options={['All', ...categories].map((code) => ({
              value: code,
              label: code === 'All' ? 'All' : categoryLabel(code),
            }))}
            value={category}
            onChange={setCategory}
          />
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
            <SoftButton
              onClick={() => {
                setQuery('');
                setCategory('All');
              }}
            >
              Clear filters
            </SoftButton>
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

import { useMemo, useState, type ReactNode } from 'react';
import { ApiError, get, type CatalogProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { categoryLabel, formatPrice, memLabel, periodLabel, productIcon } from '../lib/pricing';
import {
  availabilityLabel,
  deployPathFor,
  isOrderable,
  orderBlockers,
  recommendedPreset,
  recommendedPrice,
  sameConfiguration,
  startingConfiguration,
  startingPrice,
} from '../lib/pricing-contract';
import { Link, useParams } from '../router';
import { useSession } from '../session';
import { AppMark, Button, Reveal, Wrap } from '../ui';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../ui-app';
import { Nav } from '../home/Nav';
import { Footer } from '../home/Closing';
import { useCatalogProducts } from '../lib/pricing';

/**
 * The page of one product, and the catalog that lists the products.
 *
 * Both are public: a visitor without an account sees the same thing, and the
 * deploy action sends them to the login with the product in the ?next=
 * parameter. Every name, price and limit comes from GET /api/catalog/products,
 * so the pages can never show something the server does not know.
 */

/** The shell of a public page: the navigation of the site and its footer. */
function PublicShell({ children }: { children: ReactNode }) {
  return (
    <>
      <Nav />
      <main className="min-h-[100svh] pt-[96px] sm:pt-[112px]">{children}</main>
      <Footer />
    </>
  );
}

/**
 * The catalog on a page of its own.
 *
 * The products come from the catalogue of the API, the categories come from
 * the same place, and the price of a card is the price of the smallest
 * configuration of that product.
 */
export function CatalogIndex() {
  const { products, loading } = useCatalogProducts();
  const [group, setGroup] = useState<string>('all');
  const [query, setQuery] = useState('');

  /** The categories the catalogue really holds. */
  const categories = useMemo(() => {
    const found = new Map<string, string>();
    for (const product of products) found.set(product.category, categoryLabel(product.category));
    return [...found.entries()];
  }, [products]);

  const list = useMemo(() => {
    const needle = query.trim().toLowerCase();
    return products.filter(
      (product) =>
        (group === 'all' || product.category === group) &&
        (!needle || `${product.name} ${product.description}`.toLowerCase().includes(needle)),
    );
  }, [products, group, query]);

  const pill = (on: boolean) =>
    `h-11 shrink-0 whitespace-nowrap rounded-full px-4 text-[14px] font-medium transition-colors duration-200 ${
      on ? 'bg-acc text-black' : 'border border-line bg-card text-ink2 hover:text-ink'
    }`;

  return (
    <>
      <Nav />
      <main id="top" className="min-h-[100svh] pt-[96px] sm:pt-[112px]">
        <section aria-labelledby="apps-title" className="pb-24">
          <Wrap className="grid gap-10">
          <Reveal className="grid gap-4">
            <h1 id="apps-title" className="max-w-3xl text-[clamp(40px,6vw,76px)] leading-[1] font-semibold tracking-[-0.045em] [text-wrap:balance]">
              Apps and databases, ready to run.
            </h1>
            <p className="max-w-xl text-[17px] text-ink2">
              Pick a product, choose the memory, CPU and storage it needs, and deploy. The price follows the resources you choose.
            </p>
          </Reveal>

          <div className="grid gap-4">
            <label className="sr-only" htmlFor="apps-search">
              Search the catalog
            </label>
            <input
              id="apps-search"
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search the catalog"
              className="h-12 w-full max-w-md rounded-xl border border-line bg-card px-4 text-[15px] text-ink outline-none transition-[border-color,box-shadow] placeholder:text-ink3 focus:border-acc focus:shadow-[0_0_0_3px_rgb(34_197_94/0.18)]"
            />
            <div role="group" aria-label="Category" className="flex gap-2 overflow-x-auto pb-1">
              <button type="button" aria-pressed={group === 'all'} className={pill(group === 'all')} onClick={() => setGroup('all')}>
                All
              </button>
              {categories.map(([code, label]) => (
                <button key={code} type="button" aria-pressed={group === code} className={pill(group === code)} onClick={() => setGroup(code)}>
                  {label}
                </button>
              ))}
            </div>
          </div>

          {loading ? (
            <LoadingBlock rows={3} label="Loading the catalog" />
          ) : list.length === 0 ? (
            <div className="rounded-2xl border border-line bg-s1 p-8">
              <p className="text-[18px] font-semibold">No product matches your search.</p>
              <p className="mt-1 text-[15px] text-ink2">Clear the search or pick another category.</p>
            </div>
          ) : (
            <ul className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {list.map((product, i) => (
                <li key={product.id} className="card-in" style={{ ['--i' as string]: i % 12 }}>
                  <article className="grid h-full content-between gap-6 rounded-2xl border border-line bg-card p-6 transition-[border-color,transform] duration-300 hover:-translate-y-1 hover:border-acc/50">
                    <div className="grid gap-2">
                      <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink3">{categoryLabel(product.category)}</p>
                      <h2 className="text-[22px] font-semibold tracking-tight">
                        <Link to={`/apps/${product.slug}`} className="outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
                          {product.name}
                        </Link>
                      </h2>
                      <p className="text-[15px] text-ink2">{product.description}</p>
                    </div>
                    <div className="grid gap-4">
                      <dl className="grid grid-cols-3 gap-2 text-[13px]">
                        <div>
                          <dt className="text-ink3">Memory</dt>
                          <dd className="font-mono">{memLabel(product.minRam)}</dd>
                        </div>
                        <div>
                          <dt className="text-ink3">vCPU</dt>
                          <dd className="font-mono">{product.minCpu}</dd>
                        </div>
                        <div>
                          <dt className="text-ink3">Storage</dt>
                          <dd className="font-mono">{product.minDisk} GB</dd>
                        </div>
                      </dl>
                      <div className="flex items-center justify-between gap-3 border-t border-line pt-4">
                        <p className="text-[14px] text-ink2">
                          From{' '}
                          <span className="font-mono text-[18px] font-semibold text-ink">
                            {product.pricing?.minimum.amount !== undefined ? formatPrice(product.pricing.minimum.amount, product.pricing.currency) : '—'}
                          </span>{' '}
                          / mo
                        </p>
                        <Button to={`/apps/${product.slug}`}>Deploy</Button>
                      </div>
                    </div>
                  </article>
                </li>
              ))}
            </ul>
          )}

          <p className="text-[13px] text-ink3">
            Prices in euros per month, from the smallest configuration.{' '}
            <Link to="/docs?p=resources" className="underline underline-offset-4 hover:text-ink2">
              Read how resources and billing work
            </Link>
            .
          </p>
          </Wrap>
        </section>
      </main>
      <Footer />
    </>
  );
}

/** The product that is on the page. Everything of it comes from the API. */
export default function ProductPage() {
  const { slug = '' } = useParams();
  const { user, loading: sessionLoading } = useSession();

  const state = useAsync<{ product: CatalogProduct }>(
    (signal) => get<{ product: CatalogProduct }>(`/catalog/products/${encodeURIComponent(slug)}`, undefined, signal),
    [slug],
  );

  const product = state.data?.product;
  // A product that is not in the catalog is not a failure of the site.
  const missing = state.error instanceof ApiError && state.error.status === 404;

  if (state.loading) {
    return (
      <PublicShell>
        <Wrap>
          <div className="py-6">
            <LoadingBlock rows={3} label="Loading the product" />
          </div>
        </Wrap>
      </PublicShell>
    );
  }

  if (state.error && !missing) {
    return (
      <PublicShell>
        <Wrap>
          <div className="grid gap-4 py-6">
            <ErrorState title="The product could not be loaded" message={state.error.message} onRetry={state.reload} />
            <p className="text-[14px] text-ink2">
              <Link to="/apps" className="font-medium text-ink underline underline-offset-4">
                Back to the catalog
              </Link>
            </p>
          </div>
        </Wrap>
      </PublicShell>
    );
  }

  if (missing || !product) {
    return (
      <PublicShell>
        <Wrap>
          <div className="py-6">
            <EmptyState
              title="This product does not exist."
              description="It is not in the catalog, or it is not listed for the public. The catalog shows everything that is available."
              action={
                <Button to="/apps">
                  Back to the catalog
                </Button>
              }
            />
          </div>
        </Wrap>
      </PublicShell>
    );
  }

  const isDatabase = product.category === 'DATABASES';
  // The deploy button carries the configuration the starting price is the
  // price of, so the configurator starts where the page promised.
  const startConfiguration = startingConfiguration(product);
  const target = deployPathFor(product.slug, startConfiguration);
  // A visitor without a session is sent to the login with the same path. While
  // the session is still being checked the deploy page is used: its guard
  // sends a visitor to the login anyway.
  const deployHref = user || sessionLoading ? target : `/login?next=${encodeURIComponent(target)}`;
  const orderable = isOrderable(product);
  const blockers = orderBlockers(product);
  const stateLabel = availabilityLabel(product);
  const startAmount = startingPrice(product);
  const recommendation = recommendedPreset(product);
  const recommendationAmount = recommendedPrice(product);

  return (
    <PublicShell>
      <Wrap>
        <div className="grid gap-12 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:py-10">
          <div>
            <Link to="/apps" className="inline-flex items-center gap-1.5 text-[14px] text-ink2 transition-colors hover:text-ink">
              <span aria-hidden="true">&larr;</span>
              Back to the catalog
            </Link>

            <div className="mt-8 flex items-center gap-4">
              <AppMark icon={productIcon(product.icon)} size={56} />
              <div className="min-w-0">
                <p className="font-mono text-[12px] uppercase tracking-[0.08em] text-ink3">{categoryLabel(product.category)}</p>
                <h1 className="mt-1 text-[clamp(32px,5vw,56px)] font-semibold leading-[1.02] tracking-[-0.045em]">{product.name}</h1>
              </div>
            </div>

            <p className="mt-5 max-w-[56ch] text-[17px] leading-relaxed text-ink2">{product.description}</p>

            <div className="mt-7">
              {startAmount !== null ? (
                <>
                  <p className="flex flex-wrap items-baseline gap-2">
                    <span className="font-mono text-[clamp(26px,4vw,34px)] font-semibold tracking-[-0.04em] text-ink">
                      {formatPrice(startAmount, product.price?.currency ?? 'EUR')}
                    </span>
                    <span className="text-[14px] text-ink3">{periodLabel(product.price?.period ?? 'MONTHLY')}</span>
                  </p>
                  {/* The price on this page belongs to one configuration, and
                      that configuration is named here. */}
                  <p className="mt-1 text-[13.5px] text-ink3">
                    Starting price, for the smallest configuration: {memLabel(startConfiguration.ram)} · {startConfiguration.cpu} vCPU ·{' '}
                    {startConfiguration.disk} GB. The resources are chosen on the next screen.
                  </p>
                  {recommendationAmount !== null && !sameConfiguration(startConfiguration, recommendation) && (
                    <p className="mt-1 text-[13.5px] text-ink3">
                      The recommended configuration ({memLabel(recommendation.ram)} · {recommendation.cpu} vCPU · {recommendation.disk} GB) costs{' '}
                      {formatPrice(recommendationAmount, product.price?.currency ?? 'EUR')} {periodLabel(product.price?.period ?? 'MONTHLY')}.
                    </p>
                  )}
                </>
              ) : (
                <p className="text-[15px] text-ink3">Not priced yet.</p>
              )}
            </div>

            <div className="mt-7">
              {orderable ? (
                <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
                  <Button to={deployHref} size="lg">
                    {isDatabase ? 'Deploy this database' : 'Deploy this app'}
                  </Button>
                  {!user && !sessionLoading && <span className="text-[13.5px] text-ink3">An account is needed to deploy it.</span>}
                </div>
              ) : (
                <p className="rounded-xl border border-line bg-card px-4 py-3.5 text-[14.5px] leading-relaxed text-ink2">
                  {blockers.length ? `This product is ${stateLabel.toLowerCase()}. ${blockers.join(' ')}` : `This product is ${stateLabel.toLowerCase()}.`}
                </p>
              )}
            </div>
          </div>

          <div className="grid gap-4">
            <Panel title="Minimum resources" description="What the smallest deployment needs.">
              <dl className="grid gap-2.5">
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[14px] text-ink2">Memory</dt>
                  <dd className="font-mono text-[14px] text-ink">{memLabel(product.minRam)}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[14px] text-ink2">vCPU</dt>
                  <dd className="font-mono text-[14px] text-ink">{product.minCpu}</dd>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <dt className="text-[14px] text-ink2">Disk</dt>
                  <dd className="font-mono text-[14px] text-ink">{product.minDisk} GB</dd>
                </div>
              </dl>
            </Panel>

            {product.options.length > 0 && (
              <Panel title="Options" description="Add-ons you can pick on the next screen.">
                <ul className="grid gap-2.5">
                  {product.options.map((option) => (
                    <li key={option.code} className="rounded-xl bg-s2 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-semibold text-ink">{option.name}</p>
                          <p className="font-mono text-[11.5px] text-ink3">{option.code}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[14px] text-ink2">{formatPrice(option.amount, option.currency)}</span>
                      </div>
                      {option.description && <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">{option.description}</p>}
                    </li>
                  ))}
                </ul>
              </Panel>
            )}
          </div>
        </div>
      </Wrap>
    </PublicShell>
  );
}

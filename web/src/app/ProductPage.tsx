import { useState, type ReactNode } from 'react';
import type { Category } from '../data';
import { ApiError, get, type CatalogProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import {
  catalogPath,
  categoryLabel,
  formatPrice,
  memLabel,
  periodLabel,
  productIcon,
} from '../lib/pricing';
import {
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
import { AppMark, Button, Eyebrow, Headline, Wrap } from '../ui';
import { EmptyState, ErrorState, LoadingBlock, Panel } from '../ui-app';
import { Catalog } from '../home/Catalog';
import { Nav } from '../home/Nav';
import { Footer } from '../home/Rest';

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
      {/* The category of the navigation belongs to the catalog page. Here the
          chips only lead back to the site. */}
      <Nav setCat={() => {}} />
      <main className="pt-[84px] sm:pt-[104px]">{children}</main>
      <Footer />
    </>
  );
}

/**
 * The catalog on a page of its own.
 *
 * The homepage shows the same section. This page exists so that a customer who
 * has no instance yet can pick a product without the rest of the homepage in
 * between. The category of the navigation belongs to this page, so the chips
 * and the list always agree.
 */
export function CatalogIndex() {
  const [cat, setCat] = useState<Category>('All');
  return (
    <>
      <Nav setCat={setCat} />
      <main className="pt-[84px] sm:pt-[104px]">
        <Catalog cat={cat} setCat={setCat} />
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
            <ErrorState
              title="The product could not be loaded"
              message={state.error.message}
              onRetry={state.reload}
            />
            <p className="text-[14px] text-ink2">
              <Link to={catalogPath()} className="font-bold text-acc hover:underline">
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
                <Button to={catalogPath()} icon="arrowUR">
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
  const startAmount = startingPrice(product);
  const recommendation = recommendedPreset(product);
  const recommendationAmount = recommendedPrice(product);

  return (
    <PublicShell>
      <Wrap>
        <div className="grid gap-8 py-6 lg:grid-cols-[minmax(0,1fr)_340px] lg:items-start lg:gap-12 lg:py-10">
          <div>
            <Link
              to={catalogPath()}
              className="inline-flex items-center gap-1.5 text-[13.5px] font-bold text-ink3 transition-colors duration-[180ms] hover:text-ink focus-visible:rounded focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
            >
              <span aria-hidden="true">&larr;</span>
              Back to the catalog
            </Link>

            <div className="mt-6 flex items-center gap-4">
              <AppMark icon={productIcon(product.icon)} size={56} />
              <div className="min-w-0">
                <Eyebrow>{categoryLabel(product.category)}</Eyebrow>
                <Headline as="h1" lines={[product.name]} className="mt-1.5 text-[clamp(28px,5vw,52px)] leading-[0.98]" />
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
                  <Button to={deployHref} size="lg" icon="arrowUR">
                    {isDatabase ? 'Deploy this database' : 'Deploy this app'}
                  </Button>
                  {!user && !sessionLoading && (
                    <span className="text-[13.5px] text-ink3">An account is needed to deploy it.</span>
                  )}
                </div>
              ) : (
                <p className="rounded-2xl bg-s2 px-4 py-3.5 text-[14.5px] leading-relaxed text-ink2">
                  {blockers.length
                    ? `This product cannot be ordered yet. ${blockers.join(' ')}`
                    : 'This product cannot be ordered yet.'}
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
                    <li key={option.code} className="rounded-2xl bg-s2 p-3.5">
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0">
                          <p className="text-[14.5px] font-bold text-ink">{option.name}</p>
                          <p className="font-mono text-[11.5px] text-ink3">{option.code}</p>
                        </div>
                        <span className="shrink-0 font-mono text-[14px] text-ink2">
                          {formatPrice(option.amount, option.currency)}
                        </span>
                      </div>
                      {option.description && (
                        <p className="mt-1.5 text-[13.5px] leading-relaxed text-ink2">{option.description}</p>
                      )}
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

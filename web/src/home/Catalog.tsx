import { useMemo, useState } from 'react';
import { CATEGORIES, type Category } from '../data';
import { get, type CatalogProduct } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { cn } from '../lib';
import {
  categoryCode,
  categoryLabel,
  formatPrice,
  memLabel,
  periodSuffix,
  productIcon,
  productPath,
} from '../lib/pricing';
import { isOrderable, orderBlockers, startingPrice } from '../lib/pricing-contract';
import { AppMark, Button, Eyebrow, Headline, Reveal, Wrap } from '../ui';
import { ScrollRow } from '../ui-app';
import { Link } from '../router';

/**
 * The catalog on the homepage is the catalog the platform actually sells.
 * Every product, every price and every availability flag comes from
 * GET /api/catalog/products. Nothing here is hardcoded, so the page can never
 * advertise a product or an amount the server does not know about.
 */

/** Flat tiles for the three products the section puts on top. */
const POP = [
  { card: 'bg-acc text-on-acc', cta: 'bg-on-acc text-acc', mark: 'acc' as const, muted: 'bg-on-acc/15 text-on-acc' },
  { card: 'bg-ink text-bg', cta: 'bg-bg text-acc', mark: 'lit' as const, muted: 'bg-bg/15 text-bg' },
  { card: 'bg-s2 text-ink', cta: 'bg-acc text-on-acc', mark: 'dark' as const, muted: 'bg-s3 text-ink2' },
];

function Skeleton({ className }: { className?: string }) {
  return <div aria-hidden="true" className={cn('animate-pulse rounded-[24px] bg-s1', className)} />;
}

/** The amount, with the period it covers. A product without a price says so. */
function Amount({ product, className, suffixClass = 'opacity-70' }: { product: CatalogProduct; className?: string; suffixClass?: string }) {
  const amount = startingPrice(product);
  if (amount === null) return <span className={cn('font-mono text-ink3', className)}>Not priced</span>;
  return (
    <span className={className}>
      {formatPrice(amount, product.price?.currency ?? 'EUR')}
      <span className={suffixClass}>{periodSuffix(product.price?.period ?? 'MONTHLY')}</span>
    </span>
  );
}

export function Catalog({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  const [q, setQ] = useState('');
  const state = useAsync<{ products: CatalogProduct[] }>((signal) =>
    get<{ products: CatalogProduct[] }>('/catalog/products', undefined, signal),
  );

  const products = state.data?.products ?? [];
  const needle = q.trim().toLowerCase();

  const list = useMemo(
    () =>
      products.filter((product) => {
        if (cat !== 'All' && product.category !== categoryCode(cat)) return false;
        if (!needle) return true;
        const label = categoryLabel(product.category);
        return `${product.name} ${label} ${product.description}`.toLowerCase().includes(needle);
      }),
    [products, cat, needle],
  );

  // The products that can be deployed come first: they are the ones the
  // platform can deliver today.
  const featured = useMemo(
    () => [...products].sort((a, b) => Number(isOrderable(b)) - Number(isOrderable(a))).slice(0, 3),
    [products],
  );

  const loading = state.loading && !state.error;
  const failed = Boolean(state.error);

  return (
    <section id="apps" className="scroll-mt-24 py-16 sm:py-28">
      <Wrap>
        <div className="mb-8 grid max-w-3xl gap-4 sm:mb-10">
          <Eyebrow>Catalog</Eyebrow>
          <Headline lines={['Explore', 'the catalog.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" />
          <Reveal as="p" className="text-[17px] text-ink2 sm:text-[18px]">Search, filter, pick. Every app shows its starting price up front.</Reveal>
        </div>

        {loading ? (
          <div className="-mx-4 mb-3.5 flex snap-x gap-3 overflow-x-auto px-4 pb-1 bm-hide-scroll sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
            {Array.from({ length: 3 }, (_, i) => (
              <Skeleton key={i} className="min-h-[250px] w-[82vw] max-w-[360px] shrink-0 snap-start sm:w-auto sm:max-w-none sm:min-h-[270px]" />
            ))}
          </div>
        ) : (
          featured.length > 0 && (
            <div className="-mx-4 mb-3.5 flex snap-x gap-3 overflow-x-auto px-4 pb-1 bm-hide-scroll sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
              {featured.map((product, i) => {
                const tone = POP[i] ?? POP[2];
                const deployable = isOrderable(product);
                return (
                  <Reveal key={product.slug} delay={i * 60} className={cn('group grid min-h-[250px] w-[82vw] max-w-[360px] shrink-0 snap-start content-between gap-8 rounded-[28px] p-6 sm:w-auto sm:max-w-none sm:min-h-[270px]', tone.card)}>
                    <div className="flex items-start justify-between"><AppMark icon={productIcon(product.icon)} size={52} tone={tone.mark} /><span className="font-mono text-[12px] uppercase tracking-[0.1em] opacity-60">Popular</span></div>
                    <div>
                      <p className="text-[clamp(34px,3.4vw,46px)] font-extrabold leading-none tracking-[-0.06em]">{product.name}</p>
                      <p className="mt-2 max-w-[22em] opacity-70">{product.description}</p>
                      <div className="mt-5 flex items-center justify-between gap-3">
                        <Amount product={product} className="font-mono text-[15px]" />
                        {deployable ? (
                          <Link to={productPath(product.slug)} className={cn('inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[14.5px] font-bold transition-transform duration-[180ms] group-hover:translate-x-0.5', tone.cta)}>Deploy<Icon name="arrowUR" size={15} /></Link>
                        ) : (
                          <span
                            className={cn('inline-flex h-11 items-center rounded-full px-5 text-[13.5px] font-bold', tone.muted)}
                            title={orderBlockers(product).join(' ')}
                          >
                            Not available yet
                          </span>
                        )}
                      </div>
                      {!deployable && orderBlockers(product).length > 0 && (
                        <p className="mt-3 text-[13px] leading-relaxed opacity-70">{orderBlockers(product).join(' ')}</p>
                      )}
                    </div>
                  </Reveal>
                );
              })}
            </div>
          )
        )}

        <div className="mb-5 mt-8 grid gap-3 sm:mt-10 lg:grid-cols-[minmax(260px,380px)_1fr] lg:items-center">
          <label className="flex h-12 items-center gap-2.5 rounded-full bg-s1 px-4 text-ink3 transition-colors duration-[180ms] focus-within:bg-s2">
            <Icon name="search" />
            <span className="sr-only">Search apps and databases</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps and databases" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3" />
          </label>
          <ScrollRow
            label="Categories"
            className="-mx-4 sm:mx-0"
            innerClassName="gap-2 px-4 pb-1 sm:flex-wrap sm:overflow-visible sm:px-0 sm:pb-0"
          >
            {CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cn('h-11 shrink-0 rounded-full px-5 text-[14.5px] font-bold transition-colors duration-[180ms]', cat === c ? 'bg-ink text-bg' : 'bg-s1 text-ink2 hover:bg-s2 hover:text-ink')}>{c}</button>
            ))}
          </ScrollRow>
        </div>

        {failed ? (
          <div role="alert" className="grid gap-3 rounded-[24px] bg-s1 p-8 text-center sm:p-10">
            <p className="text-[17px] font-extrabold tracking-[-0.02em]">The catalog could not be loaded.</p>
            <p className="text-[14.5px] text-ink2">{state.error?.message ?? 'Something went wrong while loading the catalog.'}</p>
            <div className="flex justify-center pt-1">
              <Button onClick={state.reload}>Try again</Button>
            </div>
          </div>
        ) : loading ? (
          <div className="grid grid-cols-[minmax(0,1fr)] gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-busy="true" aria-live="polite">
            {Array.from({ length: 8 }, (_, i) => (
              <Skeleton key={i} className="h-[190px]" />
            ))}
          </div>
        ) : (
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-live="polite">
            {list.map((product) => {
              const deployable = isOrderable(product);
              const blockers = orderBlockers(product);
              const body = (
                <>
                  <div className="flex items-center gap-3">
                    <AppMark icon={productIcon(product.icon)} size={46} />
                    <div className="w-0 min-w-0 flex-1"><h3 className="truncate text-[18px] font-extrabold leading-tight tracking-[-0.035em]">{product.name}</h3><span className="font-mono text-[12px] text-ink3">{categoryLabel(product.category)}</span></div>
                  </div>
                  <p className="text-[14.5px] text-ink2">{product.description}</p>
                  <div className="flex items-end justify-between gap-3">
                    <div>
                      <p className="font-mono text-[11.5px] text-ink3">Min. {memLabel(product.minRam)} · {product.minDisk} GB disk</p>
                      <Amount product={product} className="mt-1 block font-mono text-[16px] font-medium" suffixClass="text-ink3" />
                    </div>
                    {deployable ? (
                      <span className="grid size-10 place-items-center rounded-full bg-s3 text-ink transition-colors duration-[180ms] group-hover:bg-acc group-hover:text-on-acc"><Icon name="arrowUR" size={17} /></span>
                    ) : (
                      <span className="rounded-full bg-s3 px-3 py-1.5 font-mono text-[11.5px] text-ink2">Not available yet</span>
                    )}
                  </div>
                  {!deployable && blockers.length > 0 && (
                    <p className="text-[12.5px] leading-relaxed text-ink3">{blockers.join(' ')}</p>
                  )}
                </>
              );

              if (!deployable) {
                return (
                  <div key={product.slug} className="grid content-between gap-5 rounded-[24px] bg-s1 p-5">
                    {body}
                  </div>
                );
              }

              return (
                <Link key={product.slug} to={productPath(product.slug)} className="group grid content-between gap-5 rounded-[24px] bg-s1 p-5 outline-none transition-colors duration-[180ms] hover:bg-s2 focus-visible:ring-2 focus-visible:ring-acc active:scale-[0.99]">
                  {body}
                </Link>
              );
            })}
            {!list.length && (
              <p className="col-span-full rounded-[24px] bg-s1 p-10 text-center text-ink2">
                {products.length
                  ? 'No apps match your search.'
                  : 'The catalog is empty right now. Please check back later.'}
              </p>
            )}
          </div>
        )}

        <Reveal className="mt-4 flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-acc-bg p-6 sm:p-8">
          <div className="max-w-xl">
            <Eyebrow>Founding users offer</Eyebrow>
            <h3 className="mt-3 text-[clamp(26px,3vw,36px)] font-extrabold leading-none tracking-[-0.05em]">Your first deployment, for less.</h3>
            <p className="mt-2 text-ink2">Get 50% off your first month. Available for the first 50 eligible customers.</p>
          </div>
          <Button to="/login" icon="arrowUR">Claim at checkout</Button>
        </Reveal>
        <p className="mt-3 text-[12.5px] text-ink3">
          Campaign proposal. The promotion engine is in place — a campaign with a limit and a code per account can be
          created from the admin area — but no campaign is running yet, so no discount is applied.
        </p>
      </Wrap>
    </section>
  );
}

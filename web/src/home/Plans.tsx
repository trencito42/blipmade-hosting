import { useId, useMemo, useState } from 'react';
import { cn } from '../lib';
import { categoryLabel, memLabel, useCatalogProducts } from '../lib/pricing';
import type { CatalogProduct } from '../lib/api';
import { Arrow, Button, Check, Reveal, Wrap } from '../ui';
import { Link, useRouter } from '../router';

/**
 * The plans of the platform.
 *
 * The tabs are the groups of the catalogue and the cards are the products of
 * the platform: every price on this page is the price the server charges for
 * the smallest configuration of a product, read from the catalogue of the
 * API. Nothing here is a number that was typed into the page.
 */

type Group = 'games' | 'bots' | 'databases' | 'apps';

interface Tab {
  id: Group;
  label: string;
  blurb: string;
  categories: string[];
}

const TABS: Tab[] = [
  { id: 'games', label: 'Games', blurb: 'Game servers on their own panel, with the ports and the storage they need.', categories: ['GAMES'] },
  { id: 'bots', label: 'Bots', blurb: 'Discord bots that stay online, with the logs when something breaks.', categories: ['BOTS'] },
  { id: 'databases', label: 'Databases', blurb: 'Databases with their own storage, ready for the app that reads them.', categories: ['DATABASES'] },
  {
    id: 'apps',
    label: 'Apps',
    blurb: 'Sites, APIs, dashboards and the tools that run around them.',
    categories: ['WEB_CMS', 'DEVELOPER_TOOLS', 'AUTOMATION', 'MONITORING', 'EMAIL_HOSTING'],
  },
];

/** The products of a group of categories. */
function productsOf(products: CatalogProduct[], tab: Tab): CatalogProduct[] {
  return products.filter((product) => tab.categories.includes(product.category));
}

/** The price of the smallest configuration of a product, in minor units. */
function priceOf(product: CatalogProduct): number | null {
  return product.pricing?.minimum.amount ?? product.price?.amount ?? null;
}

function PlanCard({ product, index }: { product: CatalogProduct; index: number }) {
  const { navigate } = useRouter();
  const price = priceOf(product);
  const currency = product.pricing?.currency ?? product.price?.currency ?? 'EUR';
  const features = [
    `${memLabel(product.minRam)} memory`,
    `${product.minCpu} shared vCPU`,
    `${product.minDisk} GB storage`,
  ];
  return (
    <li className="card-in" style={{ ['--i' as string]: index }}>
      <div className="group relative grid h-full content-between gap-7 rounded-2xl border border-line bg-card p-6 transition-[border-color,transform,background-color] duration-300 hover:-translate-y-1 hover:border-acc/60 hover:bg-s2">
        <div>
          <h3 className="text-[22px] font-semibold tracking-tight">{product.name}</h3>
          <p className="mt-1 text-[14.5px] text-ink2">{product.description}</p>
          <p className="mt-6 flex items-baseline gap-1">
            {price === null ? (
              <span className="text-[40px] leading-none font-semibold tracking-[-0.04em] text-ink3">—</span>
            ) : (
              <>
                <span className="text-[40px] leading-none font-semibold tracking-[-0.04em]">{formatAmount(price, currency)}</span>
                <span className="text-[14px] text-ink3">/mo</span>
              </>
            )}
          </p>
          <ul className="mt-6 grid gap-2.5 text-[14.5px]">
            {features.map((feature) => (
              <li key={feature} className="flex items-start gap-2.5 text-ink2">
                <Check className="mt-0.5 shrink-0 text-acc" />
                {feature}
              </li>
            ))}
          </ul>
        </div>
        <Button variant="soft" className="w-full" onClick={() => navigate(`/deploy/${product.slug}`)}>
          Deploy <Arrow />
        </Button>
      </div>
    </li>
  );
}

/** An amount of minor units as a price. */
function formatAmount(amount: number, currency: string): string {
  const units = Math.trunc(Math.abs(amount) / 100);
  const cents = Math.abs(amount % 100).toString().padStart(2, '0');
  return currency === 'EUR' ? `€${units}.${cents}` : `${units}.${cents} ${currency}`;
}

export function Plans() {
  const { products, loading } = useCatalogProducts();
  const [group, setGroup] = useState<Group>('games');
  const uid = useId();
  const index = TABS.findIndex((tab) => tab.id === group);
  const tab = TABS[index]!;
  const list = useMemo(() => productsOf(products, tab), [products, tab]);

  const onKey = (e: React.KeyboardEvent) => {
    const step = e.key === 'ArrowRight' ? 1 : e.key === 'ArrowLeft' ? -1 : 0;
    if (!step) return;
    e.preventDefault();
    const next = TABS[(index + step + TABS.length) % TABS.length]!;
    setGroup(next.id);
    document.getElementById(`${uid}-${next.id}`)?.focus();
  };

  return (
    <section id="plans" aria-label="Plans" className="py-24">
      <Wrap className="grid gap-12">
        <Reveal className="grid gap-4">
          <h2 className="max-w-3xl text-[clamp(34px,4.6vw,60px)] leading-[1.02] font-semibold tracking-[-0.04em] [text-wrap:balance]">
            Clear plans. No hidden limits.
          </h2>
          <p className="max-w-xl text-[17px] text-ink2">Pick what you are hosting. The price follows the resources you choose.</p>
        </Reveal>
        <Reveal delay={100} className="grid gap-8">
          <div
            role="tablist"
            aria-label="What are you hosting"
            onKeyDown={onKey}
            className="relative grid w-full max-w-2xl grid-cols-4 rounded-xl border border-line bg-s1 p-1"
          >
            <span
              aria-hidden="true"
              className="absolute inset-y-1 left-1 w-[calc((100%-0.5rem)/4)] rounded-lg bg-card ring-1 ring-line transition-transform duration-500 ease-out-expo"
              style={{ transform: `translateX(${index * 100}%)` }}
            />
            {TABS.map((entry) => (
              <button
                key={entry.id}
                id={`${uid}-${entry.id}`}
                role="tab"
                type="button"
                aria-selected={group === entry.id}
                aria-controls={`${uid}-panel`}
                tabIndex={group === entry.id ? 0 : -1}
                onClick={() => setGroup(entry.id)}
                className={cn(
                  'relative z-10 h-10 rounded-lg px-2 text-[14px] font-medium transition-colors duration-300',
                  group === entry.id ? 'text-ink' : 'text-ink2 hover:text-ink',
                )}
              >
                {entry.label}
              </button>
            ))}
          </div>
          <div id={`${uid}-panel`} role="tabpanel" aria-labelledby={`${uid}-${group}`} className="grid gap-6">
            <p key={group} className="card-in text-[16px] text-ink2">{tab.blurb}</p>
            {loading ? (
              <p className="text-[15px] text-ink3">Loading the catalogue…</p>
            ) : list.length === 0 ? (
              <div className="rounded-2xl border border-line bg-s1 p-6">
                <p className="text-[17px] font-semibold">No product in this group yet.</p>
                <p className="mt-1 text-[15px] text-ink2">Pick another group, or open the catalogue to see everything the platform offers.</p>
              </div>
            ) : (
              <ul key={group + 'l'} className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
                {list.slice(0, 6).map((product, i) => (
                  <PlanCard key={product.id} product={product} index={i} />
                ))}
              </ul>
            )}
            {list.length > 6 && (
              <p className="text-[14px] text-ink2">
                <Link to="/apps" className="font-medium text-ink underline underline-offset-4">
                  See the other {list.length - 6} products
                </Link>{' '}
                in the catalogue.
              </p>
            )}
            <p className="text-[13px] text-ink3">Prices are in euros per month. Every product of the catalogue has its own page.</p>
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}

/** The categories of the catalogue, for the pages that show a filter. */
export function categoryOf(product: CatalogProduct): string {
  return categoryLabel(product.category);
}

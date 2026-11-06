import { useEffect, useRef, useState, type CSSProperties } from 'react';
import { ScrollRow } from '../ScrollRow';
import { useRevealOnChange } from '../lib/useReveal';
import { Icon, ProductMark } from '../icons';
import { Configurator } from './Configurator';
import { APP_COPY, FALLBACK } from './content';
import { copyFromContent, useSiteContent } from './siteContent';
import { isOrderable, useProducts, type Product } from './catalog';
import { eur, fmtRam } from './pricing';
import { Link, useRouter } from '../router';
import { CATEGORIES, categoryOf, categoryOrder, toneOf } from './categories';
import { Btn, Crumbs, Eyebrow, Wrap, cx } from './ui';

const MINECRAFT_EDITIONS = [
  { slug: 'minecraft-paper', label: 'Paper' },
  { slug: 'minecraft-forge', label: 'Forge' },
  { slug: 'minecraft-vanilla', label: 'Vanilla' },
  { slug: 'minecraft-bedrock', label: 'Bedrock' },
  { slug: 'minecraft-folia', label: 'Folia' },
];

/** A group of the catalog: the products of one category. */
export interface CatalogGroup {
  /** The name the API carries. */
  id: string;
  /** The name a visitor reads. */
  label: string;
  products: Product[];
}

/**
 * The products of the catalog, grouped by the category they belong to.
 *
 * The categories are in the order a reader walks through them. A category the
 * list does not know yet is still shown, with the name the API carries, so a
 * product of the platform never disappears from the page.
 */
export function groupByCategory(products: Product[]): CatalogGroup[] {
  const byCategory = new Map<string, Product[]>();
  for (const product of products) {
    const list = byCategory.get(product.category) ?? [];
    list.push(product);
    byCategory.set(product.category, list);
  }
  return [...byCategory.keys()]
    .sort((left, right) => categoryOrder(left) - categoryOrder(right) || left.localeCompare(right))
    .map((id) => ({ id, label: categoryOf(id).label, products: byCategory.get(id)! }));
}

/** The card of a product of the catalog: its mark on the colour of its category, its name, a line about it and where its price starts. */
function Card({ product }: { product: Product }) {
  const copy = copyFromContent(useSiteContent(), product.slug, APP_COPY[product.slug], FALLBACK(product.description));
  const category = categoryOf(product.category);
  const tone = toneOf(product.category);

  return (
    <li>
      <Link
        to={`/apps/${product.slug}`}
        style={{ '--tone': tone } as CSSProperties}
        className="group grid h-full content-between gap-5 rounded-[24px] bg-night-2 p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_0_0_2px_var(--tone)] focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <div className="grid gap-3">
          <span aria-hidden="true" className="grid size-12 place-items-center rounded-[15px] text-paper transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105" style={{ background: tone }}>
            <ProductMark slug={product.slug} fallback={category.icon} size={22} />
          </span>
          <h3 className="font-display text-[22px] leading-tight font-semibold tracking-[-0.03em]">{product.name}</h3>
          <p className="line-clamp-2 text-[14.5px] text-ink-2">{copy.tagline}</p>
        </div>
        <p className="flex items-end justify-between gap-3">
          <span>
            <span className="text-[13px] text-ink-3">from </span>
            <span className="big text-[26px]">{eur(product.minPrice)}</span>
            <span className="text-[13px] text-ink-3"> /month</span>
          </span>
          <span aria-hidden="true" className="mb-0.5 grid size-8 place-items-center rounded-full bg-ink text-paper transition-transform duration-200 group-hover:translate-x-1">
            <Icon name="arrow" size={12} />
          </span>
        </p>
      </Link>
    </li>
  );
}

/**
 * The catalog: every product the platform lists.
 *
 * The products are grouped by what they are, so a visitor who wants a game
 * server or a database starts from that group. The group can be chosen with
 * the tabs, with the search field and with the fragment of the address
 * (`/apps#databases`). A product that is still coming is shown in the same
 * grid and marked, so a visitor sees what is being prepared.
 */
export function Apps() {
  const products = useProducts();
  const minecraft = products.find((product) => product.slug === 'minecraft-paper') ?? products.find((product) => product.slug.startsWith('minecraft-'));
  // The catalogue lists what can be deployed. A product that is not open yet keeps its own page, but it is not offered here.
  const displayProducts = products.filter((product) => !product.slug.startsWith('minecraft-') && isOrderable(product) && product.category !== 'VPS' && product.category !== 'EMAIL_HOSTING');
  if (minecraft) displayProducts.push({ ...minecraft, slug: 'minecraft', name: 'Minecraft', description: 'Choose Paper, Forge, Vanilla, Bedrock or Folia.' });
  const groups = groupByCategory(displayProducts);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const router = useRouter();
  const filtersRef = useRef<HTMLDivElement>(null);
  // A new group or a new search starts at the top of the results, under the bar.
  useRevealOnChange(filtersRef, [category, query], 68);

  // The fragment of the address chooses the group. It is read after the page
  // is shown, so the page the server wrote and the first page of the browser
  // are the same.
  useEffect(() => {
    const slug = location.hash.replace(/^#/, '');
    const match = CATEGORIES.find((entry) => entry.slug === slug);
    setCategory(match ? match.id : 'all');
  }, [router]);

  const choose = (id: string) => {
    setCategory(id);
    history.replaceState(null, '', id === 'all' ? '/apps' : `/apps#${categoryOf(id).slug}`);
  };

  const needle = query.trim().toLowerCase();
  const matches = (product: Product) =>
    !needle || product.name.toLowerCase().includes(needle) || (APP_COPY[product.slug]?.tagline ?? product.description).toLowerCase().includes(needle);
  // What can be deployed comes first, in every group and between the groups, so
  // the page opens on what a visitor can order today.
  const ready = (list: Product[]) => list.filter((product) => isOrderable(product)).length;
  const visibleGroups = (category === 'all' ? groups : groups.filter((group) => group.id === category))
    .map((group) => ({ ...group, products: group.products.filter(matches).sort((left, right) => Number(isOrderable(right)) - Number(isOrderable(left))) }))
    .filter((group) => group.products.length > 0)
    .sort((left, right) => Number(ready(right.products) > 0) - Number(ready(left.products) > 0));
  const available = displayProducts.length;

  return (
    <>
      <section aria-labelledby="apps-h">
        <Wrap className="grid gap-5 pt-12 pb-8 sm:pt-16">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps']]} />
          <h1 id="apps-h" className="max-w-[14em] text-[clamp(40px,6vw,76px)] leading-[0.96] font-semibold tracking-[-0.05em]">Games, databases and tools, on one price card.</h1>
          <p className="max-w-[38em] text-[18px] text-ink-2">
            Everything starts as a container with the resources you choose, and everything is priced with the same card of rates.{' '}
            {available === 0
              ? 'Checkout is paused, so nothing can be ordered right now. You can still browse what the platform will sell.'
              : <>Pick one of the <strong className="font-semibold text-ink">{available}</strong> things you can deploy right now and have it running in minutes.</>}
          </p>
        </Wrap>
      </section>
      <Wrap className="pb-20">
        <div ref={filtersRef}>
        <div className="sticky top-[68px] z-20 -mx-5 mb-8 flex flex-col gap-3 border-b border-line bg-paper/90 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:flex-row sm:items-center sm:px-8">
          <ScrollRow label="Filter apps by category" className="flex-1">
            <div className="flex w-max gap-1.5">
              {[{ id: 'all', label: 'All', icon: 'box' as const, count: displayProducts.length }, ...groups.map((group) => ({ id: group.id, label: group.label, icon: categoryOf(group.id).icon, count: group.products.length }))].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={category === tab.id}
                  style={category === tab.id ? { background: tab.id === 'all' ? '#4ee595' : toneOf(tab.id) } : undefined}
                  onClick={() => choose(tab.id)}
                  className={cx(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
                    category === tab.id ? 'border-transparent text-paper' : 'border-transparent bg-night-3 text-ink-2 hover:text-ink',
                  )}
                >
                  <Icon name={tab.icon} size={13} />
                  {tab.label}
                </button>
              ))}
            </div>
          </ScrollRow>
          <div className="relative sm:w-64">
            <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the catalog"
              placeholder="Search the catalog"
              className="h-10 w-full rounded-full bg-night-2 pr-4 pl-10 text-[16px] text-ink placeholder:text-ink-3 sm:text-[14.5px] focus-visible:outline-2 focus-visible:outline-green"
            />
          </div>
        </div>
        {visibleGroups.length === 0 ? <p className="py-16 text-center text-[17px] text-ink-2">Nothing in the catalog matches “{query}”.</p> : null}
        {visibleGroups.map((group) => {
          const meta = categoryOf(group.id);
          return (
            <section key={group.id} id={meta.slug} aria-labelledby={`cat-${group.id}`} className="mb-14 scroll-mt-36 last:mb-0">
              <div className="flex flex-wrap items-end justify-between gap-3 pb-5">
                <div className="flex items-center gap-4">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-[15px] text-paper" style={{ background: toneOf(group.id) }}>
                    <Icon name={meta.icon} size={21} />
                  </span>
                  <div>
                    <h2 id={`cat-${group.id}`} className="font-display text-[28px] leading-none font-semibold tracking-[-0.03em]">
                      {group.label}
                    </h2>
                    {meta.blurb ? <p className="mt-1.5 text-[15px] text-ink-3">{meta.blurb}</p> : null}
                  </div>
                </div>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.products.map((product) => (
                  <Card key={product.slug} product={product} />
                ))}
              </ul>
            </section>
          );
        })}
        <div className="mt-6 grid gap-4 rounded-[28px] p-7 text-paper sm:flex sm:items-center sm:justify-between sm:p-9" style={{ background: toneOf('EMAIL_HOSTING') }}>
          <div>
            <h2 className="font-display text-[clamp(26px,3vw,36px)] leading-tight font-semibold tracking-[-0.035em]">Running something else?</h2>
            <p className="mt-1 max-w-[34em] text-[17px] font-medium opacity-80">The catalog grows one verified image at a time. Tell us what you want to run and we will look at it.</p>
          </div>
          <Link to="/docs/tickets" className="inline-flex h-12 items-center justify-center rounded-full bg-paper px-6 text-[15.5px] font-semibold text-snow transition-transform hover:-translate-y-0.5">How to tell us</Link>
        </div>
        </div>
      </Wrap>
    </>
  );
}

/**
 * The page of one product.
 *
 * The page shows the product that was asked for. A product that can be
 * ordered carries its configurator and the price of the size the visitor
 * chooses. A product that is still coming carries its name, its description
 * and the reason it is not ready, and nothing that orders it.
 */
/** The servers and the mailboxes are sold on their own pages: an address under /apps that names one goes there. */
function ToStorefront({ product, slug }: { product: Product; slug: string }) {
  const { navigate } = useRouter();
  const target = product.category === 'VPS' ? '/vps' : '/email';
  useEffect(() => {
    navigate(target, { replace: true });
  }, [navigate, target]);
  return (
    <section aria-labelledby="app-h">
      <Wrap className="grid gap-8 pt-14 pb-20 sm:pt-20">
        <Crumbs items={[['Home', '/'], ['Catalog', '/apps'], [product.name, `/apps/${slug}`]]} />
        <h1 id="app-h" className="max-w-[16em] text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">
          {product.name} has its own page.
        </h1>
        <div>
          <Btn to={target} variant="mint" size="lg">{product.category === 'VPS' ? 'See the servers' : 'See the mail plans'}</Btn>
        </div>
      </Wrap>
    </section>
  );
}

export function AppDetail({ slug }: { slug: string }) {
  const blocks = useSiteContent();
  const products = useProducts();
  const [edition, setEdition] = useState('minecraft-paper');
  if (slug === 'minecraft') {
    return (
      <>
        <Wrap className="grid gap-3 pt-10 sm:pt-14">
          <label htmlFor="minecraft-edition" className="font-display text-[19px] font-semibold">Minecraft edition</label>
          <select id="minecraft-edition" value={edition} onChange={(event) => setEdition(event.target.value)} className="min-h-12 max-w-md rounded-xl border border-line bg-paper px-4 py-2 text-[16px] font-medium text-ink focus-visible:outline-2 focus-visible:outline-green">
            {MINECRAFT_EDITIONS.map((item) => (
              <option key={item.slug} value={item.slug}>{item.label}{products.some((product) => product.slug === item.slug) ? '' : ' — coming soon'}</option>
            ))}
          </select>
        </Wrap>
        <AppDetail slug={edition} />
      </>
    );
  }
  const product = products.find((entry) => entry.slug === slug);
  const copy = APP_COPY[slug] || blocks['product.copy']?.[slug] ? copyFromContent(blocks, slug, APP_COPY[slug], FALLBACK(product?.description ?? '')) : undefined;

  if (!product) {
    return (
      <section aria-labelledby="app-h">
        <Wrap className="grid gap-6 pt-14 pb-12 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps'], [slug, `/apps/${slug}`]]} />
          <h1 id="app-h" className="text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">{slug === 'minecraft-vanilla' ? 'Minecraft Vanilla is coming soon.' : 'This product is not on sale today.'}</h1>
          <p className="max-w-[34em] text-[18px] text-ink-2">The catalog carries more products than the platform can deploy. Tell us what you want to run and we will look at it.</p>
          <div>
            <Btn to="/apps" variant="outline">See what you can deploy</Btn>
          </div>
        </Wrap>
      </section>
    );
  }

  if (!isOrderable(product)) {
    const reason = product.availability.blockers[0];
    return (
      <section aria-labelledby="app-h">
        <Wrap className="grid gap-8 pt-14 pb-20 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps'], [product.name, `/apps/${slug}`]]} />
          <h1 id="app-h" className="max-w-[16em] text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">{product.name} is coming soon.</h1>
          <p className="font-display text-[24px] leading-tight font-medium tracking-[-0.02em]">{copy?.tagline ?? product.description}</p>
          {copy?.lead ? <p className="max-w-[34em] text-[18px] text-ink-2">{copy.lead}</p> : null}
          <div className="grid max-w-[34em] gap-4 rounded-[20px] bg-night-2 p-6">
            <Eyebrow>Coming soon</Eyebrow>
            {reason ? <p className="text-[17px] text-ink-2">{reason}</p> : null}
            <p className="text-[17px] text-ink-2">
              It will cost <span className="num font-semibold text-ink">{eur(product.minPrice)}</span> a month when it opens.
            </p>
          </div>
          <div>
            <Btn to="/apps" variant="outline">See the apps of the platform</Btn>
          </div>
        </Wrap>
      </section>
    );
  }

  // A plan of hosted mail is not a server: it has no memory, no vCPU and no
  // disk to choose, so it goes to the storefront of the mail and not to the
  // configurator of the servers.
  if (product.category === 'EMAIL_HOSTING' || product.category === 'VPS') {
    return <ToStorefront product={product} slug={slug} />;
  }
  const words = copy ?? FALLBACK(product.description);
  const tone = toneOf(product.category);
  const meta = categoryOf(product.category);

  return (
    <section aria-labelledby="app-h">
      <Wrap className="grid items-start gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <div className="grid content-start gap-7">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps'], [product.name, `/apps/${slug}`]]} />
          <div className="flex items-center gap-4">
            <span aria-hidden="true" className="grid size-16 -rotate-3 place-items-center rounded-[20px] text-paper" style={{ background: tone }}>
              <ProductMark slug={product.slug} fallback={meta.icon} size={30} />
            </span>
            <span className="rounded-full px-4 py-1.5 text-[13.5px] font-bold text-paper" style={{ background: tone }}>{meta.label}</span>
          </div>
          <h1 id="app-h" className="text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            {product.name} hosting from {eur(product.minPrice)} a month.
          </h1>
          <p className="font-display text-[24px] leading-tight font-medium tracking-[-0.02em]">{words.tagline}</p>
          <p className="max-w-[34em] text-[18px] text-ink-2">{words.lead}</p>
          {words.note ? (
            <p className="max-w-[34em] rounded-[20px] p-5 text-[16px] text-ink-2" style={{ background: `${tone}22` }}>
              <strong className="font-semibold text-ink">Good to know. </strong>
              {words.note}
            </p>
          ) : null}
          <div>
            <h2 className="mb-3 font-display text-[22px] font-semibold tracking-[-0.02em]">Good for</h2>
            <ul className="grid gap-2.5 text-[17px] text-ink-2">
              {words.fits.map((fit) => (
                <li key={fit} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[10px] size-2 shrink-0 rounded-[3px]" style={{ background: tone }} />
                  {fit}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h2 className="mb-3 font-display text-[22px] font-semibold tracking-[-0.02em]">Resource range</h2>
            <dl className="grid max-w-[40em] gap-3 sm:grid-cols-3">
              {([['Smallest', product.min, product.minPrice, false], ['Suggested', product.def, product.recPrice, true], ['Largest', product.max, null, false]] as const).map(([label, r, price, pick]) => (
                <div key={label} className={cx('grid gap-3 rounded-[20px] p-4', !pick && 'bg-night-2')} style={pick ? { background: tone, color: '#090b0a' } : undefined}>
                  <dt className={cx('num text-[12px] font-bold tracking-[0.06em] uppercase', !pick && 'text-ink-3')}>{label}</dt>
                  <dd className="num grid gap-0.5 text-[14px]">
                    <span>{fmtRam(r.ram)} RAM</span>
                    <span>{r.cpu} vCPU</span>
                    <span>{r.disk} GB disk</span>
                  </dd>
                  <dd className={cx('big text-[24px]', !pick && 'text-ink')}>{price === null ? 'custom' : eur(price)}</dd>
                </div>
              ))}
            </dl>
          </div>
          <p className="text-[16px] text-ink-2">
            Step by step:{' '}
            <Link to={`/docs/${product.slug}`} className="text-green underline underline-offset-4">
              {product.name} in the docs
            </Link>
            .
          </p>
        </div>
        <Configurator slug={slug} lock className="lg:sticky lg:top-24" />
      </Wrap>
    </section>
  );
}

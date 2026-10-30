import { useEffect, useState } from 'react';
import { Icon, ProductMark } from '../icons';
import { Configurator } from './Configurator';
import { APP_COPY, FALLBACK } from './content';
import { isOrderable, useProducts, type Product } from './catalog';
import { eur, fmtRam } from './pricing';
import { Link, useRouter } from '../router';
import { CATEGORIES, categoryOf, categoryOrder } from './categories';
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

/** The card of a product of the catalog: small, so a category reads as a list. */
function Card({ product }: { product: Product }) {
  const copy = APP_COPY[product.slug] ?? FALLBACK(product.description);
  const open = isOrderable(product);
  const category = categoryOf(product.category);

  return (
    <li>
      <Link
        to={`/apps/${product.slug}`}
        className="group grid h-full content-between gap-5 rounded-[24px] border border-line bg-card p-5 transition-colors hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
      >
        <div className="grid gap-3">
          <div className="flex items-center justify-between gap-3">
            <span aria-hidden="true" className="grid size-11 place-items-center rounded-xl bg-night-2 text-green">
              <ProductMark slug={product.slug} fallback={category.icon} size={19} />
            </span>
            {open ? null : <span className="rounded-full border border-line px-2.5 py-1 text-[12px] font-semibold text-ink-3">Coming soon</span>}
          </div>
          <h3 className="font-display text-[22px] leading-tight font-semibold tracking-[-0.03em]">{product.name}</h3>
          <p className="line-clamp-2 text-[14.5px] text-ink-2">{copy.tagline}</p>
        </div>
        <p className="flex items-end justify-between gap-3">
          <span>
            <span className="text-[13px] text-ink-3">from </span>
            <span className="big text-[26px]">{eur(product.minPrice)}</span>
            <span className="text-[13px] text-ink-3"> /month</span>
          </span>
          <Icon name="arrow" size={14} className="mb-1.5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
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
  const displayProducts = products.filter((product) => !product.slug.startsWith('minecraft-'));
  if (minecraft) displayProducts.push({ ...minecraft, slug: 'minecraft', name: 'Minecraft', description: 'Choose Paper, Forge, Vanilla, Bedrock or Folia.' });
  const groups = groupByCategory(displayProducts);
  const [category, setCategory] = useState('all');
  const [query, setQuery] = useState('');
  const router = useRouter();

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
  const available = displayProducts.filter((product) => isOrderable(product)).length;
  const coming = displayProducts.length - available;

  return (
    <>
      <section aria-labelledby="apps-h">
        <Wrap className="grid gap-5 pt-12 pb-8 sm:pt-16">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps']]} />
          <h1 id="apps-h" className="max-w-[14em] text-[clamp(40px,6vw,76px)] leading-[0.96] font-semibold tracking-[-0.05em]">Games, databases and tools, on one price card.</h1>
          <p className="max-w-[38em] text-[18px] text-ink-2">
            Everything starts as a container with the resources you choose, and everything is priced with the same card of rates.{' '}
            <strong className="font-semibold text-ink">{available}</strong> {available === 1 ? 'service is' : 'services are'} ready to deploy today
            {coming > 0 ? (
              <>
                , and <strong className="font-semibold text-ink">{coming}</strong> {coming === 1 ? 'is' : 'are'} still coming
              </>
            ) : null}
            .
          </p>
        </Wrap>
      </section>
      <Wrap className="pb-20">
        <div className="sticky top-[68px] z-20 -mx-5 mb-8 flex flex-col gap-3 border-b border-line bg-paper/90 px-5 py-3 backdrop-blur-md sm:-mx-8 sm:flex-row sm:items-center sm:px-8">
          <nav aria-label="Filter apps by category" className="min-w-0 flex-1 overflow-x-auto [scrollbar-width:none] [&::-webkit-scrollbar]:hidden">
            <div className="flex w-max gap-1.5">
              {[{ id: 'all', label: 'All', icon: 'box' as const, count: displayProducts.length }, ...groups.map((group) => ({ id: group.id, label: group.label, icon: categoryOf(group.id).icon, count: group.products.length }))].map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  aria-pressed={category === tab.id}
                  onClick={() => choose(tab.id)}
                  className={cx(
                    'inline-flex h-10 shrink-0 items-center gap-2 rounded-full border px-4 text-[14.5px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green',
                    category === tab.id ? 'border-green bg-green text-paper' : 'border-line text-ink-2 hover:border-ink/40 hover:text-ink',
                  )}
                >
                  <Icon name={tab.icon} size={13} />
                  {tab.label} <span className="num text-[12.5px] opacity-70">{tab.count}</span>
                </button>
              ))}
            </div>
          </nav>
          <div className="relative sm:w-64">
            <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-4 -translate-y-1/2 text-ink-3" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the catalog"
              placeholder="Search the catalog"
              className="h-10 w-full rounded-full border border-line bg-card pr-4 pl-10 text-[14.5px] text-ink placeholder:text-ink-3 focus-visible:outline-2 focus-visible:outline-green"
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
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-night-2 text-green">
                    <Icon name={meta.icon} size={20} />
                  </span>
                  <div>
                    <h2 id={`cat-${group.id}`} className="font-display text-[28px] leading-none font-semibold tracking-[-0.03em]">
                      {group.label}
                    </h2>
                    {meta.blurb ? <p className="mt-1.5 text-[15px] text-ink-3">{meta.blurb}</p> : null}
                  </div>
                </div>
                <p className="num text-[14px] text-ink-3">
                  {group.products.length} {group.products.length === 1 ? 'service' : 'services'}
                </p>
              </div>
              <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
                {group.products.map((product) => (
                  <Card key={product.slug} product={product} />
                ))}
              </ul>
            </section>
          );
        })}
        <div className="mt-6 grid gap-4 rounded-[28px] bg-paper-2/70 p-7 sm:flex sm:items-center sm:justify-between sm:p-9">
          <div>
            <h2 className="font-display text-[26px] font-semibold tracking-[-0.03em]">Running something else?</h2>
            <p className="mt-1 max-w-[34em] text-[17px] text-ink-2">The catalog grows one verified image at a time. Open a ticket and tell us what you want to run.</p>
          </div>
          <Btn to="/docs/tickets" variant="primary">How to open a ticket</Btn>
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
export function AppDetail({ slug }: { slug: string }) {
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
  const copy = APP_COPY[slug];

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
          <div className="grid max-w-[34em] gap-4 rounded-2xl border border-line bg-paper-2/60 p-6">
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

  const words = copy ?? FALLBACK(product.description);

  return (
    <section aria-labelledby="app-h">
      <Wrap className="grid items-start gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <div className="grid content-start gap-7">
          <Crumbs items={[['Home', '/'], ['Catalog', '/apps'], [product.name, `/apps/${slug}`]]} />
          <h1 id="app-h" className="text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            {product.name} hosting from {eur(product.minPrice)} a month.
          </h1>
          <p className="font-display text-[24px] leading-tight font-medium tracking-[-0.02em]">{words.tagline}</p>
          <p className="max-w-[34em] text-[18px] text-ink-2">{words.lead}</p>
          {words.note ? (
            <p className="max-w-[34em] rounded-2xl border border-line bg-paper-2/60 p-5 text-[16px] text-ink-2">
              <strong className="font-semibold text-ink">Good to know. </strong>
              {words.note}
            </p>
          ) : null}
          <div>
            <h2 className="mb-3 font-display text-[22px] font-semibold tracking-[-0.02em]">Good for</h2>
            <ul className="grid gap-2.5 text-[17px] text-ink-2">
              {words.fits.map((fit) => (
                <li key={fit} className="flex gap-3">
                  <span aria-hidden="true" className="mt-[11px] size-1.5 shrink-0 rounded-full bg-green" />
                  {fit}
                </li>
              ))}
            </ul>
          </div>
          <table className="num w-full max-w-[34em] text-left text-[14.5px]">
            <caption className="mb-2 text-left font-display text-[22px] font-semibold tracking-[-0.02em]">Resource range</caption>
            <thead className="text-ink-3">
              <tr>
                <th scope="col" className="py-2 font-medium">
                  <span className="sr-only">Size</span>
                </th>
                <th scope="col" className="py-2 font-medium">RAM</th>
                <th scope="col" className="py-2 font-medium">vCPU</th>
                <th scope="col" className="py-2 font-medium">Disk</th>
                <th scope="col" className="py-2 text-right font-medium">Price</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line border-y border-line">
              {([['Smallest', product.min, product.minPrice], ['Suggested', product.def, product.recPrice]] as const).map(([label, r, price]) => (
                <tr key={label}>
                  <th scope="row" className="py-3 font-medium text-ink">{label}</th>
                  <td>{fmtRam(r.ram)}</td>
                  <td>{r.cpu}</td>
                  <td>{r.disk} GB</td>
                  <td className="text-right text-ink">{eur(price)}</td>
                </tr>
              ))}
              <tr>
                <th scope="row" className="py-3 font-medium text-ink">Largest</th>
                <td>{fmtRam(product.max.ram)}</td>
                <td>{product.max.cpu}</td>
                <td>{product.max.disk} GB</td>
                <td className="text-right text-ink-3">custom</td>
              </tr>
            </tbody>
          </table>
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

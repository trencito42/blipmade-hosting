import { useState } from 'react';
import { Configurator } from './Configurator';
import { APP_COPY, FALLBACK } from './content';
import { isOrderable, useProducts, type Product } from './catalog';
import { eur, fmtRam } from './pricing';
import { Link } from '../router';
import { Btn, Crumbs, Eyebrow, Wrap } from './ui';

const MINECRAFT_EDITIONS = [
  { slug: 'minecraft-paper', label: 'Paper' },
  { slug: 'minecraft-forge', label: 'Forge' },
  { slug: 'minecraft-vanilla', label: 'Vanilla' },
  { slug: 'minecraft-bedrock', label: 'Bedrock' },
  { slug: 'minecraft-folia', label: 'Folia' },
];

/**
 * The categories of the catalog, in the order a reader walks through them.
 *
 * The name of a category is the one a visitor reads, not the one the API
 * carries.
 */
const CATEGORY_ORDER = ['GAMES', 'DEVELOPER_TOOLS', 'AUTOMATION', 'MONITORING', 'DATABASES', 'BOTS', 'WEB_CMS'];

/** The name of a category of the catalog. */
const CATEGORY_NAMES: Record<string, string> = {
  GAMES: 'Games',
  DEVELOPER_TOOLS: 'Developer tools',
  AUTOMATION: 'Automation',
  MONITORING: 'Monitoring',
  DATABASES: 'Databases',
  BOTS: 'Bots',
  WEB_CMS: 'Web & CMS',
};

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
  const order = (id: string) => {
    const index = CATEGORY_ORDER.indexOf(id);
    return index === -1 ? CATEGORY_ORDER.length : index;
  };
  return [...byCategory.keys()]
    .sort((left, right) => order(left) - order(right) || left.localeCompare(right))
    .map((id) => ({ id, label: CATEGORY_NAMES[id] ?? id, products: byCategory.get(id)! }));
}

/** The card of a product of the catalog. */
function Card({ product }: { product: Product }) {
  const copy = APP_COPY[product.slug] ?? FALLBACK(product.description);
  const open = isOrderable(product);
  const reason = product.availability.blockers[0];

  return (
    <li className="grid content-between gap-8 rounded-[28px] border border-line bg-card p-7 sm:p-8">
      <div className="grid gap-4">
        <div className="flex items-center justify-between gap-3">
          <p className="text-[14.5px] text-ink-3">{CATEGORY_NAMES[product.category] ?? product.category}</p>
          {open ? null : <Eyebrow>Coming soon</Eyebrow>}
        </div>
        <h3 className="font-display text-[32px] leading-none font-semibold tracking-[-0.035em]">{product.name}</h3>
        <p className="text-[17px] text-ink-2">{copy.tagline}</p>
        <dl className="num mt-2 grid gap-1.5 text-[14px] text-ink-2">
          <div className="flex justify-between gap-4">
            <dt>Smallest</dt>
            <dd>
              {fmtRam(product.min.ram)} · {product.min.cpu} vCPU · {product.min.disk} GB
            </dd>
          </div>
          <div className="flex justify-between gap-4">
            <dt>Largest</dt>
            <dd>
              {fmtRam(product.max.ram)} · {product.max.cpu} vCPU · {product.max.disk} GB
            </dd>
          </div>
        </dl>
      </div>
      <div className="grid gap-4">
        {open ? null : reason ? <p className="text-[14px] text-ink-3">{reason}</p> : null}
        <p>
          <span className="text-[14px] text-ink-3">from </span>
          <span className="big text-[36px]">{eur(product.minPrice)}</span>
          <span className="text-ink-3"> /month</span>
        </p>
        {open ? (
          <Btn to={`/apps/${product.slug}`} variant="outline">Size {product.name}</Btn>
        ) : (
          <Link to={`/apps/${product.slug}`} className="text-[15px] font-medium text-green underline underline-offset-4">
            More about {product.name}
          </Link>
        )}
      </div>
    </li>
  );
}

/**
 * The catalog: every product the platform lists.
 *
 * A product that can be ordered today is shown with its price and with the
 * button that sizes it. A product that is still coming is shown in the same
 * grid, marked as coming soon and with the reason the platform gives, so a
 * visitor sees what is being prepared without being able to order it.
 */
export function Apps() {
  const products = useProducts();
  const minecraft = products.find((product) => product.slug === 'minecraft-paper') ?? products.find((product) => product.slug.startsWith('minecraft-'));
  const displayProducts = products.filter((product) => !product.slug.startsWith('minecraft-'));
  if (minecraft) displayProducts.push({ ...minecraft, slug: 'minecraft', name: 'Minecraft', description: 'Choose Paper, Forge, Vanilla, Bedrock or Folia.' });
  const groups = groupByCategory(displayProducts);
  const [category, setCategory] = useState('all');
  const visibleGroups = category === 'all' ? groups : groups.filter((group) => group.id === category);
  const available = displayProducts.filter((product) => isOrderable(product)).length;
  const coming = displayProducts.length - available;

  return (
    <>
      <section aria-labelledby="apps-h">
        <Wrap className="grid gap-6 pt-14 pb-12 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Apps', '/apps']]} />
          <h1 id="apps-h" className="max-w-[11em] text-[clamp(44px,7vw,92px)] leading-[0.95] font-semibold tracking-[-0.05em]">Every app we run, on one price card.</h1>
          <p className="max-w-[36em] text-[19px] text-ink-2">
            Each app starts as a container on Pterodactyl with the resources you choose. All of them are priced with the same card of rates, so the
            only thing that changes the price is how much you ask for.
          </p>
          <p className="max-w-[36em] text-[17px] text-ink-2">
            <strong className="font-semibold text-ink">{available}</strong> {available === 1 ? 'app can' : 'apps can'} be deployed today, and{' '}
            <strong className="font-semibold text-ink">{coming}</strong> {coming === 1 ? 'is' : 'are'} still coming.
          </p>
        </Wrap>
      </section>
      <Wrap className="pb-20">
        <nav aria-label="Filter apps by category" className="mb-10 overflow-x-auto border-b border-line">
          <div className="flex w-max min-w-full gap-1 sm:gap-3">
            {[{ id: 'all', label: 'All apps', count: products.length }, ...groups.map((group) => ({ id: group.id, label: group.label, count: group.products.length }))].map((tab) => (
              <button
                key={tab.id}
                type="button"
                aria-pressed={category === tab.id}
                onClick={() => setCategory(tab.id)}
                className={`min-h-11 shrink-0 border-b-2 px-4 py-3 text-[15px] font-semibold transition-colors focus-visible:outline-2 focus-visible:outline-offset-[-4px] focus-visible:outline-green ${
                  category === tab.id ? 'border-green text-ink' : 'border-transparent text-ink-3 hover:text-ink'
                }`}
              >
                {tab.label} <span className="num ml-1 text-[13px] opacity-70">{tab.count}</span>
              </button>
            ))}
          </div>
        </nav>
        {visibleGroups.map((group) => (
          <section key={group.id} aria-labelledby={`cat-${group.id}`} className="mb-12 last:mb-0">
            <div className="flex flex-wrap items-baseline justify-between gap-3 border-b border-line pb-4">
              <h2 id={`cat-${group.id}`} className="font-display text-[26px] font-semibold tracking-[-0.03em]">
                {group.label}
              </h2>
              <p className="num text-[14px] text-ink-3">
                {group.products.length} {group.products.length === 1 ? 'app' : 'apps'}
              </p>
            </div>
            <ul className="mt-6 grid gap-4 lg:grid-cols-3">
              {group.products.map((product) => (
                <Card key={product.slug} product={product} />
              ))}
            </ul>
          </section>
        ))}
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
          <Crumbs items={[['Home', '/'], ['Apps', '/apps'], [slug, `/apps/${slug}`]]} />
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
          <Crumbs items={[['Home', '/'], ['Apps', '/apps'], [product.name, `/apps/${slug}`]]} />
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
          <Crumbs items={[['Home', '/'], ['Apps', '/apps'], [product.name, `/apps/${slug}`]]} />
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

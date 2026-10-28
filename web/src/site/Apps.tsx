import { Configurator } from './Configurator';
import { APP_COPY, FALLBACK } from './content';
import { useProducts } from './catalog';
import { eur, fmtRam } from './pricing';
import { Link } from '../router';
import { Btn, Crumbs, Wrap } from './ui';

/** The name of a category of the catalog. */
const CAT: Record<string, string> = { BOTS: 'Bots', DEVELOPER_TOOLS: 'Developer tools', DATABASES: 'Databases' };

/** The catalog: the products that can be ordered today. */
export function Apps() {
  const products = useProducts();
  return (
    <>
      <section aria-labelledby="apps-h">
        <Wrap className="grid gap-6 pt-14 pb-12 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Apps', '/apps']]} />
          <h1 id="apps-h" className="max-w-[11em] text-[clamp(44px,7vw,92px)] leading-[0.95] font-semibold tracking-[-0.05em]">Apps you can deploy today.</h1>
          <p className="max-w-[36em] text-[19px] text-ink-2">
            Each app starts as a container on Pterodactyl with the resources you choose. All of them are priced with the same card of rates, so the
            only thing that changes the price is how much you ask for.
          </p>
        </Wrap>
      </section>
      <Wrap className="pb-20">
        <ul className="grid gap-4 lg:grid-cols-3">
          {products.map((p) => {
            const copy = APP_COPY[p.slug] ?? FALLBACK(p.description);
            return (
              <li key={p.slug} className="grid content-between gap-8 rounded-[28px] border border-line bg-card p-7 sm:p-8">
                <div className="grid gap-4">
                  <p className="text-[14.5px] text-ink-3">{CAT[p.category] ?? p.category}</p>
                  <h2 className="font-display text-[32px] leading-none font-semibold tracking-[-0.035em]">{p.name}</h2>
                  <p className="text-[17px] text-ink-2">{copy.tagline}</p>
                  <dl className="num mt-2 grid gap-1.5 text-[14px] text-ink-2">
                    <div className="flex justify-between gap-4">
                      <dt>Smallest</dt>
                      <dd>
                        {fmtRam(p.min.ram)} · {p.min.cpu} vCPU · {p.min.disk} GB
                      </dd>
                    </div>
                    <div className="flex justify-between gap-4">
                      <dt>Largest</dt>
                      <dd>
                        {fmtRam(p.max.ram)} · {p.max.cpu} vCPU · {p.max.disk} GB
                      </dd>
                    </div>
                  </dl>
                </div>
                <div className="grid gap-4">
                  <p>
                    <span className="text-[14px] text-ink-3">from </span>
                    <span className="big text-[36px]">{eur(p.minPrice)}</span>
                    <span className="text-ink-3"> /month</span>
                  </p>
                  <Btn to={`/apps/${p.slug}`} variant="outline">Size {p.name}</Btn>
                </div>
              </li>
            );
          })}
        </ul>
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

/** The page of one product, with the configurator of its price. */
export function AppDetail({ slug }: { slug: string }) {
  const products = useProducts();
  const product = products.find((entry) => entry.slug === slug) ?? products[0];
  const copy = APP_COPY[slug] ?? FALLBACK(product?.description ?? slug);

  if (!product) {
    return (
      <section aria-labelledby="app-h">
        <Wrap className="grid gap-6 pt-14 pb-12 sm:pt-20">
          <Crumbs items={[['Home', '/'], ['Apps', '/apps'], [slug, `/apps/${slug}`]]} />
          <h1 id="app-h" className="text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">This product is not on sale today.</h1>
          <p className="max-w-[34em] text-[18px] text-ink-2">The catalog carries more products than the platform can deploy. Tell us what you want to run and we will look at it.</p>
          <div>
            <Btn to="/apps" variant="outline">See what you can deploy</Btn>
          </div>
        </Wrap>
      </section>
    );
  }

  return (
    <section aria-labelledby="app-h">
      <Wrap className="grid items-start gap-12 pt-12 pb-20 sm:pt-16 lg:grid-cols-[minmax(0,1.05fr)_minmax(0,0.95fr)] lg:gap-14">
        <div className="grid content-start gap-7">
          <Crumbs items={[['Home', '/'], ['Apps', '/apps'], [product.name, `/apps/${slug}`]]} />
          <h1 id="app-h" className="text-[clamp(42px,6.4vw,84px)] leading-[0.95] font-semibold tracking-[-0.05em]">
            {product.name} hosting from {eur(product.minPrice)} a month.
          </h1>
          <p className="font-display text-[24px] leading-tight font-medium tracking-[-0.02em]">{copy.tagline}</p>
          <p className="max-w-[34em] text-[18px] text-ink-2">{copy.lead}</p>
          {copy.note ? (
            <p className="max-w-[34em] rounded-2xl border border-line bg-paper-2/60 p-5 text-[16px] text-ink-2">
              <strong className="font-semibold text-ink">Good to know. </strong>
              {copy.note}
            </p>
          ) : null}
          <div>
            <h2 className="mb-3 font-display text-[22px] font-semibold tracking-[-0.02em]">Good for</h2>
            <ul className="grid gap-2.5 text-[17px] text-ink-2">
              {copy.fits.map((fit) => (
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
          {product ? (
            <p className="text-[16px] text-ink-2">
              Step by step:{' '}
              <Link to={`/docs/${product.slug}`} className="text-green underline underline-offset-4">
                {product.name} in the docs
              </Link>
              .
            </p>
          ) : null}
        </div>
        <Configurator slug={slug} lock className="lg:sticky lg:top-24" />
      </Wrap>
    </section>
  );
}

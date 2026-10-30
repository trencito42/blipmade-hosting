import type { CSSProperties } from 'react';
import { Configurator } from './Configurator';
import { APP_COPY, FALLBACK, NOT_YET, TODAY, faqFor } from './content';
import { orderableOf, useProducts, useRates } from './catalog';
import { priceOfResources, eur, fmtRam } from './pricing';
import { Icon } from '../icons';
import type { IconName } from '../icon-map';
import { Link } from '../router';
import { BlipField } from './BlipField';
import { CATEGORIES } from './categories';
import { Btn, Wrap, cx } from './ui';

/**
 * The home page.
 *
 * The configurator is the first thing a visitor sees, because the price is
 * the question. Every number on the page is read from the catalog: the price
 * the page starts at, the card of rates, the examples of the price and the
 * answers of the questions.
 */

function Hero() {
  // The page quotes the price of what can be ordered today, so it reads the
  // products the visitor can actually buy.
  const products = orderableOf(useProducts());
  const from = products.length ? Math.min(...products.map((product) => product.minPrice)) : 0;
  return (
    <section aria-labelledby="h1">
      <Wrap className="grid items-start gap-12 pt-12 pb-16 sm:pt-20 sm:pb-24 lg:grid-cols-[minmax(0,1.08fr)_minmax(0,0.92fr)] lg:gap-14">
        <div className="grid content-start gap-8 lg:pt-6">
          <h1 id="h1" className="rise text-[clamp(46px,8.2vw,104px)] leading-[0.94] font-semibold tracking-[-0.05em]">Hosting for everything you run.</h1>
          <p className="rise max-w-[34em] text-[clamp(18px,1.6vw,21px)] text-ink-2" style={{ '--i': 2 } as CSSProperties}>
            Discord bots, apps, databases and developer tools on one platform. Pick the RAM, CPU and disk, see the monthly price as you go, and
            run it all from one dashboard. From {eur(from)} a month.
          </p>
          <div className="rise flex flex-wrap gap-3" style={{ '--i': 3 } as CSSProperties}>
            <Btn to="/register" size="lg">Get started</Btn>
            <Btn to="/apps" variant="outline" size="lg">Browse the catalog</Btn>
          </div>
          <ul className="rise grid gap-2 text-[15.5px] text-ink-2 sm:grid-cols-2" style={{ '--i': 4 } as CSSProperties}>
            {['One price card for every app', 'Resize whenever you grow', 'Console and files in your browser', 'Real people answer your tickets'].map((t) => (
              <li key={t} className="flex items-center gap-2.5">
                <Icon name="check" size={14} className="shrink-0 text-green" />
                {t}
              </li>
            ))}
          </ul>
        </div>
        <Configurator className="rise lg:sticky lg:top-24" />
      </Wrap>
    </section>
  );
}

function Rates() {
  const rates = useRates();
  const items: [string, string, string][] = [
    [eur(rates.ramPerGb), 'per GB of RAM', 'Memory the container may use.'],
    [eur(rates.cpuPerUnit), 'per vCPU', 'Processors the container may use.'],
    [eur(rates.diskPerGb), 'per GB of disk', 'Space for your files and data.'],
    [eur(rates.baseFee), 'base fee', 'Once per instance, whatever its size.'],
  ];
  const examples: [string, string, { ram: number; cpu: number; disk: number }][] = [
    ['A small bot', 'Always-on and light', { ram: 256, cpu: 1, disk: 1 }],
    ['A starter workspace', 'Room to build', { ram: 1024, cpu: 1, disk: 5 }],
    ['A busy service', 'Headroom for traffic', { ram: 4096, cpu: 2, disk: 20 }],
  ];
  return (
    <section id="pricing" aria-labelledby="pricing-h" className="scroll-mt-20 border-y border-line bg-paper-2/60">
      <Wrap className="py-20 sm:py-28">
        <div className="grid gap-5 lg:grid-cols-[1fr_1fr] lg:items-end">
          <h2 id="pricing-h" className="text-[clamp(36px,5.4vw,68px)] leading-[0.98] font-semibold tracking-[-0.045em]">One card of rates. Every app.</h2>
          <p className="max-w-[32em] text-[18px] text-ink-2">
            The price follows the resources you choose and nothing else, so the same RAM, CPU and disk cost the same in every product. No tiers to
            decode, no plan you have to outgrow.
          </p>
        </div>
        <dl className="mt-14 grid gap-px overflow-hidden rounded-[28px] border border-line bg-line sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([n, l, d]) => (
            <div key={l} className="grid content-between gap-8 bg-paper p-6 sm:p-8">
              <dt className="grid gap-1">
                <span className="big text-[clamp(40px,4.6vw,56px)]">{n}</span>
                <span className="font-display text-[19px] font-semibold">{l}</span>
              </dt>
              <dd className="text-[15.5px] text-ink-3">{d}</dd>
            </div>
          ))}
        </dl>
        <h3 className="mt-16 text-[26px] font-semibold tracking-[-0.03em]">What that adds up to</h3>
        <ul className="mt-6 grid gap-4 md:grid-cols-3">
          {examples.map(([t, d, r]) => (
            <li key={t} className="grid gap-5 rounded-[24px] border border-line bg-card p-6">
              <div>
                <p className="font-display text-[20px] font-semibold">{t}</p>
                <p className="text-[15px] text-ink-3">{d}</p>
              </div>
              <p className="num text-[15px] text-ink-2">
                {fmtRam(r.ram)} RAM · {r.cpu} vCPU · {r.disk} GB disk
              </p>
              <p className="flex items-baseline gap-1.5">
                <span className="big text-[40px]">{eur(priceOfResources(r, rates))}</span>
                <span className="text-ink-3">per month</span>
              </p>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

function AppsRow() {
  // One tile per category, so the page shows what the platform runs without
  // listing every product. The whole catalog is one click away.
  const products = orderableOf(useProducts());
  const tiles = CATEGORIES.map((category) => {
    const own = products.filter((product) => product.category === category.id);
    return { ...category, count: own.length, from: own.length ? Math.min(...own.map((product) => product.minPrice)) : 0, names: own.slice(0, 3).map((product) => product.name) };
  }).filter((tile) => tile.count > 0);
  return (
    <section aria-labelledby="apps-h">
      <Wrap className="py-20 sm:py-28">
        <div className="flex flex-wrap items-end justify-between gap-6">
          <h2 id="apps-h" className="max-w-[12em] text-[clamp(36px,5.4vw,68px)] leading-[0.98] font-semibold tracking-[-0.045em]">Start from what you run.</h2>
          <Btn to="/apps" variant="outline">Full catalog</Btn>
        </div>
        <ul className="mt-12 grid gap-4 sm:grid-cols-2 lg:grid-cols-4">
          {tiles.map((tile) => (
            <li key={tile.id}>
              <Link
                to={`/apps#${tile.slug}`}
                className="group grid h-full content-between gap-10 rounded-[28px] border border-line bg-card p-6 transition-colors hover:border-ink/40"
              >
                <div className="grid gap-4">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-night-2 text-green">
                    <Icon name={tile.icon} size={20} />
                  </span>
                  <div className="grid gap-1.5">
                    <p className="flex items-baseline gap-2 font-display text-[26px] leading-none font-semibold tracking-[-0.03em]">
                      {tile.label}
                      <span className="num text-[14px] font-medium text-ink-3">{tile.count}</span>
                    </p>
                    <p className="text-[15px] text-ink-2">{tile.names.join(', ')}{tile.count > tile.names.length ? ' and more' : ''}</p>
                  </div>
                </div>
                <p className="flex items-end justify-between gap-3">
                  <span>
                    <span className="text-[13px] text-ink-3">from </span>
                    <span className="big text-[28px]">{eur(tile.from)}</span>
                    <span className="text-[13px] text-ink-3"> /month</span>
                  </span>
                  <Icon name="arrow" size={14} className="mb-1.5 text-ink-3 transition-transform group-hover:translate-x-0.5 group-hover:text-ink" />
                </p>
              </Link>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

const TABS = ['Console', 'Files', 'Startup', 'Backups', 'Resources', 'Databases', 'Activity'];

function Dashboard() {
  return (
    <section aria-labelledby="dash-h" className="on-night m-2 rounded-[28px] bg-night text-snow sm:m-3 sm:rounded-[40px]">
      <Wrap className="grid gap-12 py-16 sm:py-24 lg:grid-cols-[0.85fr_1.15fr] lg:items-center lg:gap-16">
        <div className="grid content-start gap-6">
          <h2 id="dash-h" className="text-[clamp(34px,4.8vw,60px)] leading-[0.98] font-semibold tracking-[-0.045em]">Powered by Pterodactyl. Managed for you.</h2>
          <p className="max-w-[30em] text-[17.5px] text-snow-2">
            Every instance is a container on Pterodactyl, the open-source panel trusted for game and app hosting. You get its console, files and
            startup settings, with Blipmade handling the machines, the ports and the billing.
          </p>
          <p className="max-w-[30em] text-[17.5px] text-snow-2">Want something specific to run here? Tell support and we will look at it.</p>
          <div>
            <Btn to="/docs/first-app" variant="outline-night">Read how a first deploy works</Btn>
          </div>
        </div>
        <figure className="grid gap-3">
          <div aria-hidden="true" data-decorative className="overflow-hidden rounded-[24px] border border-night-line bg-night-2">
            <div className="flex gap-1 overflow-hidden border-b border-night-line px-3 pt-3">
              {TABS.map((t, i) => (
                <span key={t} className={cx('rounded-t-xl px-3.5 py-2 text-[13.5px] font-medium whitespace-nowrap', i === 0 ? 'bg-night text-snow' : 'text-snow-2')}>
                  {t}
                </span>
              ))}
            </div>
            <div className="num grid gap-1.5 bg-night p-5 text-[13px] leading-relaxed text-snow-2 sm:p-6 sm:text-[14px]">
              <p>
                <span className="text-mint">Connected</span> · discord-bot-7f3a
              </p>
              <p>$ npm run start</p>
              <p>&gt; node index.js</p>
              <p className="text-snow">Server started on port 3000</p>
              <p className="text-snow">Health: ok</p>
              <p>
                <span className="text-mint">$</span>{' '}
                <span className="caret inline-block h-[1.05em] w-[0.55em] translate-y-[3px] bg-snow" />
              </p>
            </div>
            <div className="grid grid-cols-3 divide-x divide-night-line border-t border-night-line text-center">
              {[['RAM', '512 MB'], ['vCPU', '1'], ['Disk', '5 GB']].map(([k, v]) => (
                <p key={k} className="p-4">
                  <span className="block text-[12.5px] text-snow-2">{k}</span>
                  <span className="num text-[17px] text-snow">{v}</span>
                </p>
              ))}
            </div>
          </div>
          <figcaption className="text-[14px] text-snow-2">Illustration of an instance console. Names and output are examples.</figcaption>
        </figure>
      </Wrap>
    </section>
  );
}

/** What the platform is used for. The links are the pages that answer it. */
const USE: [string, string, string, IconName][] = [
  ['Discord bots', 'Always online, with variables for your token and a container you can grow.', '/apps/discord-bot', 'bot'],
  ['Web apps and APIs', 'Node.js services with files, a console and startup variables.', '/docs/first-app', 'rocket'],
  ['Databases', 'PostgreSQL databases that belong to your instance, with their own credentials.', '/apps/postgresql', 'db'],
  ['Developer tools', 'A workspace in the browser, sized for the way you build.', '/apps/code-server', 'code'],
  ['Long-running jobs', 'A container that stays up while you work, with the files it needs.', '/docs/first-app', 'term'],
  ['Hostnames', 'Point a hostname at an instance and prove that it is yours.', '/docs/domains', 'globe'],
];

function UseCases() {
  return (
    <section aria-labelledby="use-h" className="border-t border-line">
      <Wrap className="py-20 sm:py-28">
        <h2 id="use-h" className="max-w-[13em] text-[clamp(36px,5.4vw,68px)] leading-[0.98] font-semibold tracking-[-0.045em]">If it runs on a panel, it can run here.</h2>
        <ul className="mt-12 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
          {USE.map(([t, d, to, icon]) => (
            <li key={t}>
              <Link
                to={to}
                className="group grid h-full content-between gap-8 rounded-[28px] border border-line bg-card p-7 transition-colors hover:border-ink/40"
              >
                <div className="grid gap-4">
                  <span aria-hidden="true" className="grid size-12 place-items-center rounded-2xl bg-night-2 text-green">
                    <Icon name={icon} size={20} />
                  </span>
                  <p className="font-display text-[26px] leading-tight font-semibold tracking-[-0.03em]">{t}</p>
                  <p className="text-[16.5px] text-ink-2">{d}</p>
                </div>
                <span aria-hidden="true" className="grid size-10 place-items-center rounded-full bg-ink text-paper transition-transform group-hover:translate-x-1">
                  <Icon name="arrow" size={14} />
                </span>
              </Link>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

function Included() {
  return (
    <section aria-labelledby="inc-h">
      <Wrap className="py-20 sm:py-28">
        <h2 id="inc-h" className="max-w-[12em] text-[clamp(36px,5.4vw,68px)] leading-[0.98] font-semibold tracking-[-0.045em]">Everything you need, on every instance.</h2>
        <div className="mt-12 grid gap-10 lg:grid-cols-2 lg:gap-16">
          <div>
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Today</h3>
            <ul className="mt-5 grid gap-3">
              {TODAY.map((t) => (
                <li key={t} className="flex items-start gap-3 rounded-[24px] bg-paper-2/70 p-4 text-[16.5px] text-ink-2">
                  <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full bg-green text-paper">
                    <Icon name="check" size={11} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
          <div>
            <h3 className="font-display text-[22px] font-semibold tracking-[-0.02em]">Not yet</h3>
            <ul className="mt-5 grid gap-3">
              {NOT_YET.map((t) => (
                <li key={t} className="flex items-start gap-3 rounded-[24px] bg-paper-2/70 p-4 text-[16.5px] text-ink-3">
                  <span aria-hidden="true" className="mt-0.5 grid size-6 shrink-0 place-items-center rounded-full border border-line text-ink-3">
                    <Icon name="minus" size={10} />
                  </span>
                  {t}
                </li>
              ))}
            </ul>
          </div>
        </div>
        <p className="mt-6 text-[16px] text-ink-3">
          Limits and details are in the{' '}
          <Link to="/docs/limits" className="text-green underline underline-offset-4">documentation</Link>.
        </p>
      </Wrap>
    </section>
  );
}

function Faq() {
  const questions = faqFor(useRates());
  return (
    <section aria-labelledby="faq-h" className="border-t border-line">
      <Wrap className="grid gap-12 py-20 sm:py-28 lg:grid-cols-[0.8fr_1.2fr]">
        <h2 id="faq-h" className="text-[clamp(36px,5vw,64px)] leading-[0.98] font-semibold tracking-[-0.045em]">Questions people ask first.</h2>
        <div className="divide-y divide-line border-y border-line">
          {questions.map((f) => (
            <details key={f.q} className="group py-1">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-[20px] font-semibold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full border border-line transition-transform group-open:rotate-45">
                  <Icon name="plus" size={12} />
                </span>
              </summary>
              <p className="max-w-[40em] pr-10 pb-6 text-[17px] text-ink-2">{f.a}</p>
            </details>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

function Closing() {
  return (
    <section aria-labelledby="cta-h" className="on-night relative m-2 overflow-hidden rounded-[28px] bg-night text-snow sm:m-3 sm:rounded-[40px]">
      <BlipField className="absolute inset-y-0 right-0 hidden h-full w-[46%] md:block" />
      <Wrap className="relative grid justify-items-start gap-8 py-20 sm:py-28">
        <h2 id="cta-h" className="max-w-[12em] text-[clamp(40px,6.4vw,84px)] leading-[0.96] font-semibold tracking-[-0.05em]">Size it. Order it. Put your code in.</h2>
        <p className="max-w-[30em] text-[18px] text-snow-2">Create an account, move the sliders until the price and the specs fit, and deploy a container that is yours.</p>
        <div className="flex flex-wrap gap-3">
          <Btn to="/register" variant="mint" size="lg">Create account</Btn>
          <Btn to="/docs" variant="outline-night" size="lg">Read the docs</Btn>
        </div>
      </Wrap>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Rates />
      <AppsRow />
      <UseCases />
      <Dashboard />
      <Included />
      <Faq />
      <Closing />
    </>
  );
}

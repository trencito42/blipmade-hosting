import type { CSSProperties, ReactNode } from 'react';
import { useEffect, useState } from 'react';
import { Configurator } from './Configurator';
import { faqFor } from './content';
import { faqFromContent, fillRates, useSiteContent } from './siteContent';
import { useProducts, orderableOf, useRates, type Product } from './catalog';
import { priceOfResources, eur, fmtRam } from './pricing';
import { Icon, ProductMark } from '../icons';
import { get } from '../lib/api';
import { Link } from '../router';
import { CATEGORIES, categoryOf, toneOf } from './categories';
import { Wrap, cx } from './ui';
import { useSession } from '../session';
import { homeOf } from '../auth-guard';

/**
 * The home page, drawn as a plan sheet.
 *
 * Blipmade sells resources, so the page draws resources: every workload is a block on one ruled sheet, the
 * larger the resources the larger the block, and the price of each is the one card of rates applied to its
 * smallest size. Every number is read from the catalogue; nothing on the page is typed by hand. The design rules
 * are in docs/design/homepage-2026/DIRECTION.md.
 *
 * The one motif is the blip: the square and the two arcs of the logo. It marks an index, a live state and the
 * block that is chosen, and appears nowhere else.
 */

/** The mark of the logo, small: a square and two arcs. `live` lets the arcs pulse once a second. */
function Blip({ size = 16, live = false, className }: { size?: number; live?: boolean; className?: string }) {
  return (
    <svg aria-hidden="true" data-decorative viewBox="0 0 24 16" width={size * 1.5} height={size} className={className} fill="none" focusable="false">
      <rect x="0" y="3" width="10" height="10" rx="1.5" fill="currentColor" />
      <path d="M14 4.5a5 5 0 0 1 0 7" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" className={live ? 'blip-arc' : undefined} />
      <path d="M17.5 1.5a9 9 0 0 1 0 13" stroke="currentColor" strokeWidth="1.6" strokeLinecap="round" opacity="0.55" className={live ? 'blip-arc blip-arc-2' : undefined} />
    </svg>
  );
}

/** The head of every section: the index, a label, the statement and, at the right, one line of context. */
function SectionHead({ label, id, children, aside }: { label: string; id: string; children: ReactNode; aside?: ReactNode }) {
  return (
    <header className="grid gap-6 lg:grid-cols-12 lg:items-end">
      <div className="lg:col-span-8">
        <p className="num flex items-center gap-3 text-[12px] tracking-[0.08em] text-ink-3 uppercase">
          <Blip size={11} className="text-green" />
          {label}
        </p>
        <h2 id={id} className="mt-5 max-w-[15em] text-[clamp(32px,4.6vw,64px)] leading-[0.98] font-semibold tracking-[-0.045em]">
          {children}
        </h2>
      </div>
      {aside ? <div className="max-w-[34em] text-[17px] text-ink-2 lg:col-span-4">{aside}</div> : null}
    </header>
  );
}

/** A rectangular action: the arrow says that it leaves the page, the border says that it is a control. */
function Cta({ to, children, tone = 'ink' }: { to: string; children: ReactNode; tone?: 'ink' | 'line' | 'mint' }) {
  return (
    <Link
      to={to}
      className={cx(
        'group inline-flex h-12 items-center gap-3 rounded-full px-6 text-[15.5px] font-semibold whitespace-nowrap transition-[background-color,color,border-color] duration-150',
        tone === 'ink' && 'bg-ink text-paper hover:bg-green',
        tone === 'mint' && 'bg-green text-paper hover:bg-ink',
        tone === 'line' && 'bg-night-3 text-ink hover:bg-ink hover:text-paper',
      )}
    >
      {children}
      <Icon name="arrow" size={12} className="transition-transform duration-150 group-hover:translate-x-1" />
    </Link>
  );
}

/** Where a category is opened. The servers and the mailboxes have their own storefronts. */
const destinationOf = (id: string, slug: string) => (id === 'VPS' ? '/vps' : id === 'EMAIL_HOSTING' ? '/email' : `/apps#${slug}`);

/** The workloads drawn on the sheet, by what most people come for. A name that is not orderable is skipped. */
const SHEET = ['discord-bot', 'minecraft-paper', 'postgresql', 'code-server', 'vps-start', 'email-hosting-starter'];

/**
 * The areas of the sheet, the largest first, on a grid of 12 columns and 6 rows. The workload with the most
 * memory takes the largest area, so the size of a block tells how much it asks for.
 */
const LAYOUTS: Record<number, string[]> = {
  6: ['1 / 1 / 5 / 7', '5 / 5 / 7 / 13', '1 / 7 / 3 / 13', '5 / 1 / 7 / 5', '3 / 7 / 5 / 10', '3 / 10 / 5 / 13'],
  5: ['1 / 1 / 5 / 7', '1 / 7 / 3 / 13', '3 / 7 / 5 / 13', '5 / 1 / 7 / 7', '5 / 7 / 7 / 13'],
  4: ['1 / 1 / 5 / 7', '1 / 7 / 4 / 13', '4 / 7 / 7 / 13', '5 / 1 / 7 / 7'],
};

function PlanSheet({ products }: { products: Product[] }) {
  const [active, setActive] = useState(0);
  const chosen = SHEET.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is Product => Boolean(product));
  const list = (chosen.length >= 4 ? chosen : products).slice(0, 6);
  const ranked = list.slice().sort((a, b) => b.min.ram - a.min.ram).slice(0, 6);
  const areas = LAYOUTS[Math.min(Math.max(ranked.length, 4), 6)]!;
  const current = ranked[Math.min(active, ranked.length - 1)];
  if (!current) return null;
  return (
    <figure className="grid gap-4">
      <ol aria-label="Workloads you can run, drawn by the memory they ask for" className="grid grid-cols-1 gap-3 md:h-[540px] md:grid-cols-12 md:grid-rows-6">
        {ranked.map((product, index) => {
          const on = index === active;
          return (
            <li key={product.slug} className="contents">
              <Link
                to={`/apps/${product.slug}`}
                onMouseEnter={() => setActive(index)}
                onFocus={() => setActive(index)}
                data-small={index >= 3}
                style={{ '--area': areas[index], background: toneOf(product.category) } as CSSProperties}
                className={cx(
                  'tile relative grid min-h-[116px] content-between gap-3 overflow-hidden rounded-[24px] p-5 text-paper transition-[transform,box-shadow] duration-200 md:[grid-area:var(--area)] md:data-[small=true]:p-4',
                  on ? '-translate-y-1 -rotate-[0.6deg] shadow-[0_18px_0_-8px_rgba(255,255,255,0.14)]' : 'hover:-translate-y-0.5',
                )}
              >
                <span className="flex items-start justify-between gap-3">
                  <span className={cx('num rounded-full bg-paper px-2.5 py-1 text-[11.5px] font-bold tracking-[0.02em] text-ink', index > 2 && 'hidden sm:inline')}>from {eur(product.minPrice)}</span>
                  <ProductMark slug={product.slug} fallback={categoryOf(product.category).icon} size={index === 0 ? 44 : index < 3 ? 30 : 24} className="opacity-90" />
                </span>
                <span className="grid gap-1.5">
                  <span className={cx('font-display font-semibold tracking-[-0.035em] text-balance', index === 0 ? 'text-[clamp(30px,3.6vw,52px)] leading-[0.95]' : index < 3 ? 'text-[clamp(22px,2.1vw,30px)] leading-tight' : 'text-[clamp(17px,1.5vw,20px)] leading-tight')}>{product.name}</span>
                  <span className={cx('num whitespace-nowrap font-semibold opacity-75', index < 3 ? 'text-[12.5px]' : 'text-[11px] tracking-[-0.03em]')}>
                    {fmtRam(product.min.ram)} · {product.min.cpu} vCPU · {product.min.disk} GB
                  </span>
                </span>
              </Link>
            </li>
          );
        })}
      </ol>
      <figcaption aria-live="polite" className="num flex flex-wrap items-baseline justify-between gap-x-6 gap-y-1 text-[13px] text-ink-2">
        <span>
          <span className="text-ink">{current.name}</span> · smallest size {fmtRam(current.min.ram)} RAM, {current.min.cpu} vCPU, {current.min.disk} GB disk
        </span>
        <span className="text-ink">from {eur(current.minPrice)} a month</span>
      </figcaption>
    </figure>
  );
}

function Hero() {
  const products = orderableOf(useProducts());
  const from = products.length ? Math.min(...products.map((product) => product.minPrice)) : 0;
  const { user } = useSession();
  const words = useSiteContent()['home.hero'] as { title: string; lead: string; primaryLabel?: string; secondaryLabel?: string } | undefined;
  const rates = useRates();
  return (
    <section aria-labelledby="h1" className="">
      <Wrap className="pt-10 pb-12 sm:pt-16 lg:pb-20">
        <p className="num rise flex flex-wrap items-center gap-x-3 gap-y-1 text-[12px] tracking-[0.08em] text-ink-3 uppercase">
          <Blip size={11} live className="text-green" />
          Independent hosting · bots · games · databases · tools · servers · mail
        </p>
        <div className="mt-8 grid gap-12 lg:grid-cols-12 lg:gap-10">
          <div className="grid content-between gap-10 lg:col-span-5">
            <div className="grid gap-8">
              <h1 id="h1" className="rise text-[clamp(38px,13vw,52px)] leading-[0.94] md:text-[clamp(52px,5.6vw,84px)] font-semibold tracking-[-0.055em]" style={{ '--i': 1 } as CSSProperties}>
                {words?.title ?? (
                  <>
                    <span className="block whitespace-nowrap">Run it here.{' '}</span>
                    <span className="block whitespace-nowrap">Pay for what{' '}</span>
                    <span className="block whitespace-nowrap">it eats.</span>
                  </>
                )}
              </h1>
              <p className="rise max-w-[30em] text-[clamp(18px,1.5vw,21px)] text-ink-2" style={{ '--i': 2 } as CSSProperties}>
                {words ? (
                  <>
                    {fillRates(words.lead, rates, from)}
                    {/\{\{\s*from\s*\}\}/.test(words.lead) ? '' : ` From ${eur(from)} a month.`}
                  </>
                ) : (
                  <>
                    Discord bots, Minecraft worlds, databases, dev tools, servers and mailboxes, all in one dashboard. Pick the RAM, CPU and disk, watch the price move, hit deploy.
                    From {eur(from)} a month.
                  </>
                )}
              </p>
            </div>
            <div className="rise flex flex-wrap gap-3" style={{ '--i': 3 } as CSSProperties}>
              <Cta to={user ? homeOf(user.role) : '/register'}>{user ? 'Open dashboard' : (words?.primaryLabel ?? 'Get started')}</Cta>
              <Cta to="/apps" tone="line">
                {words?.secondaryLabel ?? 'Browse the catalog'}
              </Cta>
            </div>
          </div>
          <div className="rise lg:col-span-7" style={{ '--i': 2 } as CSSProperties}>
            <PlanSheet products={products} />
          </div>
        </div>
        <div className="mt-14 lg:mt-20">
          <p className="num mb-4 flex items-center gap-3 text-[12px] tracking-[0.08em] text-ink-3 uppercase">
            <Blip size={11} className="text-green" />
            Price it yourself
          </p>
          <Configurator layout="bar" />
        </div>
      </Wrap>
    </section>
  );
}

/** The catalogue as an index: one row per category, what it holds, what can be ordered today and from what price. */
function Index() {
  const products = orderableOf(useProducts());
  const rows = CATEGORIES.map((category) => {
    const own = products.filter((product) => product.category === category.id);
    return { ...category, count: own.length, from: own.length ? Math.min(...own.map((product) => product.minPrice)) : 0, names: own.slice(0, 3).map((product) => product.name) };
  }).filter((row) => row.count > 0);
  return (
    <section aria-labelledby="index-h" className="">
      <Wrap className="py-20 sm:py-28">
        <SectionHead label="What runs here" id="index-h" aside={<p>Games, bots, databases, tools, servers and mail. Pick one and it is yours in a few clicks.</p>}>
          So, what are we running today?
        </SectionHead>
        <ul className="mt-12 grid gap-3 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link
                to={destinationOf(row.id, row.slug)}
                style={{ '--tone': toneOf(row.id) } as CSSProperties}
                className="group grid h-full grid-cols-[auto_1fr_auto] items-center gap-x-5 gap-y-1 rounded-[24px] bg-night-2 p-5 transition-[transform,box-shadow] duration-200 hover:-translate-y-1 hover:shadow-[0_0_0_2px_var(--tone)] sm:p-6"
              >
                <span aria-hidden="true" className="grid size-14 place-items-center rounded-[18px] text-paper transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105" style={{ background: toneOf(row.id) }}>
                  <Icon name={row.icon} size={24} />
                </span>
                <span className="grid gap-0.5">
                  <span className="font-display text-[clamp(22px,2.2vw,28px)] leading-tight font-semibold tracking-[-0.03em]">{row.label}</span>
                  <span className="text-[14.5px] text-ink-3">{row.blurb}</span>
                  <span className="mt-1 text-[14px] text-ink-2">{row.names.join(' · ')}</span>
                </span>
                <span className="grid justify-items-end gap-2">
                  <span className="num text-[13.5px] text-ink">from {eur(row.from)}</span>
                  <span aria-hidden="true" className="grid size-9 place-items-center rounded-full bg-ink text-paper transition-transform duration-200 group-hover:translate-x-1"><Icon name="arrow" size={13} /></span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <p className="mt-6 text-[15.5px] text-ink-3">
          Not seeing yours? <Link to="/apps" className="text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-green">The full catalogue</Link> has the rest.
        </p>
      </Wrap>
    </section>
  );
}

/** How a first instance happens, in the three steps the dashboard really has. */
function Flow() {
  const steps: [string, string, string][] = [
    ['Choose', 'Pick what you run and set the RAM, CPU and disk. The price moves with the numbers.', 'The configurator above is the same one the dashboard uses.'],
    ['Pay and build', 'Check out and your instance builds itself: a container with its own address and its own limits.', 'Provisioning shows its state in the dashboard while it runs.'],
    ['Open the panel', 'Console, files and startup settings of the instance, with the machines, the ports and the billing handled for you.', 'Every instance is a container on Pterodactyl.'],
  ];
  return (
    <section aria-labelledby="flow-h" className="">
      <Wrap className="py-20 sm:py-28">
        <SectionHead label="How it works" id="flow-h" aside={<Link to="/docs/first-app" className="text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-green">Read how a first deploy works</Link>}>
          Three steps. No yak shaving.
        </SectionHead>
        <ol className="mt-12 grid gap-3 md:grid-cols-3">
          {steps.map(([title, text, note], i) => (
            <li key={title} className="grid content-start gap-5 rounded-[28px] bg-night-2 p-6 sm:p-8">
              <span aria-hidden="true" className={cx('grid size-14 place-items-center rounded-[18px] text-paper', i === 0 ? '-rotate-3' : i === 1 ? 'rotate-2' : '-rotate-2')} style={{ background: ['#ffd166', '#7fd6ff', '#4ee595'][i] }}>
                <Icon name={(['bolt', 'card', 'rocket'] as const)[i]!} size={24} />
              </span>
              <h3 className="font-display text-[clamp(26px,2.6vw,36px)] leading-tight font-semibold tracking-[-0.035em]">{title}</h3>
              <p className="max-w-[26em] text-[17px] text-ink-2">{text}</p>
              <p className="num text-[12.5px] text-ink-3">{note}</p>
            </li>
          ))}
        </ol>
      </Wrap>
    </section>
  );
}

/** The screens of the customer area, as they are: captures at twice the pixels with example data, not drawings. */
const SCREENS: [string, string, string, string][] = [
  ['Services', 'panel-services', 'Apps and databases: every instance with its state, its resources and its price.', 'The list of services in the Blipmade dashboard, with five example instances, their state, their resources and their monthly price.'],
  ['One instance', 'panel-instance', 'One instance: power controls, live use of memory, disk and processor, and the tabs for console, files, backups and databases.', 'The page of one instance in the dashboard, with the power controls, the memory, disk and processor in use, and the tabs of the instance.'],
  ['Servers', 'panel-servers', 'Servers of your own: address, plan and the one-click SSH command.', 'The list of servers in the dashboard, with two example servers, their plan, their address and their SSH command.'],
  ['Domains', 'panel-domains', 'Domains: connect a hostname to an instance and see that it is verified.', 'The list of domains in the dashboard, with two example hostnames connected to instances.'],
];

function Panel() {
  const [tab, setTab] = useState(0);
  const current = SCREENS[tab]!;
  return (
    <section aria-labelledby="panel-h" className="">
      <Wrap className="py-20 sm:py-28">
        <SectionHead label="The panel" id="panel-h" aside={<p>One dashboard for every kind of workload: services, billing, domains, mail and servers. No juggling five tabs.</p>}>
          Everything in one place. Yes, even the boring parts.
        </SectionHead>
        <div role="tablist" aria-label="Screens of the dashboard" className="mt-12 flex flex-wrap gap-2">
          {SCREENS.map(([label], index) => (
            <button
              key={label}
              type="button"
              role="tab"
              id={`screen-tab-${index}`}
              aria-selected={tab === index}
              aria-controls="screen-view"
              onClick={() => setTab(index)}
              className={cx('inline-flex h-11 items-center rounded-full px-5 text-[15px] font-semibold transition-colors duration-150', tab === index ? 'bg-green text-paper' : 'bg-night-3 text-ink-2 hover:text-ink')}
            >
              {label}
            </button>
          ))}
        </div>
        {/* The tab panel is a plain box: a figure may not take the role of a panel. */}
        <div id="screen-view" role="tabpanel" aria-labelledby={`screen-tab-${tab}`}>
        <figure className="mt-5 grid gap-3">
          <div className="overflow-hidden rounded-[22px] bg-paper-2 shadow-[10px_10px_0_0_rgba(78,229,149,0.16)]">
            {SCREENS.map(([label, file, , alt], index) => (
              <img
                key={file}
                src={`/brand/${file}.webp`}
                alt={alt}
                width={2880}
                height={1520}
                loading="lazy"
                decoding="async"
                hidden={tab !== index}
                className="block h-auto w-full"
              />
            ))}
          </div>
          <figcaption className="max-w-[48em] text-[15px] text-ink-2">
            {current[2]} <span className="text-ink-3">Example data, real screens.</span>
          </figcaption>
        </figure>
        </div>
      </Wrap>
    </section>
  );
}

/** The card of rates as a ledger, then what three sizes add up to. */
function Rates() {
  const rates = useRates();
  const items: [string, string, string][] = [
    [eur(rates.ramPerGb), 'per GB of RAM', 'Memory the container may use.'],
    [eur(rates.cpuPerUnit), 'per vCPU', 'Processors the container may use.'],
    [eur(rates.diskPerGb), 'per GB of disk', 'Space for your files and data.'],
    [eur(rates.baseFee), 'base fee', 'Once per instance, whatever its size.'],
  ];
  const examples: [string, { ram: number; cpu: number; disk: number }][] = [
    ['A small bot', { ram: 256, cpu: 1, disk: 1 }],
    ['A starter workspace', { ram: 1024, cpu: 1, disk: 5 }],
    ['A busy service', { ram: 4096, cpu: 2, disk: 20 }],
  ];
  return (
    <section id="pricing" aria-labelledby="pricing-h" className="scroll-mt-20">
      <Wrap className="py-20 sm:py-28">
        <SectionHead label="What it costs" id="pricing-h" aside={<p>The price follows the resources you choose and nothing else, so the same RAM, CPU and disk cost the same in every product. No tiers to decode, no plan to outgrow.</p>}>
          One card of rates. Every product.
        </SectionHead>
        <dl className="mt-12 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {items.map(([n, l, d], i) => (
            <div key={l} className="grid content-between gap-10 rounded-[26px] p-6 text-paper transition-transform duration-200 hover:-translate-y-1 hover:-rotate-[0.6deg]" style={{ background: ['#ff8a6b', '#7fd6ff', '#b6f26b', '#ffd166'][i] }}>
              <dt className="grid gap-2">
                <span className="big text-[clamp(44px,4.6vw,64px)]">{n}</span>
                <span className="num text-[13px] font-bold tracking-[0.04em] uppercase">{l}</span>
              </dt>
              <dd className="text-[15.5px] font-medium opacity-80">{d}</dd>
            </div>
          ))}
        </dl>
        <h3 className="num mt-16 text-[12px] tracking-[0.08em] text-ink-3 uppercase">What that adds up to</h3>
        <ul className="mt-4 border-t border-ink/70">
          {examples.map(([t, r]) => (
            <li key={t} className="grid grid-cols-[1fr_auto] items-baseline gap-x-6 gap-y-1 border-b border-line py-5 md:grid-cols-[1fr_1.2fr_auto]">
              <span className="font-display text-[clamp(20px,2vw,26px)] font-semibold tracking-[-0.025em]">{t}</span>
              <span className="num order-3 col-span-2 text-[13.5px] text-ink-3 md:order-none md:col-span-1">
                {fmtRam(r.ram)} RAM · {r.cpu} vCPU · {r.disk} GB disk
              </span>
              <span className="num text-[clamp(18px,1.8vw,22px)] text-ink">{eur(priceOfResources(r, rates))}<span className="text-[13px] text-ink-3"> /month</span></span>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

interface PlatformStatus { overall: string }

/** What can be checked: the live state of the site, the documentation, the support address and what is not on offer yet. */
function Trust() {
  const orderable = orderableOf(useProducts()).length;
  const [status, setStatus] = useState<PlatformStatus | null>(null);
  useEffect(() => {
    const controller = new AbortController();
    get<PlatformStatus>('/status', undefined, controller.signal).then(setStatus, () => undefined);
    return () => controller.abort();
  }, []);
  const word = status?.overall === 'operational' ? 'All systems operational' : status ? 'Some systems are affected' : 'See the status page';
  const rows: [string, ReactNode, string, string][] = [
    ['Status', <span key="s" className="inline-flex items-center gap-2"><Blip size={11} live className={status?.overall === 'operational' ? 'text-green' : 'text-ink-3'} />{word}</span>, 'Open the status page', '/status'],
    ['Documentation', 'How a first deploy, a domain and a backup work, written for the product as it is.', 'Read the docs', '/docs'],
    ['Catalogue', `${orderable} things you can deploy right now, each with its price on the page before you sign up.`, 'Browse the catalogue', '/apps'],
    ['Support', 'Stuck? Write to us from the dashboard and a human answers. Want something specific to run here? Tell us.', 'How support works', '/docs/support'],
  ];
  return (
    <section aria-labelledby="trust-h" className="">
      <Wrap className="py-20 sm:py-28">
        <SectionHead label="What you can check" id="trust-h">
          No fine print scavenger hunt.
        </SectionHead>
        <ul className="mt-14 border-t border-ink/70">
          {rows.map(([label, body, action, to]) => (
            <li key={label} className="grid gap-3 border-b border-line py-6 md:grid-cols-[12rem_minmax(0,1fr)_auto] md:items-baseline md:gap-8">
              <span className="num text-[12px] tracking-[0.08em] text-ink-3 uppercase">{label}</span>
              <span className="max-w-[38em] text-[17px] text-ink">{body}</span>
              <Link to={to} className="text-[15.5px] text-ink underline decoration-ink/40 underline-offset-4 hover:decoration-green">
                {action}
              </Link>
            </li>
          ))}
        </ul>
      </Wrap>
    </section>
  );
}

function Faq() {
  const rates = useRates();
  const questions = faqFromContent(useSiteContent(), rates) ?? faqFor(rates);
  return (
    <section aria-labelledby="faq-h" className="">
      <Wrap className="grid gap-12 py-20 sm:py-28 lg:grid-cols-12">
        <div className="lg:col-span-4">
          <p className="num flex items-center gap-3 text-[12px] tracking-[0.08em] text-ink-3 uppercase">
            <Blip size={11} className="text-green" />
            Questions
          </p>
          <h2 id="faq-h" className="mt-5 text-[clamp(32px,4.2vw,56px)] leading-[0.98] font-semibold tracking-[-0.045em]">Questions people ask first.</h2>
        </div>
        <div className="border-t border-ink/70 lg:col-span-8">
          {questions.map((f) => (
            <details key={f.q} className="group border-b border-line">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-5 font-display text-[clamp(18px,1.7vw,22px)] font-semibold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">
                {f.q}
                <span aria-hidden="true" className="grid size-8 shrink-0 place-items-center rounded-full bg-night-3 transition-transform group-open:rotate-45">
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
  const { user } = useSession();
  return (
    <section aria-labelledby="cta-h">
      <Wrap className="py-24 sm:py-36">
        <Blip size={44} live className="-rotate-6 text-green" />
        <h2 id="cta-h" className="mt-8 max-w-[11em] text-[clamp(44px,8vw,120px)] leading-[0.92] font-semibold tracking-[-0.055em]">
          Put the next thing online.
        </h2>
        <p className="mt-8 max-w-[30em] text-[19px] text-ink-2">
          Your bot has been sleeping on your laptop long enough. Create an account, move the sliders until the price and the specs fit, and deploy a container that is yours.
        </p>
        <div className="mt-10 flex flex-wrap gap-3">
          <Cta to={user ? '/app/deploy' : '/register'} tone="mint">{user ? 'Deploy something' : 'Create account'}</Cta>
          <Cta to="/apps" tone="line">Browse the catalog</Cta>
        </div>
      </Wrap>
    </section>
  );
}

export default function Home() {
  return (
    <>
      <Hero />
      <Index />
      <Flow />
      <Panel />
      <Rates />
      <Trust />
      <Faq />
      <Closing />
    </>
  );
}

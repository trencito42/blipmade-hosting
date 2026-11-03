import { useEffect, useRef, useState, type ReactNode } from 'react';
import { Icon, ProductMark } from '../icons';
import { Link, useRouter } from '../router';
import { useSession } from '../session';
import { CATEGORIES, categoryOf, toneOf } from './categories';
import { orderableOf, useProducts, type Product } from './catalog';
import { eur } from './pricing';
import { cx } from './ui';

/**
 * The menus of the bar of the site.
 *
 * Each menu opens a wide panel under the bar, with the real products of the catalogue in it: their marks, their names and the price
 * they start at. A panel opens on a click, on the pointer resting on its button and on the keyboard, and closes on Escape, on a click
 * outside it and on every navigation. The links are in the page when a panel is closed, so a crawler reads them.
 */

const NAV_LINK = 'inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-semibold transition-colors duration-150';

type MenuId = 'games' | 'build' | 'servers';

const GAMES = ['minecraft-paper', 'rust', 'palworld', 'fivem', 'factorio', 'conan-exiles', 'garrys-mod', 'left-4-dead-2', 'core-keeper'];
const POPULAR = ['discord-bot', 'postgresql', 'code-server', 'wordpress', 'uptime-kuma'];
const BUILD = ['BOTS', 'DATABASES', 'DEVELOPER_TOOLS', 'AUTOMATION', 'MONITORING', 'WEB_CMS'];

/** A product as a tile: its mark on the colour of its category, its name and where its price starts. */
function ProductChip({ product }: { product: Product }) {
  const category = categoryOf(product.category);
  return (
    <Link to={`/apps/${product.slug}`} className="group flex items-center gap-3 rounded-2xl p-2.5 transition-colors duration-150 hover:bg-night-2 focus-visible:bg-night-2">
      <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px] text-paper transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105" style={{ background: toneOf(product.category) }}>
        <ProductMark slug={product.slug} fallback={category.icon} size={20} />
      </span>
      <span className="grid min-w-0">
        <span className="truncate text-[15px] font-semibold text-ink">{product.name}</span>
        <span className="num text-[12px] text-ink-3">from {eur(product.minPrice)}</span>
      </span>
    </Link>
  );
}

function ByNames({ products, names }: { products: Product[]; names: string[] }) {
  const picked = names.map((slug) => products.find((product) => product.slug === slug)).filter((product): product is Product => Boolean(product));
  return picked;
}

function Panel({ id, children }: { id: string; children: ReactNode }) {
  return (
    <div id={id} role="region" aria-label={id.replace('menu-', '')} className="mega-panel absolute inset-x-0 top-full z-40 border-b border-line bg-card shadow-[0_40px_60px_-30px_rgba(0,0,0,0.9)]">
      <div className="mx-auto w-full max-w-[1240px] px-5 py-6 sm:px-8 sm:py-8">{children}</div>
    </div>
  );
}

function GamesPanel({ products }: { products: Product[] }) {
  const games = ByNames({ products, names: GAMES });
  return (
    <Panel id="menu-games">
      <div className="grid gap-8 lg:grid-cols-[18rem_1fr]">
        <div className="grid content-start gap-3">
          <p className="font-display text-[28px] leading-tight font-semibold tracking-[-0.035em]">Servers for the games you play with friends.</p>
          <p className="text-[15px] text-ink-2">Pick the world, set the RAM, share the address. The price is shown before you sign up.</p>
          <Link to="/apps#games" className="mt-1 inline-flex w-fit items-center gap-2 rounded-full bg-green px-4 py-2.5 text-[14.5px] font-bold text-paper transition-transform hover:-translate-y-0.5">
            See every game <Icon name="arrow" size={12} />
          </Link>
        </div>
        <ul className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {games.map((product) => (
            <li key={product.slug}>
              <ProductChip product={product} />
            </li>
          ))}
        </ul>
      </div>
    </Panel>
  );
}

function BuildPanel({ products }: { products: Product[] }) {
  const popular = ByNames({ products, names: POPULAR });
  const rows = BUILD.map((id) => ({ ...categoryOf(id), has: products.some((product) => product.category === id) })).filter((row) => row.has);
  return (
    <Panel id="menu-build">
      <div className="grid gap-8 lg:grid-cols-[1.6fr_1fr]">
        <ul className="grid content-start gap-1 sm:grid-cols-2">
          {rows.map((row) => (
            <li key={row.id}>
              <Link to={`/apps#${row.slug}`} className="group flex items-start gap-3.5 rounded-2xl p-3 transition-colors duration-150 hover:bg-night-2 focus-visible:bg-night-2">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-[14px] text-paper transition-transform duration-200 group-hover:-rotate-6 group-hover:scale-105" style={{ background: toneOf(row.id) }}>
                  <Icon name={row.icon} size={19} />
                </span>
                <span className="grid">
                  <span className="text-[16px] font-semibold text-ink">{row.label}</span>
                  <span className="text-[13.5px] text-ink-3">{row.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <div className="grid content-start gap-1 rounded-[22px] bg-night-2 p-4">
          <p className="num px-2.5 pb-1 text-[12px] tracking-[0.08em] text-ink-3 uppercase">People start with</p>
          {popular.map((product) => (
            <ProductChip key={product.slug} product={product} />
          ))}
        </div>
      </div>
    </Panel>
  );
}

function ServersPanel({ products }: { products: Product[] }) {
  const vps = products.filter((product) => product.category === 'VPS');
  const mail = products.filter((product) => product.category === 'EMAIL_HOSTING');
  const from = (list: Product[]) => (list.length ? eur(Math.min(...list.map((product) => product.minPrice))) : null);
  const cards: [string, string, string, string, string | null, string][] = [
    ['VPS', 'Servers', 'A server of your own, with root access.', '/vps', from(vps), 'server'],
    ['EMAIL_HOSTING', 'Hosted email', 'Mailboxes on your own domain.', '/email', from(mail), 'mail'],
    ['DEVELOPER_TOOLS', 'Domains', 'Point a hostname at an instance and prove it is yours.', '/docs/domains', null, 'globe'],
  ];
  return (
    <Panel id="menu-servers">
      <ul className="grid gap-3 md:grid-cols-3">
        {cards.map(([tone, title, text, to, price, icon]) => (
          <li key={title}>
            <Link to={to} className="group grid h-full content-between gap-8 rounded-[22px] p-5 text-paper transition-transform duration-200 hover:-translate-y-1 hover:-rotate-[0.6deg]" style={{ background: toneOf(tone) }}>
              <span className="grid size-11 place-items-center rounded-[14px] bg-paper/90 text-ink">
                <Icon name={icon as never} size={19} />
              </span>
              <span className="grid gap-1">
                <span className="font-display text-[26px] leading-none font-semibold tracking-[-0.035em]">{title}</span>
                <span className="text-[14.5px] font-medium opacity-80">{text}</span>
                {price ? <span className="num mt-2 text-[13px] font-semibold">from {price} a month</span> : null}
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </Panel>
  );
}

/** The three menus with real products, and the pages that are plain links. */
export function MainMenus({ docsActive, serversActive }: { docsActive: boolean; serversActive: boolean }) {
  const [open, setOpen] = useState<MenuId | null>(null);
  const root = useRef<HTMLDivElement>(null);
  const timer = useRef<number | undefined>(undefined);
  const router = useRouter();
  const products = orderableOf(useProducts());
  useEffect(() => setOpen(null), [router.path, router.search]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(null);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(null);
        (root.current?.querySelector(`[data-menu="${open}"]`) as HTMLElement | null)?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  const trigger = (id: MenuId, label: string) => (
    <button
      type="button"
      data-menu={id}
      aria-expanded={open === id}
      aria-controls={`menu-${id}`}
      onClick={() => setOpen(open === id ? null : id)}
      onMouseEnter={(event) => {
        window.clearTimeout(timer.current);
        if (event.nativeEvent instanceof MouseEvent && (event.nativeEvent as PointerEvent).pointerType !== 'touch') setOpen(id);
      }}
      className={cx(NAV_LINK, open === id ? 'bg-ink text-paper' : 'text-ink-2 hover:bg-night-3 hover:text-ink')}
    >
      {label}
      <Icon name="chevronDown" size={11} className={cx('transition-transform duration-200', open === id && 'rotate-180')} />
    </button>
  );
  return (
    <div
      ref={root}
      onMouseLeave={() => {
        window.clearTimeout(timer.current);
        timer.current = window.setTimeout(() => setOpen(null), 160);
      }}
      onMouseEnter={() => window.clearTimeout(timer.current)}
    >
      <nav aria-label="Main" className="hidden items-center gap-1 lg:flex">
        {trigger('games', 'Games')}
        {trigger('build', 'Build')}
        {trigger('servers', 'Servers & mail')}
        <Link to="/#pricing" className={cx(NAV_LINK, 'text-ink-2 hover:bg-night-3 hover:text-ink')}>Pricing</Link>
        <Link to="/docs" className={cx(NAV_LINK, docsActive ? 'bg-night-3 text-ink' : 'text-ink-2 hover:bg-night-3 hover:text-ink')}>Docs</Link>
        <Link to="/vps" className="sr-only focus:not-sr-only" aria-current={serversActive ? 'page' : undefined}>Servers</Link>
      </nav>
      {open === 'games' ? <GamesPanel products={products} /> : null}
      {open === 'build' ? <BuildPanel products={products} /> : null}
      {open === 'servers' ? <ServersPanel products={products} /> : null}
    </div>
  );
}

/**
 * The button of the dashboard. A customer goes to the dashboard of the customers. A member of the staff has two places, so the button
 * opens a small menu and the person chooses, instead of being sent to the admin area every time.
 */
export function DashboardButton({ staff }: { staff: boolean }) {
  const [open, setOpen] = useState(false);
  const ref = useRef<HTMLDivElement>(null);
  const router = useRouter();
  const { user } = useSession();
  useEffect(() => setOpen(false), [router.path]);
  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (ref.current && !ref.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => event.key === 'Escape' && setOpen(false);
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);
  const base = 'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-ink px-5 text-[15px] font-semibold text-paper transition-colors hover:bg-green';
  if (!staff) return <Link to="/app" className={base}>Dashboard</Link>;
  return (
    <div ref={ref} className="relative">
      <button type="button" aria-expanded={open} aria-haspopup="true" onClick={() => setOpen(!open)} className={base}>
        Dashboard
        <Icon name="chevronDown" size={11} className={cx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      {open ? (
        <div role="menu" aria-label="Where to?" className="absolute top-full right-0 z-40 mt-3 w-64 rounded-[22px] border border-line bg-card p-2 shadow-[0_32px_64px_-20px_rgba(0,0,0,0.8)]">
          <p className="num truncate px-3 pt-2 pb-1 text-[12px] text-ink-3">{user?.email}</p>
          <Link role="menuitem" to="/app" className="flex items-center gap-3 rounded-2xl p-3 hover:bg-night-2">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-[12px] text-paper" style={{ background: toneOf('BOTS') }}><Icon name="rocket" size={17} /></span>
            <span className="grid"><span className="text-[15px] font-semibold">My dashboard</span><span className="text-[12.5px] text-ink-3">Services, billing, domains</span></span>
          </Link>
          <Link role="menuitem" to="/admin" className="flex items-center gap-3 rounded-2xl p-3 hover:bg-night-2">
            <span aria-hidden="true" className="grid size-10 place-items-center rounded-[12px] text-paper" style={{ background: toneOf('GAMES') }}><Icon name="shield" size={17} /></span>
            <span className="grid"><span className="text-[15px] font-semibold">Admin</span><span className="text-[12.5px] text-ink-3">The back office</span></span>
          </Link>
        </div>
      ) : null}
    </div>
  );
}

export { CATEGORIES };

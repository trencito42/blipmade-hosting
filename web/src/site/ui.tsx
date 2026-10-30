import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icons';
import { Link, useRouter } from '../router';
import { useProducts } from './catalog';
import { CATEGORIES } from './categories';
import { LEGAL_PAGE_LIST } from '../legal/links';
import { useSession } from '../session';
import { homeOf } from '../auth-guard';

/**
 * The atoms of the public site.
 *
 * The design of the reference is the measure of everything here: the pill
 * button, the panel that turns its corners on a phone, the night footer that
 * closes the page, and the skip link that lets a keyboard jump over the bar.
 *
 * The links are real anchors with an address, so a page can be printed, sent
 * and read by a crawler without the page load.
 */

export const cx = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

/** The measure of the page. Every section of the site uses it. */
export function Wrap({ children, className }: { children: ReactNode; className?: string }) {
  return <div className={cx('mx-auto w-full max-w-[1240px] px-[max(20px,env(safe-area-inset-left))] sm:px-8', className)}>{children}</div>;
}

/**
 * The mark of the platform.
 *
 * It is the logo of the platform and it is served by this site, under
 * `/favicon.svg`. The file is the same one the application uses, so the mark
 * of the header and the mark of the browser are the same mark.
 */
export function Mark({ size = 24 }: { size?: number }) {
  return <img src="/favicon.svg" alt="" width={164} height={148} style={{ height: size, width: 'auto' }} />;
}

/** The mark and the name of the platform, together. */
export function Logo({ onNight }: { onNight?: boolean }) {
  return (
    <Link to="/" aria-label="Blipmade home" className="inline-flex items-center gap-2.5">
      <Mark />
      <span className={cx('font-display text-[21px] font-semibold tracking-[-0.03em]', onNight ? 'text-snow' : 'text-ink')}>blipmade</span>
    </Link>
  );
}

type Variant = 'primary' | 'mint' | 'outline' | 'outline-night' | 'quiet';

const VARIANT: Record<Variant, string> = {
  primary: 'bg-ink text-paper hover:bg-white',
  mint: 'bg-mint text-night hover:bg-[#6cf0a8]',
  outline: 'border border-ink/25 text-ink hover:bg-ink/5',
  'outline-night': 'border border-snow/25 text-snow hover:bg-snow/10',
  quiet: 'text-ink hover:bg-ink/5',
};

const SIZE = { md: 'h-11 px-5 text-[15px]', lg: 'h-14 px-7 text-[17px]' };

/**
 * The button of the public site.
 *
 * It is a pill, and it is big enough to be pressed with a thumb. A button
 * that leads somewhere is an anchor with an address, so it can be opened in
 * another tab and it is found by a crawler.
 */
export function Btn({
  to,
  variant = 'primary',
  size = 'md',
  className,
  children,
  ...rest
}: { to?: string; variant?: Variant; size?: 'md' | 'lg'; className?: string; children: ReactNode } & ButtonHTMLAttributes<HTMLButtonElement>) {
  const cls = cx(
    'inline-flex items-center justify-center gap-2 rounded-full font-semibold whitespace-nowrap transition-[background-color,transform] duration-150 active:scale-[0.98] disabled:opacity-60',
    VARIANT[variant],
    SIZE[size],
    className,
  );
  if (to) return <Link to={to} className={cls}>{children}</Link>;
  return <button className={cls} {...rest}>{children}</button>;
}

/** The panel of the public site: a card with the corners of the reference. */
export function Panel({ children, className, tone = 'card' }: { children: ReactNode; className?: string; tone?: 'card' | 'night' }) {
  return (
    <div
      className={cx(
        'rounded-[28px] border p-6 sm:rounded-[32px] sm:p-8',
        tone === 'night' ? 'border-night-line bg-night' : 'border-line bg-card',
        className,
      )}
    >
      {children}
    </div>
  );
}

/** The heading of a section, in the typeface of the display. */
export function H2({ children, className }: { children: ReactNode; className?: string }) {
  return <h2 className={cx('font-display text-[clamp(26px,3.4vw,38px)] leading-[1.05] font-semibold tracking-[-0.035em]', className)}>{children}</h2>;
}

/** The line under a heading. */
export function Lead({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('text-[18px] text-ink-2', className)}>{children}</p>;
}

/** The small label above a heading. */
export function Eyebrow({ children, className }: { children: ReactNode; className?: string }) {
  return <p className={cx('font-display text-[14px] font-semibold tracking-[0.06em] text-green uppercase', className)}>{children}</p>;
}

/** The trail of the pages, so a visitor knows where they are. */
export function Crumbs({ items }: { items: [string, string][] }) {
  return (
    <nav aria-label="Breadcrumb" className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[14px] text-ink-3">
      {items.map(([label, to], index) => (
        <span key={to} className="flex items-center gap-2">
          {index > 0 && <Icon name="chevronDown" size={10} className="-rotate-90 text-ink-3" />}
          {index === items.length - 1 ? (
            <span aria-current="page" className="text-ink-2">{label}</span>
          ) : (
            <Link to={to} className="transition-colors duration-150 hover:text-ink">{label}</Link>
          )}
        </span>
      ))}
    </nav>
  );
}

const NAV_LINK = 'inline-flex h-9 items-center gap-1.5 rounded-full px-4 text-[14.5px] font-medium transition-colors duration-150';

/** The categories of the catalog with the number of products each holds, for the menu. */
function useCategoryCounts() {
  const products = useProducts();
  return CATEGORIES.map((category) => ({ ...category, count: products.filter((product) => product.category === category.id).length })).filter((category) => category.count > 0);
}

/**
 * The menu of the catalog.
 *
 * A panel under the button names every category with its icon and the number
 * of products it holds, so a visitor goes straight to games or databases
 * instead of to one list of everything. The panel is in the page even when it
 * is closed, so a crawler reads the links.
 */
function CatalogMenu({ active }: { active: boolean }) {
  const [open, setOpen] = useState(false);
  const root = useRef<HTMLDivElement>(null);
  const button = useRef<HTMLButtonElement>(null);
  const categories = useCategoryCounts();
  const router = useRouter();

  // A navigation closes the panel.
  useEffect(() => setOpen(false), [router.path, router.search]);

  useEffect(() => {
    if (!open) return;
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) setOpen(false);
    };
    const escape = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        setOpen(false);
        button.current?.focus();
      }
    };
    document.addEventListener('mousedown', outside);
    document.addEventListener('keydown', escape);
    return () => {
      document.removeEventListener('mousedown', outside);
      document.removeEventListener('keydown', escape);
    };
  }, [open]);

  return (
    <div ref={root} className="relative">
      <button
        ref={button}
        type="button"
        aria-expanded={open}
        aria-controls="catalog-menu"
        onClick={() => setOpen(!open)}
        className={cx(NAV_LINK, active || open ? 'bg-night-3 text-ink' : 'text-ink-2 hover:text-ink')}
      >
        Catalog
        <Icon name="chevronDown" size={11} className={cx('transition-transform duration-200', open && 'rotate-180')} />
      </button>
      <div
        id="catalog-menu"
        hidden={!open}
        className="absolute top-full left-0 z-40 mt-3 w-[640px] rounded-[28px] border border-line bg-card p-3 shadow-[0_32px_64px_-20px_rgba(0,0,0,0.8)]"
      >
        <ul className="grid grid-cols-2 gap-1">
          {categories.map((category) => (
            <li key={category.id}>
              <Link to={`/apps#${category.slug}`} className="group flex items-center gap-3.5 rounded-[20px] p-3 transition-colors hover:bg-night-2">
                <span aria-hidden="true" className="grid size-11 shrink-0 place-items-center rounded-2xl bg-night-3 text-mint">
                  <Icon name={category.icon} size={18} />
                </span>
                <span className="grid min-w-0">
                  <span className="flex items-baseline gap-2 text-[15.5px] font-semibold text-ink">
                    {category.label}
                    <span className="num text-[12.5px] font-medium text-ink-3">{category.count}</span>
                  </span>
                  <span className="truncate text-[13.5px] text-ink-3">{category.blurb}</span>
                </span>
              </Link>
            </li>
          ))}
        </ul>
        <Link to="/apps" className="mt-2 flex items-center justify-between gap-3 rounded-[20px] bg-night-2 px-5 py-3.5 text-[15px] font-semibold text-ink transition-colors hover:bg-night-3">
          Browse the whole catalog
          <Icon name="arrow" size={14} className="text-mint" />
        </Link>
      </div>
    </div>
  );
}

/** The bar of the site. It is sticky and it holds the name, the pages and the two actions. */
export function Nav() {
  const [open, setOpen] = useState(false);
  const { path } = useRouter();
  const categories = useCategoryCounts();
  // A customer who is already signed in is sent to the dashboard, not to a
  // form they do not need.
  const { user } = useSession();
  const dashboard = user ? homeOf(user.role) : null;
  const here = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const plain = (active: boolean) => cx(NAV_LINK, active ? 'bg-night-3 text-ink' : 'text-ink-2 hover:text-ink');
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/85 backdrop-blur-md">
      <Wrap className="flex h-[68px] items-center gap-6">
        <Logo />
        <nav aria-label="Main" className="ml-4 hidden items-center gap-1 rounded-full border border-line bg-card/70 p-1 md:flex">
          <CatalogMenu active={here('/apps')} />
          <Link to="/#pricing" className={plain(false)}>Pricing</Link>
          <Link to="/vps" className={plain(here('/vps'))}>Servers</Link>
          <Link to="/docs" className={plain(here('/docs'))}>Docs</Link>
        </nav>
        <div className="ml-auto hidden items-center gap-2 md:flex">
          {dashboard ? (
            <Btn to={dashboard}>Dashboard</Btn>
          ) : (
            <>
              <Btn to="/login" variant="quiet">
                Log in
              </Btn>
              <Btn to="/register">Get started</Btn>
            </>
          )}
        </div>
        <button
          type="button"
          className="ml-auto grid size-11 place-items-center rounded-full hover:bg-ink/5 md:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          <Icon name={open ? 'close' : 'menu'} size={20} />
        </button>
      </Wrap>
      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-line/70 bg-paper md:hidden">
          <Wrap className="grid gap-1 py-4">
            <p className="px-4 pt-2 pb-1 text-[13px] font-semibold text-ink-3">Catalog</p>
            <ul className="grid grid-cols-2 gap-2 pb-2">
              {categories.map((category) => (
                <li key={category.id}>
                  <Link to={`/apps#${category.slug}`} onClick={() => setOpen(false)} className="flex items-center gap-3 rounded-2xl border border-line bg-card px-3.5 py-3 text-[15px] font-semibold">
                    <Icon name={category.icon} size={16} className="shrink-0 text-mint" />
                    <span className="truncate">{category.label}</span>
                  </Link>
                </li>
              ))}
            </ul>
            {([['Pricing', '/#pricing'], ['Servers', '/vps'], ['Docs', '/docs'], ['Everything in the catalog', '/apps']] as const).map(([label, to]) => (
              <Link key={label} to={to} onClick={() => setOpen(false)} className="flex items-center justify-between rounded-2xl px-4 py-3 font-display text-[22px] font-semibold tracking-tight hover:bg-ink/5">
                {label}
                <Icon name="arrow" size={16} className="text-ink-3" />
              </Link>
            ))}
            <div className="mt-2 grid grid-cols-2 gap-3">
              {dashboard ? (
                <Btn to={dashboard} className="col-span-2">
                  Dashboard
                </Btn>
              ) : (
                <>
                  <Btn to="/login" variant="outline">
                    Log in
                  </Btn>
                  <Btn to="/register">Get started</Btn>
                </>
              )}
            </div>
          </Wrap>
        </nav>
      ) : null}
    </header>
  );
}

/** The end of the page: the night panel with the four columns. */
export function Footer() {
  const { status } = useSession();
  const col = 'grid content-start gap-2.5';
  const a = 'text-[15px] text-snow-2 transition-colors duration-150 hover:text-snow';
  return (
    <footer className="on-night m-2 mt-0 rounded-[28px] bg-night text-snow sm:m-3 sm:rounded-[36px]">
      <Wrap className="grid gap-12 py-14 sm:py-20 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div className="grid content-start gap-4">
          <Logo onNight />
          <p className="max-w-xs text-[15px] text-snow-2">Hosting for everything you run. Pick the resources, see the price, go live.</p>
        </div>
        <nav aria-label="Product" className={col}>
          <h2 className="font-display text-[17px] font-semibold">Product</h2>
          <Link to="/apps" className={a}>Catalog</Link>
          <Link to="/#pricing" className={a}>Pricing</Link>
          <Link to="/vps" className={a}>Servers (VPS)</Link>
          <Link to="/docs" className={a}>Documentation</Link>
          <Link to="/docs/status" className={a}>Status and incidents</Link>
        </nav>
        <nav aria-label="Account" className={col}>
          <h2 className="font-display text-[17px] font-semibold">Account</h2>
          {status === 'authenticated' ? (
            <>
              <Link to="/app" className={a}>Dashboard</Link>
              <Link to="/app/settings" className={a}>Account settings</Link>
            </>
          ) : status === 'anonymous' ? (
            <>
              <Link to="/register" className={a}>Create account</Link>
              <Link to="/login" className={a}>Log in</Link>
            </>
          ) : null}
          <Link to="/docs/support" className={a}>Support</Link>
        </nav>
        <nav aria-label="Legal" className={col}>
          <h2 className="font-display text-[17px] font-semibold">Legal</h2>
          {LEGAL_PAGE_LIST.map((page) => (
            <Link key={page.to} to={page.to} className={a}>{page.label}</Link>
          ))}
        </nav>
      </Wrap>
      <Wrap className="border-t border-night-line py-6 text-[14px] text-snow-2">© 2026 Blipmade. Prices are in euros per month.</Wrap>
    </footer>
  );
}

/**
 * The frame of every public page.
 *
 * It opens with a link that only a keyboard can see, so a visitor who does
 * not use a mouse can jump over the bar of the site, and it closes with the
 * footer that names every other page.
 */
export function Page({ children }: { children: ReactNode }) {
  return (
    <>
      <a
        href="#main"
        className="sr-only focus:not-sr-only focus:fixed focus:top-3 focus:left-3 focus:z-50 focus:rounded-full focus:bg-ink focus:px-5 focus:py-3 focus:text-paper"
      >
        Skip to content
      </a>
      <Nav />
      <main id="main">{children}</main>
      <Footer />
    </>
  );
}

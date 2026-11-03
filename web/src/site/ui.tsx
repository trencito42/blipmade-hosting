import { HamburgerIcon } from '../HamburgerIcon';
import { useEffect, useRef, useState, type ButtonHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icons';
import { Link, useRouter } from '../router';
import { orderableOf, useProducts } from './catalog';
import { CATEGORIES, toneOf } from './categories';
import { DashboardButton, MainMenus } from './MegaMenus';
import { LEGAL_PAGE_LIST } from '../legal/links';
import { useSession } from '../session';
import { isStaff } from '../auth-guard';
import { useSiteContent } from './siteContent';

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
  outline: 'bg-night-3 text-ink hover:bg-ink hover:text-paper',
  'outline-night': 'bg-snow/10 text-snow hover:bg-snow/20',
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

/** The bar of the site. It is sticky and it holds the name, the pages and the two actions. */
export function Nav() {
  const [open, setOpen] = useState(false);
  const { path } = useRouter();
  const products = orderableOf(useProducts());
  // A customer who is already signed in goes to the dashboard of the customers. A member of the staff has two places and chooses.
  const { user } = useSession();
  const staff = user ? isStaff(user.role) : false;
  const here = (prefix: string) => path === prefix || path.startsWith(`${prefix}/`);
  const notice = useSiteContent()['site.announcement'] as { message: string; linkLabel?: string; linkTo?: string } | undefined;
  const mobileGroups: [string, [string, string][]][] = [
    ['Games', [['Every game', '/apps#games'], ...(['minecraft-paper', 'rust', 'palworld', 'fivem'] as const).flatMap((slug) => { const p = products.find((x) => x.slug === slug); return p ? [[p.name, `/apps/${p.slug}`] as [string, string]] : []; })]],
    ['Build', CATEGORIES.filter((c) => ['BOTS', 'DATABASES', 'DEVELOPER_TOOLS', 'AUTOMATION', 'MONITORING', 'WEB_CMS'].includes(c.id) && products.some((p) => p.category === c.id)).map((c) => [c.label, `/apps#${c.slug}`] as [string, string])],
    ['Servers & mail', [['Servers (VPS)', '/vps'], ['Hosted email', '/email'], ['Domains', '/docs/domains']]],
  ];
  return (
    <header className="sticky top-0 z-30 border-b border-line/70 bg-paper/90 backdrop-blur-md">
      {notice?.message && (
        <div role="status" className="border-b border-line/70 bg-night-3 px-4 py-2 text-center text-[13.5px] text-ink">
          {notice.message}
          {notice.linkLabel && notice.linkTo && (
            <Link to={notice.linkTo} className="ml-2 font-semibold underline">{notice.linkLabel}</Link>
          )}
        </div>
      )}
      <Wrap className="flex h-[68px] items-center gap-4 lg:gap-6">
        <Logo />
        <div className="ml-2 hidden lg:block">
          <MainMenus docsActive={here('/docs')} serversActive={here('/vps')} />
        </div>
        <div className="ml-auto hidden items-center gap-2 lg:flex">
          {user ? (
            <DashboardButton staff={staff} />
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
          className="ml-auto grid size-11 place-items-center rounded-full hover:bg-ink/5 lg:hidden"
          aria-expanded={open}
          aria-controls="mobile-nav"
          aria-label={open ? 'Close menu' : 'Open menu'}
          onClick={() => setOpen(!open)}
        >
          <HamburgerIcon open={open} />
        </button>
      </Wrap>
      {open ? (
        <nav id="mobile-nav" aria-label="Mobile" className="max-h-[calc(100dvh-68px)] overflow-y-auto border-t border-line/70 bg-paper lg:hidden">
          <Wrap className="grid gap-5 py-5">
            {mobileGroups.map(([title, links]) => (
              <section key={title} aria-label={title}>
                <p className="px-1 pb-2 font-display text-[22px] font-semibold tracking-[-0.03em]">{title}</p>
                <ul className="flex flex-wrap gap-2">
                  {links.map(([label, to]) => (
                    <li key={to}>
                      <Link to={to} onClick={() => setOpen(false)} className="inline-flex min-h-11 items-center rounded-full border border-line bg-card px-4 text-[15px] font-semibold">
                        {label}
                      </Link>
                    </li>
                  ))}
                </ul>
              </section>
            ))}
            <div className="grid gap-1">
              {([['Pricing', '/#pricing'], ['Docs', '/docs'], ['Everything in the catalog', '/apps']] as const).map(([label, to]) => (
                <Link key={label} to={to} onClick={() => setOpen(false)} className="flex min-h-12 items-center justify-between rounded-2xl px-1 font-display text-[22px] font-semibold tracking-tight">
                  {label}
                  <Icon name="arrow" size={16} className="text-ink-3" />
                </Link>
              ))}
            </div>
            <div className="grid grid-cols-2 gap-3">
              {user ? (
                <>
                  <Btn to="/app" className={staff ? '' : 'col-span-2'}>My dashboard</Btn>
                  {staff ? <Btn to="/admin" variant="outline">Admin</Btn> : null}
                </>
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

/** The end of the page: a sign-off, the places to go, and the fine print. */
export function Footer() {
  const { status } = useSession();
  // On a phone a link is at least 44px tall, so it can be hit with a thumb; on a wide screen the list is tight again.
  const col = 'grid content-start gap-0.5 sm:gap-2';
  const a = 'inline-flex min-h-11 items-center text-[15px] text-snow-2 transition-colors duration-150 hover:text-snow sm:min-h-0';
  const head = 'pb-1 font-display text-[18px] font-semibold tracking-[-0.02em]';
  const tags = CATEGORIES.filter((category) => ['GAMES', 'BOTS', 'DATABASES', 'DEVELOPER_TOOLS', 'VPS', 'EMAIL_HOSTING'].includes(category.id));
  return (
    <footer className="on-night m-2 mt-0 overflow-hidden rounded-[28px] bg-night text-snow sm:m-3 sm:rounded-[36px]">
      <Wrap className="grid gap-12 pt-14 pb-10 sm:pt-20 lg:grid-cols-[1.3fr_2fr] lg:gap-16">
        <div className="grid content-start gap-6">
          <Logo onNight />
          <p className="max-w-[11em] font-display text-[clamp(34px,4.2vw,52px)] leading-[0.98] font-semibold tracking-[-0.045em]">Go put something online.</p>
          <p className="max-w-[24em] text-[16px] text-snow-2">Independent hosting for bots, games, databases and the tools you are tired of running on a laptop.</p>
          <ul className="flex flex-wrap gap-2" aria-label="Start with">
            {tags.map((category) => (
              <li key={category.id}>
                <Link
                  to={category.id === 'VPS' ? '/vps' : category.id === 'EMAIL_HOSTING' ? '/email' : `/apps#${category.slug}`}
                  className="inline-flex min-h-10 items-center rounded-full px-4 text-[14px] font-bold text-paper transition-transform duration-150 hover:-translate-y-0.5 hover:-rotate-2"
                  style={{ background: toneOf(category.id) }}
                >
                  {category.label.replace(' (VPS)', '')}
                </Link>
              </li>
            ))}
          </ul>
        </div>
        <div className="grid gap-10 sm:grid-cols-3">
          <nav aria-label="Learn" className={col}>
            <h2 className={head}>Learn</h2>
            <Link to="/docs/first-app" className={a}>Your first deploy</Link>
            <Link to="/docs" className={a}>Documentation</Link>
            <Link to="/docs/domains" className={a}>Connect a domain</Link>
            <Link to="/docs/status" className={a}>Status and incidents</Link>
            <Link to="/#pricing" className={a}>How pricing works</Link>
          </nav>
          <nav aria-label="Account" className={col}>
            <h2 className={head}>Need a hand?</h2>
            <Link to="/docs/support" className={a}>Talk to support</Link>
            {status === 'authenticated' ? (
              <>
                <Link to="/app" className={a}>My dashboard</Link>
                <Link to="/app/settings" className={a}>Account settings</Link>
              </>
            ) : status === 'anonymous' ? (
              <>
                <Link to="/register" className={a}>Create account</Link>
                <Link to="/login" className={a}>Log in</Link>
              </>
            ) : null}
            <Link to="/abuse" className={a}>Report abuse</Link>
          </nav>
          <nav aria-label="Legal" className={col}>
            <h2 className={head}>The fine print</h2>
            {LEGAL_PAGE_LIST.map((page) => (
              <Link key={page.to} to={page.to} className={a}>{page.label}</Link>
            ))}
          </nav>
        </div>
      </Wrap>
      <Wrap className="flex flex-wrap items-center justify-between gap-x-6 gap-y-2 border-t border-night-line py-6 text-[14px] text-snow-2">
        <span>© 2026 Blipmade. Prices are in euros per month.</span>
        <span>Made independently. Please be nice to the servers.</span>
      </Wrap>
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

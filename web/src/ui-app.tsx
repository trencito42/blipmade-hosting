import {
  cloneElement,
  createContext,
  isValidElement,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type ReactNode,
  type RefObject,
} from 'react';
import { cn } from './lib';
import { cellClass, headerClass, type TableColumn } from './lib/table';
import { get, post, relativeTime, type NotificationView } from './lib/api';
import { Icon, type IconName } from './icons';
import { Link, useRouter } from './router';
import { useSession } from './session';
import logo from './logo.svg';
import { LegalFooter } from './legal/LegalFooter';

/**
 * App-area components. Same visual language as the marketing site: flat
 * surfaces, one green accent, no borders or shadows. Hierarchy comes from
 * layering (bg -> s1 -> s2 -> s3).
 */

// --- layout ---------------------------------------------------------------

/**
 * A strip that scrolls sideways on purpose: filters, chips, a stepper.
 *
 * The strip scrolls inside its own box, so the page never scrolls sideways.
 * The scrollbar of the design system stays out of the way, but the strip still
 * says that it scrolls: the right edge fades out, so the finger can see that
 * there is more to the side.
 *
 * The items of the strip must not shrink (`shrink-0`), otherwise the strip
 * would squeeze them instead of scrolling.
 */
export function ScrollRow({
  children,
  className,
  innerClassName,
  surface = 'bg',
  label,
}: {
  children: ReactNode;
  className?: string;
  innerClassName?: string;
  /** The surface the strip lies on: the fade has to end in that colour. */
  surface?: 'bg' | 's1';
  label?: string;
}) {
  return (
    <div className={cn('relative min-w-0', className)}>
      <div
        {...(label ? { role: 'group', 'aria-label': label } : {})}
        className={cn(
          // No gap in the base: the caller asks for the gap it needs, so two
          // different gaps never fight over the same property.
          'flex min-w-0 overflow-x-auto overscroll-x-contain bm-hide-scroll',
          innerClassName,
        )}
      >
        {children}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent',
          surface === 's1' ? 'from-s1' : 'from-bg',
        )}
      />
    </div>
  );
}

export interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
  /** Only match the exact path, used for the dashboard entry. */
  exact?: boolean;
  /** Shorter label for the phone tab bar, when the full label does not fit. */
  shortLabel?: string;
  /** The main action of the phone bar: a round button of the accent colour. */
  primary?: boolean;
}

/**
 * True while the software keyboard covers the bottom of the screen.
 *
 * The phone tab bar is fixed to the bottom of the layout viewport, so on a
 * phone that resizes its layout for the keyboard the bar would sit on top of
 * the field that is being typed into. The visual viewport tells us how much
 * of the screen the keyboard covers.
 */
function useSoftwareKeyboard(threshold = 120): boolean {
  const [open, setOpen] = useState(false);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!viewport) return;
    let frame = 0;
    const measure = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => {
        const covered = window.innerHeight - viewport.height - viewport.offsetTop;
        setOpen(covered > threshold);
      });
    };
    measure();
    viewport.addEventListener('resize', measure);
    viewport.addEventListener('scroll', measure);
    return () => {
      cancelAnimationFrame(frame);
      viewport.removeEventListener('resize', measure);
      viewport.removeEventListener('scroll', measure);
    };
  }, [threshold]);
  return open;
}

export function AppShell({
  nav,
  title,
  subtitle,
  actions,
  children,
  environment,
  phoneTabs,
}: {
  nav: NavEntry[];
  title: string;
  subtitle?: string;
  actions?: ReactNode;
  children: ReactNode;
  environment?: string;
  phoneTabs?: NavEntry[];
}) {
  const { path } = useRouter();
  const isActive = (entry: NavEntry) =>
    entry.exact ? path === entry.to : path === entry.to || path.startsWith(`${entry.to}/`);

  // The bell of the notifications belongs to the customer area. The staff
  // area has its own queue and its own log, and a member of the staff does
  // not wait for the messages of a customer.
  const inCustomerArea = path === '/app' || path.startsWith('/app/');

  const tabs = phoneTabs ?? nav.slice(0, 4);
  const keyboardOpen = useSoftwareKeyboard();

  // The phone bar shows four entries. The rest of the navigation has to stay
  // reachable, so it opens in a sheet from the fifth cell.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const rest = useMemo(() => nav.filter((entry) => !tabs.some((tab) => tab.to === entry.to)), [nav, tabs]);
  const { user, logout } = useSession();
  const restActive = rest.some(isActive);

  // A new page closes the sheet.
  useEffect(() => {
    setMoreOpen(false);
  }, [path]);

  // The sheet is a dialog: it closes with Escape and returns the focus to the
  // button that opened it.
  const closeMore = useCallback(() => {
    setMoreOpen(false);
    moreButton.current?.focus();
  }, []);

  useEffect(() => {
    if (!moreOpen) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        closeMore();
        return;
      }
      // The focus stays inside the sheet while it is open.
      if (event.key !== 'Tab') return;
      const panel = sheet.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (event.shiftKey && (active === first || !panel.contains(active))) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && active === last) {
        event.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    sheet.current?.querySelector<HTMLElement>('a, button')?.focus();
    return () => document.removeEventListener('keydown', onKey);
  }, [moreOpen, closeMore]);

  return (
    <div className="min-h-[100svh] bg-bg">
      <div className="lg:flex">
        {/* Desktop sidebar */}
        <aside data-print-hide="" className="sticky top-0 hidden h-[100svh] w-[272px] shrink-0 flex-col border-r border-line bg-s1 p-4 lg:flex">
          <Link to="/" className="mb-6 flex items-center gap-2.5 rounded-lg px-2 py-1 text-[21px] font-semibold tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
            <img src={logo} alt="" width={164} height={148} className="h-6 w-auto" />
            blipmade
          </Link>
          <nav aria-label="Main" className="grid gap-1">
            {nav.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                aria-current={isActive(entry) ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-xl px-3 text-[15px] font-medium transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h',
                  isActive(entry) ? 'bg-card text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
                )}
              >
                <Icon name={entry.icon} size={18} className={isActive(entry) ? 'text-acc' : 'text-ink3'} />
                {entry.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            {environment && (
              <p className="mb-2 rounded-full border border-line bg-card px-3 py-1.5 text-center font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink2">
                {environment}
              </p>
            )}
            <Link to="/" className="flex h-11 items-center gap-3 rounded-xl px-3 text-[14.5px] font-medium text-ink3 transition-colors duration-[180ms] hover:bg-s2 hover:text-ink">
              <Icon name="arrowUR" size={17} />
              Back to site
            </Link>
            {user && (
              <div className="mt-2 flex items-center gap-2.5 rounded-2xl bg-s2 p-2.5">
                <span aria-hidden="true" className="grid size-9 shrink-0 place-items-center rounded-full bg-acc-bg text-[13px] font-bold text-acc">
                  {(user.firstName?.[0] ?? user.email?.[0] ?? '?').toUpperCase()}
                </span>
                <span className="grid min-w-0 flex-1 leading-tight">
                  <b className="truncate text-[13.5px] font-semibold text-ink">{[user.firstName, user.lastName].filter(Boolean).join(' ') || user.email}</b>
                  <small className="truncate text-[12px] text-ink3">{user.email}</small>
                </span>
                <button
                  type="button"
                  onClick={() => void logout()}
                  aria-label="Sign out"
                  title="Sign out"
                  className="grid size-9 shrink-0 place-items-center rounded-xl text-ink3 hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
                >
                  <Icon name="logout" size={16} />
                </button>
              </div>
            )}
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar. The padding keeps the bar clear of the notch of a
              phone, so the title is never under the camera. */}
          <header data-print-hide="" className="sticky top-0 z-20 flex items-center gap-3 border-b border-line bg-bg/85 px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] backdrop-blur-md sm:px-6">
            {/* The mark of the site is a link on a phone, so it is given the
                room a finger needs, without changing the size of the mark. */}
            <Link
              to="/"
              className="-m-2 flex size-11 shrink-0 items-center justify-center rounded-xl lg:hidden"
              aria-label="Blipmade home"
            >
              <img src={logo} alt="" width={164} height={148} className="h-6 w-auto" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[19px] font-semibold tracking-[-0.04em] text-ink sm:text-[22px]">{title}</h1>
              {subtitle && <p className="truncate text-[13px] text-ink3">{subtitle}</p>}
            </div>
            {/* The action of the bar is a touch target on a phone, so it
                grows to 44px there and keeps its dense look on a desktop. */}
            <div className="flex shrink-0 items-center gap-2 [&_a]:min-h-11 lg:[&_a]:min-h-0">{actions}</div>
            {/* The bell of the notifications, with the number of the
                messages that wait to be read. */}
            {inCustomerArea && <NotificationBell />}
          </header>

          {/* The phone tab bar is 71px tall plus the safe area of the phone
              (34px on a home-indicator device), so the page reserves 8rem at
              the bottom: the last row of a table is never hidden. The reserve
              is on the footer, because the footer is the last thing on the
              page. */}
          <main className="px-4 pb-8 pt-2 sm:px-6 lg:pb-10">{children}</main>
          {/* The legal links are on every page of the app, so the terms
              are never further than one click away. */}
          <footer data-print-hide="" className="px-4 pb-32 pt-6 sm:px-6 lg:pb-10">
            <LegalFooter />
          </footer>
        </div>
      </div>

      {/* Phone bottom bar: a floating pill, so the page keeps its width and the
          thumb has one place to go. The main action is the round button. */}
      <nav
        aria-label="Primary"
        data-bottom-nav=""
        data-print-hide=""
        className={cn(
          'fixed inset-x-2.5 bottom-[max(10px,env(safe-area-inset-bottom))] z-30 flex h-[66px] items-center justify-between rounded-full border border-line bg-s1/95 p-1.5 backdrop-blur-md transition-transform duration-200 lg:hidden',
          keyboardOpen && 'pointer-events-none translate-y-[200%]',
        )}
      >
        {tabs.map((entry) => {
          const active = isActive(entry);
          if (entry.primary) {
            return (
              <Link
                key={entry.to}
                to={entry.to}
                aria-label={entry.label}
                aria-current={active ? 'page' : undefined}
                className="grid h-[54px] w-[58px] shrink-0 place-items-center rounded-full bg-acc text-on-acc transition-transform duration-150 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
              >
                <Icon name={entry.icon} size={23} />
              </Link>
            );
          }
          return (
            <Link
              key={entry.to}
              to={entry.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                'flex h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] font-semibold transition-[color,background,transform] duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h',
                active ? 'bg-s3 text-ink' : 'text-ink3',
              )}
            >
              <Icon name={entry.icon} size={21} className={active ? 'text-acc' : undefined} />
              <span className="max-w-full truncate px-1">{entry.shortLabel ?? entry.label}</span>
            </Link>
          );
        })}
        {rest.length > 0 && (
          <button
            ref={moreButton}
            type="button"
            aria-expanded={moreOpen}
            aria-haspopup="dialog"
            aria-controls="phone-more-sheet"
            onClick={() => setMoreOpen((open) => !open)}
            className={cn(
              'flex h-[54px] min-w-0 flex-1 flex-col items-center justify-center gap-[3px] rounded-full text-[10.5px] font-semibold transition-[color,background,transform] duration-200 active:scale-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h',
              moreOpen || restActive ? 'bg-s3 text-ink' : 'text-ink3',
            )}
          >
            <Icon name="menu" size={21} className={moreOpen || restActive ? 'text-acc' : undefined} />
            More
          </button>
        )}
      </nav>

      {/* The sheet with every page: a bottom sheet with a handle, the pages as
          tiles, and the account at the foot. */}
      {rest.length > 0 && moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div className="sheet-backdrop absolute inset-0 bg-black/70" onClick={closeMore} aria-hidden="true" />
          <div
            ref={sheet}
            id="phone-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="All pages"
            className="sheet-panel absolute inset-x-0 bottom-0 flex max-h-[88dvh] flex-col rounded-t-[28px] border-t border-line bg-bg px-3 pt-2 pb-[max(14px,env(safe-area-inset-bottom))]"
          >
            <button type="button" onClick={closeMore} aria-label="Close" className="mx-auto mb-2 grid h-8 w-24 place-items-center rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
              <span aria-hidden="true" className="h-1.5 w-10 rounded-full bg-s3" />
            </button>
            <nav aria-label="All pages" className="min-h-0 overflow-y-auto overscroll-contain">
              <ul className="grid grid-cols-2 gap-2">
                {nav.map((entry) => {
                  const active = isActive(entry);
                  return (
                    <li key={entry.to}>
                      <Link
                        to={entry.to}
                        aria-current={active ? 'page' : undefined}
                        className={cn(
                          'grid min-h-[88px] content-between gap-3 rounded-2xl border p-3.5 text-[15px] font-semibold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h',
                          active ? 'border-acc/40 bg-acc-bg text-ink' : 'border-line bg-s1 text-ink2 active:bg-s2',
                        )}
                      >
                        <Icon name={entry.icon} size={22} className={active ? 'text-acc' : 'text-ink3'} />
                        {entry.label}
                      </Link>
                    </li>
                  );
                })}
              </ul>
            </nav>
            <div className="mt-3 flex items-center gap-3 rounded-2xl bg-s1 p-2.5">
              <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-full bg-acc-bg text-[14px] font-bold text-acc">
                {(user?.firstName?.[0] ?? user?.email?.[0] ?? '?').toUpperCase()}
              </span>
              <span className="grid min-w-0 flex-1 leading-tight">
                <b className="truncate text-[14.5px] font-semibold text-ink">{user ? [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email : 'Signed out'}</b>
                {user && <small className="truncate text-[12.5px] text-ink3">{user.email}</small>}
              </span>
              <Link to="/" className="grid h-10 shrink-0 place-items-center rounded-xl px-3 text-[13.5px] font-semibold text-ink2 hover:bg-s2">
                Site
              </Link>
              {user && (
                <button type="button" onClick={() => void logout()} className="grid h-10 shrink-0 place-items-center rounded-xl border border-line px-3 text-[13.5px] font-semibold text-ink2 hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h">
                  Sign out
                </button>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

// --- surfaces -------------------------------------------------------------

export function Panel({
  title,
  description,
  action,
  children,
  className,
  tone,
  actionBelow,
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'accent';
  /**
   * Puts the action under the title on a phone, where the header row is too
   * narrow for a title and a button side by side.
   */
  actionBelow?: boolean;
}) {
  return (
    <section
      className={cn(
        'rounded-2xl border p-4 sm:p-5',
        tone === 'accent' ? 'border-acc/40 bg-acc-bg' : 'border-line bg-card',
        className,
      )}
    >
      {(title || action) && (
        <div
          className={cn(
            'mb-4 flex gap-3',
            actionBelow ? 'flex-col items-stretch sm:flex-row sm:items-start sm:justify-between' : 'items-start justify-between',
          )}
        >
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-semibold tracking-[-0.03em] text-ink">{title}</h2>}
            {description && <p className="mt-1 text-[13.5px] text-ink2">{description}</p>}
          </div>
          {action && (
            <div className={cn('shrink-0', actionBelow && '[&>*]:w-full sm:[&>*]:w-auto')}>{action}</div>
          )}
        </div>
      )}
      {children}
    </section>
  );
}

export function StatTile({ label, value, hint, icon }: { label: string; value: ReactNode; hint?: string; icon?: IconName }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-4 sm:p-5">
      {icon ? (
        <div className="flex items-center gap-2.5 text-ink3">
          <span aria-hidden="true" className="grid size-8 place-items-center rounded-xl bg-s2 text-acc">
            <Icon name={icon} size={15} />
          </span>
          <p className="text-[13.5px] font-medium">{label}</p>
        </div>
      ) : (
        <p className="text-[13.5px] font-medium text-ink3">{label}</p>
      )}
      <p className="mt-3 break-words font-mono text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-2 text-[12.5px] text-ink3">{hint}</p>}
    </div>
  );
}

export function ListRow({
  title,
  meta,
  right,
  children,
  to,
}: {
  title: ReactNode;
  meta?: ReactNode;
  right?: ReactNode;
  children?: ReactNode;
  to?: string;
}) {
  const inner = (
    <>
      {/* The text of the row may be cut, so the row asks for the width of the
          screen and not for the width of the phrase. `w-0` with `flex-1`
          keeps the text in the room that is left and takes the phrase out of
          the measurement of the page. */}
      <div className="w-0 min-w-0 flex-1">
        <p className="truncate text-[15.5px] font-medium tracking-[-0.02em] text-ink">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[13px] text-ink3">{meta}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-3.5 transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
      >
        {inner}
      </Link>
    );
  }
  // The row may shrink below the width of its text, so a long text is cut and
  // never pushes the page sideways.
  return <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-3.5">{inner}</div>;
}

// --- four data states -----------------------------------------------------

export function Skeleton({ className }: { className?: string }) {
  return <div className={cn('h-4 rounded-full bg-s3', className)} aria-hidden="true" />;
}

export function LoadingBlock({ rows = 3, label = 'Loading' }: { rows?: number; label?: string }) {
  return (
    <div className="grid gap-2.5" role="status" aria-live="polite" aria-busy="true">
      <span className="sr-only">{label}</span>
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="rounded-2xl border border-line bg-card p-4">
          <Skeleton className="w-2/5" />
          <Skeleton className="mt-2.5 w-3/5" />
        </div>
      ))}
    </div>
  );
}

export function EmptyState({
  title,
  description,
  action,
}: {
  title: string;
  description?: string;
  action?: ReactNode;
}) {
  return (
    // One short line of what is missing, one action, and the facts that help.
    // The action fills the width of a phone, so it is within reach of a thumb.
    <div className="rounded-2xl border border-line bg-card px-4 py-6 text-center sm:px-5 sm:py-8">
      <p className="break-words text-[16px] font-semibold tracking-[-0.02em] text-ink">{title}</p>
      {description && (
        <p className="mx-auto mt-1.5 max-w-[38ch] break-words text-[14px] leading-relaxed text-ink2">{description}</p>
      )}
      {action && <div className="mt-4 flex justify-center [&>*]:w-full sm:[&>*]:w-auto">{action}</div>}
    </div>
  );
}

export function ErrorState({
  title = 'Something went wrong',
  message,
  requestId,
  onRetry,
}: {
  title?: string;
  message?: string;
  requestId?: string;
  onRetry?: () => void;
}) {
  return (
    <div role="alert" className="rounded-2xl border border-bad/40 bg-bad/10 px-5 py-6">
      <p className="break-words text-[15px] font-semibold text-bad">{title}</p>
      {message && <p className="mt-1.5 break-words text-[14px] leading-relaxed text-ink2">{message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            // Full width on a phone, so the retry is within reach of a thumb.
            className="h-11 w-full max-w-full whitespace-normal rounded-xl border border-line bg-card px-4 text-center text-[13.5px] font-medium text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:w-auto"
          >
            Retry
          </button>
        )}
        {requestId && <span className="break-all font-mono text-[11.5px] text-ink3">request {requestId}</span>}
      </div>
    </div>
  );
}

// --- status ---------------------------------------------------------------

const STATUS_TONE: Record<string, string> = {
  online: 'bg-acc/12 text-acc',
  active: 'bg-acc/12 text-acc',
  paid: 'bg-acc/12 text-acc',
  succeeded: 'bg-acc/12 text-acc',
  fulfilled: 'bg-acc/12 text-acc',
  resolved: 'bg-acc/12 text-acc',
  closed: 'bg-acc/12 text-acc',
  provisioning: 'bg-warn/12 text-warn',
  pending: 'bg-warn/12 text-warn',
  deploying: 'bg-warn/12 text-warn',
  restarting: 'bg-warn/12 text-warn',
  // The container is coming up: it is not broken yet, so it is drawn like
  // the other states that are not settled.
  starting: 'bg-warn/12 text-warn',
  degraded: 'bg-warn/12 text-warn',
  awaiting_customer: 'bg-warn/12 text-warn',
  awaiting_staff: 'bg-warn/12 text-warn',
  on_hold: 'bg-warn/12 text-warn',
  incomplete: 'bg-warn/12 text-warn',
  past_due: 'bg-warn/12 text-warn',
  trialing: 'bg-warn/12 text-warn',
  stopped: 'bg-s3 text-ink2',
  cancelled: 'bg-s3 text-ink2',
  suspended: 'bg-s3 text-ink2',
  draft: 'bg-s3 text-ink2',
  open: 'bg-s3 text-ink2',
  void: 'bg-s3 text-ink2',
  failed: 'bg-bad/12 text-bad',
  error: 'bg-bad/12 text-bad',
  refunded: 'bg-bad/12 text-bad',
  // The account is confirmed and the session of this device is the current
  // one: both are good news, so both are drawn in the accent.
  verified: 'bg-acc/12 text-acc',
  current: 'bg-acc/12 text-acc',
  // A state that has no colour of its own: the product cannot be ordered
  // yet, and the reason is written under it.
  unavailable: 'bg-s3 text-ink2',
  neutral: 'bg-s3 text-ink2',
};

export function StatusPill({ status, label }: { status: string; label?: string }) {
  const key = status.toLowerCase();
  const text = label ?? status.replace(/_/g, ' ');
  return (
    <span
      className={cn(
        // A long status wraps inside the pill instead of stretching the row.
        'inline-flex max-w-full items-center gap-1.5 rounded-full px-2.5 py-1 text-[12px] font-bold capitalize',
        STATUS_TONE[key] ?? 'bg-s3 text-ink2',
      )}
    >
      <span className="min-w-0 break-words">{text}</span>
    </span>
  );
}

// --- money ----------------------------------------------------------------

export function Money({ amount, currency = 'EUR', period }: { amount: number; currency?: string; period?: string }) {
  const formatted = useMemo(
    () => new Intl.NumberFormat('en-IE', { style: 'currency', currency }).format(amount / 100),
    [amount, currency],
  );
  return (
    <span className="font-mono tabular-nums">
      {formatted}
      {period && <span className="text-[0.75em] text-ink3"> / {period}</span>}
    </span>
  );
}

// --- forms ----------------------------------------------------------------

/** Props the shared fields hand to the control they wrap. */
interface ControlProps {
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
}

export function Field({
  label,
  hint,
  error,
  htmlFor,
  children,
  className,
}: {
  label: string;
  hint?: string;
  error?: string;
  htmlFor?: string;
  children: ReactNode;
  className?: string;
}) {
  const id = useId();
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const describedBy = [hint ? hintId : null, error ? errorId : null].filter(Boolean).join(' ') || undefined;

  // The control describes itself, so the hint and the error are wired into it
  // with aria-describedby and the error is announced.
  let control = children;
  if (isValidElement<ControlProps>(children)) {
    const own = children.props['aria-describedby'];
    const extra: Partial<ControlProps> = {
      'aria-describedby': [own, describedBy].filter(Boolean).join(' ') || undefined,
    };
    if (error) extra['aria-invalid'] = true;
    control = cloneElement(children, extra);
  }

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="px-1 text-[14px] font-medium text-ink">
        {label}
      </label>
      {control}
      {error && (
        <p id={errorId} role="alert" className="px-1 text-[12.5px] font-medium text-bad">
          {error}
        </p>
      )}
      {hint && (
        <p id={hintId} className="px-1 text-[12.5px] text-ink3">
          {hint}
        </p>
      )}
    </div>
  );
}

/**
 * The shared field look.
 *
 * The focus indicator is the ring of the control itself, in the shape of the
 * control: the outline is switched off, so there is exactly one indicator.
 * `--bm-field-bg` carries the colour of the container in the current state,
 * so the paint of the browser's autofill matches an empty field.
 */
const fieldBase =
  'w-full rounded-xl border border-line bg-card text-ink outline-none transition-[border-color,box-shadow] duration-[180ms] placeholder:text-ink3 ' +
  '[--bm-field-bg:var(--color-card)] focus:border-acc focus:[--bm-field-bg:var(--color-card)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc/40 ' +
  'disabled:cursor-not-allowed disabled:bg-s1 disabled:text-ink3 disabled:opacity-70 ' +
  'read-only:cursor-default read-only:bg-s1 read-only:text-ink2 read-only:focus:border-line read-only:focus:bg-s1';

/** The error ring keeps its colour when the field is focused, so the two never fight. */
const errorRing = 'border-bad focus-visible:ring-bad/40';

const inputBase = cn(fieldBase, 'h-12 px-4 text-[15px]');
const areaBase = cn(fieldBase, 'rounded-xl p-4 text-[15px] leading-relaxed');
const selectBase = cn(fieldBase, 'h-12 appearance-none pl-4 pr-10 text-[15px]');

/** The chevron of the dropdown, drawn with the icon font and not with a picture. */
const selectChevron = "pointer-events-none absolute right-4 top-1/2 -translate-y-1/2 text-ink3";

export function TextInput({
  label,
  hint,
  error,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <input
        {...props}
        id={inputId}
        className={cn(inputBase, error && errorRing, props.className)}
      />
    </Field>
  );
}

/**
 * A field with its button on the same line.
 *
 * The label sits above the row and the hint or the error sits below it, so the
 * input and the button share one line and stay level whatever the hint says.
 */
export function InputWithButton({
  label,
  hint,
  error,
  button,
  ...props
}: React.InputHTMLAttributes<HTMLInputElement> & { label: string; hint?: string; error?: string; button: ReactNode }) {
  const id = useId();
  const inputId = props.id ?? id;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={inputId}>
      <div className="flex flex-col gap-2 sm:flex-row sm:items-stretch">
        <input {...props} id={inputId} className={cn(inputBase, error && errorRing, 'sm:min-w-0 sm:flex-1', props.className)} />
        <div className="flex sm:shrink-0 [&>*]:w-full sm:[&>*]:w-auto">{button}</div>
      </div>
    </Field>
  );
}

export function TextArea({
  label,
  hint,
  error,
  ...props
}: React.TextareaHTMLAttributes<HTMLTextAreaElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const areaId = props.id ?? id;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={areaId}>
      <textarea
        {...props}
        id={areaId}
        className={cn(areaBase, error && errorRing, props.className)}
      />
    </Field>
  );
}

export function Select({
  label,
  hint,
  error,
  children,
  ...props
}: React.SelectHTMLAttributes<HTMLSelectElement> & { label: string; hint?: string; error?: string }) {
  const id = useId();
  const selectId = props.id ?? id;
  return (
    <Field label={label} hint={hint} error={error} htmlFor={selectId}>
      <div className="relative">
        <select
          {...props}
          id={selectId}
          className={cn(selectBase, error && errorRing, props.className)}
        >
          {children}
        </select>
        <Icon name="chevronDown" size={16} className={selectChevron} />
      </div>
    </Field>
  );
}

/**
 * The three steps of a button, written once.
 *
 * A button that acts is a `<button>` and a button that navigates is an
 * `<a>`. Both carry the same classes, so the step of an action never
 * changes because the action navigates.
 */
export type ButtonVariant = 'primary' | 'soft' | 'danger';

const primaryButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl bg-acc px-5 text-[14.5px] font-semibold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50';

const softButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-card px-5 text-[14.5px] font-semibold text-ink transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50';

/**
 * The same step of the secondary button, on a raised surface.
 *
 * A button on a raised row (`bg-s3`) needs a surface of its own to stay
 * visible, so it sinks one level (`bg-s1`).
 */
const sunkenSoftButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-line bg-s1 px-5 text-[14.5px] font-semibold text-ink transition-colors duration-[180ms] hover:border-acc/50 hover:bg-s2 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50';

const dangerButtonClass =
  'inline-flex h-11 items-center justify-center gap-2 rounded-xl border border-bad/40 bg-bad/10 px-5 text-[14.5px] font-semibold text-bad transition-colors duration-[180ms] hover:bg-bad/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50';

const buttonClass: Record<ButtonVariant, string> = {
  primary: primaryButtonClass,
  soft: softButtonClass,
  danger: dangerButtonClass,
};

export function PrimaryButton({
  children,
  ...props
}: React.ComponentProps<'button'> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(primaryButtonClass, props.className)}
    >
      {children}
    </button>
  );
}

export function SoftButton({
  children,
  surface = 's3',
  ...props
}: React.ComponentProps<'button'> & { children: ReactNode; surface?: 's3' | 's1' }) {
  return (
    <button
      {...props}
      className={cn(surface === 's1' ? sunkenSoftButtonClass : softButtonClass, props.className)}
    >
      {children}
    </button>
  );
}

export function DangerButton({
  children,
  ...props
}: React.ComponentProps<'button'> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(dangerButtonClass, props.className)}
    >
      {children}
    </button>
  );
}

/**
 * A link that looks like a button.
 *
 * The three steps of a button are the same for an action and for a link
 * that navigates: the size, the shape and the colour come from the same
 * classes, so an action keeps its look on every screen.
 *
 * `to` is a route of this site and keeps the router of the application.
 * `href` is an address outside of it and is a plain link. Exactly one of
 * the two is given.
 */
export function ButtonLink({
  to,
  href,
  variant = 'primary',
  children,
  className,
  ...rest
}: {
  /** A route of this site: the link keeps the router of the application. */
  to?: string;
  /** An address outside of this site: the link is a plain anchor. */
  href?: string;
  variant?: ButtonVariant;
  children: ReactNode;
  className?: string;
} & Omit<React.AnchorHTMLAttributes<HTMLAnchorElement>, 'href' | 'children' | 'className'>) {
  const classes = cn(buttonClass[variant], className);
  if (href) {
    return (
      <a href={href} className={classes} {...rest}>
        {children}
      </a>
    );
  }
  return (
    <Link to={to ?? ''} className={classes} {...rest}>
      {children}
    </Link>
  );
}

export function Segmented<T extends string>({
  options,
  value,
  onChange,
  ariaLabel,
  surface = 'bg',
  role = 'tablist',
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
  surface?: 'bg' | 's1';
  /**
   * A strip of tabs is a tablist. A strip that chooses a value inside a form
   * is a group of pressed buttons, and says so.
   */
  role?: 'tablist' | 'group';
}) {
  const isTabs = role === 'tablist';
  return (
    // On a narrow phone the segments stay in one row and the strip scrolls
    // sideways, with the edge fading out. On a wider screen the segments
    // wrap onto a second row, so no label is cut.
    <div role={role} aria-label={ariaLabel} className="relative min-w-0">
      <div className="flex min-w-0 gap-1.5 overflow-x-auto overscroll-x-contain bm-hide-scroll sm:flex-wrap sm:overflow-visible">
        {options.map((option) => (
          <button
            key={option.value}
            type="button"
            role={isTabs ? 'tab' : undefined}
            aria-selected={isTabs ? option.value === value : undefined}
            aria-pressed={isTabs ? undefined : option.value === value}
            onClick={() => onChange(option.value)}
            className={cn(
              'h-11 max-w-full shrink-0 whitespace-nowrap rounded-full border border-line px-3.5 text-[13.5px] font-medium transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4',
              option.value === value ? 'border-acc bg-acc text-on-acc' : 'bg-card text-ink2 hover:bg-s3 hover:text-ink',
            )}
          >
            {option.label}
          </button>
        ))}
      </div>
      <span
        aria-hidden="true"
        className={cn(
          'pointer-events-none absolute inset-y-0 right-0 w-10 bg-linear-to-l to-transparent sm:hidden',
          surface === 's1' ? 'from-s1' : 'from-bg',
        )}
      />
    </div>
  );
}

// --- toasts ---------------------------------------------------------------

interface ToastItem {
  id: number;
  message: string;
  tone: 'ok' | 'error';
}

const ToastCtx = createContext<{ push: (message: string, tone?: 'ok' | 'error') => void }>({ push: () => {} });
export const useToast = () => useContext(ToastCtx);

export function ToastProvider({ children }: { children: ReactNode }) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const seq = useRef(0);

  const push = useCallback((message: string, tone: 'ok' | 'error' = 'ok') => {
    const id = ++seq.current;
    setItems((list) => [...list, { id, message, tone }]);
    window.setTimeout(() => setItems((list) => list.filter((item) => item.id !== id)), 4500);
  }, []);

  const value = useMemo(() => ({ push }), [push]);

  return (
    <ToastCtx.Provider value={value}>
      {children}
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-28 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
        {items.map((item) => (
          <div
            key={item.id}
            role="status"
            className={cn(
              'pointer-events-auto max-w-[92vw] rounded-xl px-5 py-3 text-[14px] font-medium shadow-none',
              item.tone === 'ok' ? 'bg-acc text-on-acc' : 'bg-bad text-white',
            )}
          >
            {item.message}
          </div>
        ))}
      </div>
    </ToastCtx.Provider>
  );
}

// --- confirmation ---------------------------------------------------------

export function ConfirmDialog({
  open,
  title,
  description,
  confirmLabel,
  onConfirm,
  onCancel,
  busy,
  requireText,
}: {
  open: boolean;
  title: string;
  description?: string;
  confirmLabel: string;
  onConfirm: () => void;
  onCancel: () => void;
  busy?: boolean;
  /** When set, the user must type this exact value before confirming. */
  requireText?: string;
}) {
  const [typed, setTyped] = useState('');
  const panelRef = useRef<HTMLDivElement>(null);
  const titleId = useId();
  const openerRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      return;
    }
    // The control that opened the dialog keeps the focus, so it can be given
    // back when the dialog closes.
    openerRef.current = document.activeElement as HTMLElement | null;
    // The focus goes to the panel, so the dialog is announced and the action
    // is not focused before it can be used.
    panelRef.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCancel();
        return;
      }
      // The focus stays inside the dialog: Tab walks the actions of the
      // dialog and comes back to the first one.
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || active === panel)) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    addEventListener('keydown', onKey);
    return () => {
      removeEventListener('keydown', onKey);
      // The focus goes back to the control that opened the dialog.
      openerRef.current?.focus?.();
    };
  }, [open, onCancel]);

  // The page behind the dialog must not scroll.
  useEffect(() => {
    if (!open) return;
    const body = document.body;
    const previous = body.style.overflow;
    body.style.overflow = 'hidden';
    return () => {
      body.style.overflow = previous;
    };
  }, [open]);

  if (!open) return null;

  const blocked = Boolean(requireText) && typed.trim() !== requireText;

  return (
    <div
      className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] sm:items-center sm:p-3"
      role="dialog"
      aria-modal="true"
      aria-labelledby={titleId}
    >
      <div
        ref={panelRef}
        tabIndex={-1}
        // The dialog fits the screen: the body scrolls, the actions stay.
        className="flex max-h-[calc(100svh-1.5rem)] w-full max-w-[440px] flex-col rounded-2xl border border-line bg-card p-5 focus:outline-none"
      >
        <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <div className="mt-2 min-h-0 flex-1 overflow-y-auto overscroll-contain">
          {description && <p className="text-[14.5px] leading-relaxed text-ink2">{description}</p>}
          {requireText && (
            <div className="mt-4">
              <TextInput label={`Type ${requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
            </div>
          )}
        </div>
        <div className="mt-5 flex shrink-0 flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SoftButton onClick={onCancel} disabled={busy} className="w-full sm:w-auto">
            Cancel
          </SoftButton>
          <button
            type="button"
            onClick={onConfirm}
            disabled={busy || blocked}
            className="inline-flex h-11 w-full max-w-full items-center justify-center gap-2 rounded-xl bg-bad px-5 text-[14.5px] font-semibold text-white transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
          >
            {busy ? 'Working…' : confirmLabel}
          </button>
        </div>
      </div>
    </div>
  );
}

// --- data table -----------------------------------------------------------

export function DataTable<T>({
  columns,
  rows,
  rowKey,
  empty,
  minWidth = '640px',
}: {
  columns: TableColumn<T>[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
  /** The smallest width of the table. Below it the table scrolls sideways. */
  minWidth?: string;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  return (
    // A wide table scrolls inside its own box: the page never scrolls
    // sideways. The strip is marked, so the scrollbar of the design system
    // stays out of the way.
    <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain bm-hide-scroll md:block">
      <table
        className="w-full border-separate text-left"
        // The rows are separated by a gap, like the cards of the design. The
        // horizontal spacing stays at zero, so the columns of the header and
        // the columns of the rows are the same columns.
        style={{ borderSpacing: '0 6px', minWidth }}
      >
        {/* The widths of the columns are decided once, here, and the header
            and the rows use the same ones. */}
        <colgroup>
          {columns.map((column) => (
            <col key={column.key} style={column.width ? { width: column.width } : undefined} />
          ))}
        </colgroup>
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className={headerClass(column)}>
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={rowKey(row)}>
              {columns.map((column, index) => (
                <td key={column.key} className={cellClass(column, index, columns.length)}>
                  {column.render(row)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  );
}

/** Phone rendering of the same data as {@link DataTable}. */
export function CardList<T>({ rows, rowKey, children }: { rows: T[]; rowKey: (row: T) => string; children: (row: T) => ReactNode }) {
  if (!rows.length) return null;
  return (
    // The column of the cards may be smaller than a long text inside a card,
    // so the cards never make the page wider than the screen.
    <div className="grid grid-cols-[minmax(0,1fr)] gap-1.5 md:hidden">
      {rows.map((row) => (
        <div key={rowKey(row)} className="rounded-2xl border border-line bg-card p-3.5">
          {children(row)}
        </div>
      ))}
    </div>
  );
}

// --- notifications --------------------------------------------------------

/**
 * The bell of the header.
 *
 * The number of the messages that wait to be read is read on the server and
 * it is kept up to date with the stream of the server, so two sessions of
 * the same account always show the same number. Nothing of it is kept in
 * the storage of the browser: the state of the notification centre belongs
 * to the server.
 *
 * The stream is the fast way of knowing the number. When the browser does
 * not have it, or when the stream breaks, a slow poll takes over.
 */
export function NotificationBell({ to = '/app/notifications', limit = 5 }: { to?: string; limit?: number }) {
  const { path, navigate } = useRouter();
  const [unread, setUnread] = useState(0);
  const [open, setOpen] = useState(false);
  const [items, setItems] = useState<NotificationView[]>([]);
  const [loading, setLoading] = useState(false);
  const button = useRef<HTMLButtonElement>(null);
  const panel = useRef<HTMLDivElement>(null);
  const count = useRef(0);
  const opened = useRef(false);
  const showing = useRef(false);

  /** The last messages of the customer, for the menu of the bell. */
  const readRecent = useCallback(async () => {
    try {
      const result = await get<{ notifications: NotificationView[] }>('/notifications', { limit });
      setItems(result.notifications);
    } catch {
      // The server cannot be reached: the menu keeps the messages it has.
    }
  }, [limit]);

  /**
   * The number is only written when it changes.
   *
   * A stream that repeats the same number does not move anything on the
   * screen, and the bell does not become noisy.
   */
  const applyCount = useCallback(
    (next: number) => {
      if (count.current === next) return;
      count.current = next;
      setUnread(next);
      // The menu is read again, so it shows the messages of the number.
      if (showing.current) void readRecent();
    },
    [readRecent],
  );

  useEffect(() => {
    let stopped = false;
    let timer = 0;
    let source: EventSource | null = null;

    const poll = async () => {
      try {
        const result = await get<{ unread: number }>('/notifications/unread-count');
        if (!stopped) applyCount(result.unread);
      } catch {
        // The server cannot be reached: the number on the screen stays the
        // last one the server gave.
      }
    };

    const startPolling = () => {
      if (timer) return;
      timer = window.setInterval(() => void poll(), 60000);
    };

    void poll();

    if (typeof EventSource !== 'undefined') {
      try {
        source = new EventSource('/api/notifications/stream', { withCredentials: true });
        source.addEventListener('unread', (event) => {
          const data = JSON.parse((event as MessageEvent<string>).data) as { unread?: number };
          if (typeof data.unread === 'number') applyCount(data.unread);
        });
        // The stream is broken: the slow poll takes over.
        source.onerror = () => {
          source?.close();
          source = null;
          startPolling();
        };
      } catch {
        startPolling();
      }
    } else {
      startPolling();
    }

    return () => {
      stopped = true;
      source?.close();
      if (timer) window.clearInterval(timer);
    };
  }, [applyCount]);

  // A new page closes the menu.
  useEffect(() => {
    showing.current = false;
    setOpen(false);
  }, [path]);

  // The menu closes with Escape and when the customer clicks outside of it.
  useEffect(() => {
    if (!open) return;
    const onKey = (event: KeyboardEvent) => {
      if (event.key !== 'Escape') return;
      showing.current = false;
      setOpen(false);
      button.current?.focus();
    };
    const onPointer = (event: MouseEvent) => {
      const target = event.target as Node;
      if (panel.current?.contains(target) || button.current?.contains(target)) return;
      showing.current = false;
      setOpen(false);
    };
    document.addEventListener('keydown', onKey);
    document.addEventListener('click', onPointer);
    return () => {
      document.removeEventListener('keydown', onKey);
      document.removeEventListener('click', onPointer);
    };
  }, [open]);

  /** Opens the page a message leads to, and marks the message as read. */
  const openItem = (item: NotificationView) => {
    showing.current = false;
    setOpen(false);
    if (!item.readAt) {
      setItems((current) => current.map((entry) => (entry.id === item.id ? { ...entry, readAt: new Date().toISOString() } : entry)));
      count.current = Math.max(0, count.current - 1);
      setUnread(count.current);
      void post(`/notifications/${encodeURIComponent(item.id)}/read`).catch(() => undefined);
    }
    navigate(item.actionUrl && item.actionUrl.startsWith('/') ? item.actionUrl : to);
  };

  const toggle = () => {
    const next = !showing.current;
    showing.current = next;
    setOpen(next);
    if (next && !opened.current) {
      opened.current = true;
      setLoading(true);
      void readRecent().finally(() => setLoading(false));
    }
  };

  return (
    <div className="relative shrink-0">
      <NotificationBellButton unread={unread} open={open} onToggle={toggle} buttonRef={button} />
      {open && (
        <NotificationBellPanel items={items} loading={loading} to={to} panelRef={panel} onOpenItem={openItem} />
      )}
    </div>
  );
}

/**
 * The button of the bell, with the number of the messages that wait to be
 * read.
 *
 * The number is a badge on the bell and it is hidden when it is zero. The
 * name of the button says how many messages wait, so the number is told
 * without the badge being seen.
 */
export function NotificationBellButton({
  unread,
  open,
  onToggle,
  buttonRef,
}: {
  unread: number;
  open: boolean;
  onToggle: () => void;
  buttonRef?: RefObject<HTMLButtonElement | null>;
}) {
  return (
    <button
      ref={buttonRef}
      type="button"
      onClick={onToggle}
      aria-expanded={open}
      aria-controls="notification-menu"
      aria-label={
        unread > 0
          ? `Notifications, ${unread} unread message${unread === 1 ? '' : 's'}`
          : 'Notifications, no unread message'
      }
      className="relative grid size-11 place-items-center rounded-full text-ink2 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
    >
      <Icon name="bell" size={20} />
      {unread > 0 ? (
        <span
          data-unread-badge="true"
          className="absolute -right-0.5 -top-0.5 min-w-5 rounded-full bg-acc px-1 text-center font-mono text-[11px] font-bold leading-5 text-on-acc"
        >
          {unread > 99 ? '99+' : unread}
        </span>
      ) : null}
    </button>
  );
}

/**
 * The menu of the bell: the last messages and the way to the page of the
 * notification centre.
 */
export function NotificationBellPanel({
  items,
  loading,
  to,
  panelRef,
  onOpenItem,
}: {
  items: NotificationView[];
  loading: boolean;
  to: string;
  panelRef?: RefObject<HTMLDivElement | null>;
  /** Opens one message: its page, and the message is marked as read. */
  onOpenItem?: (item: NotificationView) => void;
}) {
  return (
    <div
      ref={panelRef}
      id="notification-menu"
      className="absolute right-0 top-full z-30 mt-2 w-[min(21rem,calc(100vw-2rem))] rounded-2xl bg-s1 p-3"
    >
      <p className="mb-2 px-1 text-[13.5px] font-medium text-ink">Notifications</p>

      {loading ? (
        <p className="px-1 text-[13px] text-ink3" role="status">
          Loading your notifications…
        </p>
      ) : items.length === 0 ? (
        <p className="px-1 text-[13px] text-ink3">You have no notification yet.</p>
      ) : (
        <ul className="grid gap-1">
          {items.map((item) => (
            <li key={item.id}>
              <button
                type="button"
                onClick={() => onOpenItem?.(item)}
                className="block w-full rounded-2xl bg-s2 p-3 text-left transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <p className="flex items-center gap-2 text-[13.5px] font-medium text-ink">
                  {item.readAt ? null : <span aria-hidden="true" className="size-2 shrink-0 rounded-full bg-acc" />}
                  <span className="min-w-0 break-words">{item.title}</span>
                </p>
                <p className="mt-0.5 text-[12px] text-ink3">{relativeTime(item.createdAt)}</p>
              </button>
            </li>
          ))}
        </ul>
      )}

      <Link
        to={to}
        className="mt-2 block rounded-xl border border-line bg-card px-4 py-2.5 text-center text-[13.5px] font-medium text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        Open the notification centre
      </Link>
    </div>
  );
}


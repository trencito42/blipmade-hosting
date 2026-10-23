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
  type CSSProperties,
  type ReactNode,
} from 'react';
import { cn } from './lib';
import { Icon, type IconName } from './icons';
import { Link, useRouter } from './router';
import logo from './logo.svg';

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

  const tabs = phoneTabs ?? nav.slice(0, 4);
  const keyboardOpen = useSoftwareKeyboard();

  // The phone bar shows four entries. The rest of the navigation has to stay
  // reachable, so it opens in a sheet from the fifth cell.
  const [moreOpen, setMoreOpen] = useState(false);
  const moreButton = useRef<HTMLButtonElement>(null);
  const sheet = useRef<HTMLDivElement>(null);
  const rest = useMemo(() => nav.filter((entry) => !tabs.includes(entry)), [nav, tabs]);
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
        <aside className="sticky top-0 hidden h-[100svh] w-[272px] shrink-0 flex-col bg-s1 p-4 lg:flex">
          <Link to="/" className="mb-6 flex items-center gap-2.5 rounded-full px-2 py-1 text-[21px] font-extrabold tracking-[-0.055em] outline-none focus-visible:ring-2 focus-visible:ring-acc">
            <img src={logo} alt="" className="h-6 w-auto" />
            blipmade
          </Link>
          <nav aria-label="Main" className="grid gap-1">
            {nav.map((entry) => (
              <Link
                key={entry.to}
                to={entry.to}
                aria-current={isActive(entry) ? 'page' : undefined}
                className={cn(
                  'flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                  isActive(entry) ? 'bg-s2 text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
                )}
              >
                <Icon name={entry.icon} size={18} className={isActive(entry) ? 'text-acc' : 'text-ink3'} />
                {entry.label}
              </Link>
            ))}
          </nav>
          <div className="mt-auto">
            {environment && (
              <p className="mb-2 rounded-full bg-s3 px-3 py-1.5 text-center font-mono text-[11.5px] uppercase tracking-[0.12em] text-ink2">
                {environment}
              </p>
            )}
            <Link to="/" className="flex h-11 items-center gap-3 rounded-2xl px-3 text-[14.5px] font-bold text-ink3 transition-colors duration-[180ms] hover:bg-s2 hover:text-ink">
              <Icon name="arrowUR" size={17} />
              Back to site
            </Link>
          </div>
        </aside>

        <div className="min-w-0 flex-1">
          {/* Top bar. The padding keeps the bar clear of the notch of a
              phone, so the title is never under the camera. */}
          <header className="sticky top-0 z-20 flex items-center gap-3 bg-bg px-4 pb-3 pt-[max(0.75rem,env(safe-area-inset-top))] sm:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="Blipmade home">
              <img src={logo} alt="" className="h-6 w-auto" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[19px] font-extrabold tracking-[-0.04em] text-ink sm:text-[22px]">{title}</h1>
              {subtitle && <p className="truncate text-[13px] text-ink3">{subtitle}</p>}
            </div>
            {/* The action of the bar is a touch target on a phone, so it
                grows to 44px there and keeps its dense look on a desktop. */}
            <div className="flex shrink-0 items-center gap-2 [&_a]:min-h-11 lg:[&_a]:min-h-0">{actions}</div>
          </header>

          {/* The phone tab bar is 71px tall plus the safe area of the phone
              (34px on a home-indicator device), so the page reserves 8rem
              under the content: the last row of a table is never hidden. */}
          <main className="px-4 pb-32 pt-2 sm:px-6 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Phone bottom tabs */}
      <nav
        aria-label="Primary"
        data-bottom-nav=""
        className={cn(
          'fixed inset-x-0 bottom-0 z-30 grid bg-s1 px-1 pt-1.5 pb-[max(env(safe-area-inset-bottom),0.5rem)] transition-transform duration-200 lg:hidden',
          rest.length > 0 ? 'grid-cols-5' : 'grid-cols-4',
          keyboardOpen && 'pointer-events-none translate-y-full',
        )}
      >
        {tabs.map((entry) => {
          const active = isActive(entry);
          return (
            <Link
              key={entry.to}
              to={entry.to}
              aria-current={active ? 'page' : undefined}
              className={cn(
                // One cell of the grid is the whole touch target: 64px wide
                // at 320px and 56px tall, well over the 44px minimum.
                'relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-2xl px-1 py-1 text-[11.5px] font-bold leading-[13px] transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                active ? 'bg-s2 text-ink' : 'text-ink3',
              )}
            >
              {/* The bar marks the active tab without relying on colour. It
                  sits in the padding above the tab, like a tab indicator. */}
              {active && <span aria-hidden="true" className="absolute inset-x-4 -top-1.5 h-[3px] rounded-full bg-acc" />}
              <Icon name={entry.icon} size={20} className={active ? 'text-acc' : undefined} />
              {/* The label wraps onto a second line rather than being cut. */}
              <span className="flex min-h-[26px] min-w-0 max-w-full items-center justify-center break-words text-center">
                {entry.shortLabel ?? entry.label}
              </span>
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
              'relative flex min-h-[56px] min-w-0 flex-col items-center justify-center gap-[3px] rounded-2xl px-1 py-1 text-[11.5px] font-bold leading-[13px] transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
              moreOpen || restActive ? 'bg-s2 text-ink' : 'text-ink3',
            )}
          >
            {(moreOpen || restActive) && <span aria-hidden="true" className="absolute inset-x-4 -top-1.5 h-[3px] rounded-full bg-acc" />}
            <Icon name="menu" size={20} className={moreOpen || restActive ? 'text-acc' : undefined} />
            <span className="flex min-h-[26px] min-w-0 max-w-full items-center justify-center break-words text-center">
              More
            </span>
          </button>
        )}
      </nav>

      {/* The sheet with the entries that do not fit in the bar. */}
      {rest.length > 0 && moreOpen && (
        <div className="fixed inset-0 z-40 lg:hidden">
          <div
            className="absolute inset-0 bg-bg/80"
            onClick={closeMore}
            aria-hidden="true"
          />
          <div
            ref={sheet}
            id="phone-more-sheet"
            role="dialog"
            aria-modal="true"
            aria-label="More pages"
            className="absolute inset-x-0 bottom-0 max-h-[86dvh] overflow-y-auto overscroll-contain rounded-t-[26px] bg-s1 p-4 pb-[max(1rem,env(safe-area-inset-bottom))]"
          >
            <div className="mb-3 flex items-center justify-between gap-3">
              <h2 className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">All pages</h2>
              <button
                type="button"
                onClick={closeMore}
                aria-label="Close"
                className="grid h-11 w-11 place-items-center rounded-full bg-s3 text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
              >
                <Icon name="close" size={18} />
              </button>
            </div>
            <nav aria-label="All pages" className="grid gap-1">
              {nav.map((entry) => {
                const active = isActive(entry);
                return (
                  <Link
                    key={entry.to}
                    to={entry.to}
                    aria-current={active ? 'page' : undefined}
                    className={cn(
                      'flex h-12 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc',
                      active ? 'bg-s2 text-ink' : 'text-ink2 hover:bg-s2 hover:text-ink',
                    )}
                  >
                    <Icon name={entry.icon} size={18} className={active ? 'text-acc' : 'text-ink3'} />
                    {entry.label}
                  </Link>
                );
              })}
            </nav>
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
    <section className={cn('rounded-[22px] p-4 sm:p-5', tone === 'accent' ? 'bg-acc-bg' : 'bg-s1', className)}>
      {(title || action) && (
        <div
          className={cn(
            'mb-4 flex gap-3',
            actionBelow ? 'flex-col items-stretch sm:flex-row sm:items-start' : 'items-start justify-between',
          )}
        >
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>}
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

export function StatTile({ label, value, hint }: { label: string; value: ReactNode; hint?: string }) {
  return (
    <div className="rounded-2xl bg-s2 p-4">
      <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{label}</p>
      <p className="mt-1 break-words font-mono text-[22px] font-semibold leading-tight tracking-[-0.03em] tabular-nums text-ink">{value}</p>
      {hint && <p className="mt-1 text-[12.5px] text-ink3">{hint}</p>}
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
      <div className="min-w-0 flex-1">
        <p className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink">{title}</p>
        {meta && <p className="mt-0.5 truncate text-[13px] text-ink3">{meta}</p>}
      </div>
      {right && <div className="shrink-0">{right}</div>}
    </>
  );
  if (to) {
    return (
      <Link
        to={to}
        className="flex min-w-0 items-center gap-3 rounded-2xl bg-s2 p-3.5 transition-colors duration-[180ms] hover:bg-s3 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
      >
        {inner}
      </Link>
    );
  }
  // The row may shrink below the width of its text, so a long text is cut and
  // never pushes the page sideways.
  return <div className="flex min-w-0 items-center gap-3 rounded-2xl bg-s2 p-3.5">{inner}</div>;
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
        <div key={i} className="rounded-2xl bg-s2 p-4">
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
    <div className="rounded-2xl bg-s2 px-4 py-6 text-center sm:px-5 sm:py-8">
      <p className="break-words text-[16px] font-extrabold tracking-[-0.02em] text-ink">{title}</p>
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
    <div role="alert" className="rounded-2xl bg-s2 px-5 py-6">
      <p className="break-words text-[15px] font-extrabold text-bad">{title}</p>
      {message && <p className="mt-1.5 break-words text-[14px] leading-relaxed text-ink2">{message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            // Full width on a phone, so the retry is within reach of a thumb.
            className="h-11 w-full max-w-full whitespace-normal rounded-full bg-s3 px-4 text-center text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:w-auto"
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
      {period && <span className="text-ink3"> / {period}</span>}
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
      <label htmlFor={htmlFor} className="px-1 text-[13.5px] font-bold text-ink">
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
  'w-full bg-s2 text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 ' +
  '[--bm-field-bg:var(--color-s2)] focus:bg-s3 focus:[--bm-field-bg:var(--color-s3)] ' +
  'focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ' +
  'disabled:cursor-not-allowed disabled:bg-s1 disabled:text-ink3 disabled:opacity-70 ' +
  'read-only:cursor-default read-only:bg-s1 read-only:text-ink2 read-only:focus:bg-s1';

/** The error ring keeps its colour when the field is focused, so the two never fight. */
const errorRing = 'ring-2 ring-bad focus-visible:outline-none focus-visible:ring-bad';

const inputBase = cn(fieldBase, 'h-14 rounded-full px-5 text-[16px] lg:text-[15px]');
const areaBase = cn(fieldBase, 'rounded-2xl p-4 text-[16px] leading-relaxed lg:text-[15px]');
const selectBase = cn(fieldBase, 'h-14 appearance-none rounded-full pl-5 pr-10 text-[16px] lg:text-[15px]');

/** Chevron of the dropdown, drawn in the muted ink. */
const selectChevron: CSSProperties = {
  backgroundImage:
    "url(\"data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 24 24' fill='none' stroke='%237b827b' stroke-width='2' stroke-linecap='round' stroke-linejoin='round'%3E%3Cpath d='m6 9 6 6 6-6'/%3E%3C/svg%3E\")",
  backgroundRepeat: 'no-repeat',
  backgroundPosition: 'right 1.1rem center',
  backgroundSize: '16px 16px',
};

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
      <select
        {...props}
        id={selectId}
        style={{ ...selectChevron, ...props.style }}
        className={cn(selectBase, error && errorRing, props.className)}
      >
        {children}
      </select>
    </Field>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ComponentProps<'button'> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
    >
      {children}
    </button>
  );
}

export function SoftButton({
  children,
  ...props
}: React.ComponentProps<'button'> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-s3 px-5 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
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
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-bad/12 px-5 text-[14.5px] font-bold text-bad transition-colors duration-[180ms] hover:bg-bad/20 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50',
        props.className,
      )}
    >
      {children}
    </button>
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
              'h-11 max-w-full shrink-0 whitespace-nowrap rounded-full px-3.5 text-[13.5px] font-bold transition-colors duration-[180ms] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc sm:px-4',
              option.value === value ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink',
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
              'pointer-events-auto max-w-[92vw] rounded-full px-5 py-3 text-[14px] font-bold shadow-none',
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
        className="flex max-h-[calc(100svh-1.5rem)] w-full max-w-[440px] flex-col rounded-[22px] bg-s1 p-5 focus:outline-none"
      >
        <h2 id={titleId} className="text-[18px] font-extrabold tracking-[-0.03em] text-ink">
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
            className="inline-flex h-11 w-full max-w-full items-center justify-center gap-2 rounded-full bg-bad px-5 text-[14.5px] font-bold text-white transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50 sm:w-auto"
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
}: {
  columns: { key: string; header: string; render: (row: T) => ReactNode; className?: string }[];
  rows: T[];
  rowKey: (row: T) => string;
  empty?: ReactNode;
}) {
  if (!rows.length) return <>{empty ?? <EmptyState title="Nothing here yet." />}</>;
  return (
    // A wide table scrolls inside its own box: the page never scrolls
    // sideways. The strip is marked, so the scrollbar of the design system
    // stays out of the way.
    <div className="hidden w-full min-w-0 max-w-full overflow-x-auto overscroll-x-contain bm-hide-scroll md:block">
      <table className="w-full border-collapse text-left">
        <thead>
          <tr>
            {columns.map((column) => (
              <th key={column.key} scope="col" className="px-3 py-2.5 font-mono text-[11px] uppercase tracking-[0.1em] text-ink3">
                {column.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="grid gap-1.5">
          {rows.map((row) => (
            <tr key={rowKey(row)} className="rounded-2xl bg-s2">
              {columns.map((column) => (
                <td key={column.key} className={cn('px-3 py-3 align-middle text-[14px] text-ink', column.className)}>
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
    <div className="grid gap-1.5 md:hidden">
      {rows.map((row) => (
        <div key={rowKey(row)} className="rounded-2xl bg-s2 p-3.5">
          {children(row)}
        </div>
      ))}
    </div>
  );
}

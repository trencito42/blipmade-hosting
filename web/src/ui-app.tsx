import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
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

export interface NavEntry {
  to: string;
  label: string;
  icon: IconName;
  /** Only match the exact path, used for the dashboard entry. */
  exact?: boolean;
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
                  'flex h-11 items-center gap-3 rounded-2xl px-3 text-[15px] font-bold transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc',
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
          {/* Top bar */}
          <header className="sticky top-0 z-20 flex items-center gap-3 bg-bg px-4 py-3 sm:px-6">
            <Link to="/" className="flex items-center gap-2 lg:hidden" aria-label="Blipmade home">
              <img src={logo} alt="" className="h-6 w-auto" />
            </Link>
            <div className="min-w-0 flex-1">
              <h1 className="truncate text-[19px] font-extrabold tracking-[-0.04em] text-ink sm:text-[22px]">{title}</h1>
              {subtitle && <p className="truncate text-[13px] text-ink3">{subtitle}</p>}
            </div>
            <div className="flex shrink-0 items-center gap-2">{actions}</div>
          </header>

          <main className="px-4 pb-28 pt-2 sm:px-6 lg:pb-10">{children}</main>
        </div>
      </div>

      {/* Phone bottom tabs */}
      <nav
        aria-label="Primary"
        className="fixed inset-x-0 bottom-0 z-30 grid grid-cols-4 border-t-0 bg-s1 px-2 pb-[max(0.5rem,env(safe-area-inset-bottom))] pt-2 lg:hidden"
      >
        {tabs.map((entry) => (
          <Link
            key={entry.to}
            to={entry.to}
            aria-current={isActive(entry) ? 'page' : undefined}
            className={cn(
              'flex min-h-[56px] flex-col items-center justify-center gap-1 rounded-2xl text-[11.5px] font-bold transition-colors duration-[180ms]',
              isActive(entry) ? 'text-acc' : 'text-ink3',
            )}
          >
            <Icon name={entry.icon} size={20} />
            {entry.label}
          </Link>
        ))}
      </nav>
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
}: {
  title?: string;
  description?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
  tone?: 'default' | 'accent';
}) {
  return (
    <section className={cn('rounded-[22px] p-4 sm:p-5', tone === 'accent' ? 'bg-acc-bg' : 'bg-s1', className)}>
      {(title || action) && (
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="min-w-0">
            {title && <h2 className="text-[17px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>}
            {description && <p className="mt-1 text-[13.5px] text-ink2">{description}</p>}
          </div>
          {action && <div className="shrink-0">{action}</div>}
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
      <p className="mt-1 font-mono text-[22px] font-semibold tracking-[-0.03em] tabular-nums text-ink">{value}</p>
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
      <Link to={to} className="flex items-center gap-3 rounded-2xl bg-s2 p-3.5 transition-colors duration-[180ms] hover:bg-s3 focus-visible:ring-2 focus-visible:ring-acc">
        {inner}
      </Link>
    );
  }
  return <div className="flex items-center gap-3 rounded-2xl bg-s2 p-3.5">{inner}</div>;
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
    <div className="rounded-2xl bg-s2 px-5 py-10 text-center">
      <p className="text-[16px] font-extrabold tracking-[-0.02em] text-ink">{title}</p>
      {description && <p className="mx-auto mt-1.5 max-w-[38ch] text-[14px] text-ink2">{description}</p>}
      {action && <div className="mt-4 flex justify-center">{action}</div>}
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
      <p className="text-[15px] font-extrabold text-bad">{title}</p>
      {message && <p className="mt-1.5 text-[14px] text-ink2">{message}</p>}
      <div className="mt-3 flex flex-wrap items-center gap-3">
        {onRetry && (
          <button
            type="button"
            onClick={onRetry}
            className="h-10 rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc"
          >
            Retry
          </button>
        )}
        {requestId && <span className="font-mono text-[11.5px] text-ink3">request {requestId}</span>}
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
        'inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-[12px] font-bold capitalize',
        STATUS_TONE[key] ?? 'bg-s3 text-ink2',
      )}
    >
      {text}
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
  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={htmlFor} className="px-1 text-[13.5px] font-bold text-ink">
        {label}
      </label>
      {children}
      {error ? (
        <p className="px-1 text-[12.5px] font-medium text-bad">{error}</p>
      ) : hint ? (
        <p className="px-1 text-[12.5px] text-ink3">{hint}</p>
      ) : null}
    </div>
  );
}

const inputBase =
  'h-14 w-full rounded-full bg-s2 px-5 text-[16px] text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3 lg:text-[15px]';

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
        aria-invalid={error ? true : undefined}
        className={cn(inputBase, error && 'ring-2 ring-bad', props.className)}
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
        aria-invalid={error ? true : undefined}
        className={cn('w-full rounded-2xl bg-s2 p-4 text-[16px] leading-relaxed text-ink outline-none transition-colors duration-[180ms] placeholder:text-ink3 focus:bg-s3 lg:text-[15px]', error && 'ring-2 ring-bad', props.className)}
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
        aria-invalid={error ? true : undefined}
        className={cn('h-14 w-full appearance-none rounded-full bg-s2 px-5 text-[16px] text-ink outline-none transition-colors duration-[180ms] focus:bg-s3 lg:text-[15px]', error && 'ring-2 ring-bad', props.className)}
      >
        {children}
      </select>
    </Field>
  );
}

export function PrimaryButton({
  children,
  ...props
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-s3 px-5 text-[14.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:ring-2 focus-visible:ring-acc focus-visible:ring-offset-2 focus-visible:ring-offset-bg active:scale-[0.97] disabled:cursor-not-allowed disabled:opacity-50',
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
}: React.ButtonHTMLAttributes<HTMLButtonElement> & { children: ReactNode }) {
  return (
    <button
      {...props}
      className={cn(
        'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-bad/12 px-5 text-[14.5px] font-bold text-bad transition-colors duration-[180ms] hover:bg-bad/20 focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50',
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
}: {
  options: { value: T; label: string }[];
  value: T;
  onChange: (value: T) => void;
  ariaLabel: string;
}) {
  return (
    <div role="tablist" aria-label={ariaLabel} className="flex gap-1.5 overflow-x-auto pb-1 bm-hide-scroll">
      {options.map((option) => (
        <button
          key={option.value}
          type="button"
          role="tab"
          aria-selected={option.value === value}
          onClick={() => onChange(option.value)}
          className={cn(
            'h-10 shrink-0 whitespace-nowrap rounded-full px-4 text-[13.5px] font-bold transition-colors duration-[180ms] focus-visible:ring-2 focus-visible:ring-acc',
            option.value === value ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink',
          )}
        >
          {option.label}
        </button>
      ))}
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
      <div aria-live="polite" aria-atomic="false" className="pointer-events-none fixed inset-x-0 bottom-20 z-50 flex flex-col items-center gap-2 px-4 lg:bottom-6">
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
  const ref = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    if (!open) {
      setTyped('');
      return;
    }
    ref.current?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') onCancel();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [open, onCancel]);

  if (!open) return null;

  const blocked = Boolean(requireText) && typed.trim() !== requireText;

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 sm:items-center" role="dialog" aria-modal="true" aria-label={title}>
      <div className="w-full max-w-[440px] rounded-[22px] bg-s1 p-5">
        <h2 className="text-[18px] font-extrabold tracking-[-0.03em] text-ink">{title}</h2>
        {description && <p className="mt-2 text-[14.5px] leading-relaxed text-ink2">{description}</p>}
        {requireText && (
          <div className="mt-4">
            <TextInput label={`Type ${requireText} to confirm`} value={typed} onChange={(e) => setTyped(e.target.value)} autoComplete="off" />
          </div>
        )}
        <div className="mt-5 flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <SoftButton onClick={onCancel} disabled={busy}>
            Cancel
          </SoftButton>
          <button
            ref={ref}
            type="button"
            onClick={onConfirm}
            disabled={busy || blocked}
            className="inline-flex h-11 items-center justify-center gap-2 rounded-full bg-bad px-5 text-[14.5px] font-bold text-white transition-colors duration-[180ms] hover:bg-bad/85 focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50"
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
    <div className="hidden overflow-x-auto md:block">
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

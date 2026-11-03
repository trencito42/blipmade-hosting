import {
  useEffect,
  useId,
  useMemo,
  useState,
  type DragEvent,
  type InputHTMLAttributes,
  type ReactNode,
} from 'react';
import { cn } from '../../lib';
import { Icon } from '../../icons';
import { Link } from '../../router';
import { Money } from '../../ui-app';

/** Contiguous related actions with one accessible group and one outer shape. */
export function ButtonGroup({
  label,
  children,
  className,
}: {
  label: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <div
      role="group"
      aria-label={label}
      className={cn(
        'inline-flex min-w-0 [&>*]:-ml-px [&>*]:rounded-none [&>*]:first:ml-0 [&>*]:first:rounded-l-xl [&>*]:last:rounded-r-xl [&>*]:focus-visible:z-10',
        className,
      )}
    >
      {children}
    </div>
  );
}

function decimalPlaces(value: number): number {
  const text = String(value);
  return text.includes('.') ? text.length - text.indexOf('.') - 1 : 0;
}

function bounded(value: number, min: number, max: number, step: number): number {
  const clamped = Math.min(max, Math.max(min, value));
  const snapped = min + Math.round((clamped - min) / step) * step;
  return Number(Math.min(max, Math.max(min, snapped)).toFixed(decimalPlaces(step)));
}

export interface NumberStepperProps
  extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type' | 'value' | 'min' | 'max' | 'step' | 'onChange'> {
  value: number;
  min: number;
  max: number;
  step?: number;
  onChange: (value: number) => void;
  label: string;
  unit?: string;
  error?: string;
}

/** A typeable, keyboard-safe quantity control whose limits always come from its caller. */
export function NumberStepper({
  value,
  min,
  max,
  step = 1,
  onChange,
  label,
  unit,
  error,
  id: suppliedId,
  disabled,
  className,
  ...inputProps
}: NumberStepperProps) {
  const generatedId = useId();
  const id = suppliedId ?? generatedId;
  const errorId = `${id}-error`;
  const [draft, setDraft] = useState(String(value));

  useEffect(() => setDraft(String(value)), [value]);

  const commit = (candidate: string) => {
    const parsed = Number(candidate);
    if (!Number.isFinite(parsed)) {
      setDraft(String(value));
      return;
    }
    const next = bounded(parsed, min, max, step);
    setDraft(String(next));
    onChange(next);
  };

  const changeBy = (direction: -1 | 1) => commit(String(value + direction * step));

  return (
    <div className={cn('grid gap-1.5', className)}>
      <label htmlFor={id} className="px-1 text-[14px] font-medium text-ink">
        {label}
      </label>
      <div className="flex min-w-0">
        <button
          type="button"
          onClick={() => changeBy(-1)}
          disabled={disabled || value <= min}
          aria-label={`Decrease ${label}`}
          className="grid size-12 shrink-0 place-items-center rounded-l-xl border border-line bg-card text-ink2 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          <Icon name="minus" size={15} />
        </button>
        <div className="relative min-w-0 flex-1">
          <input
            {...inputProps}
            id={id}
            type="number"
            inputMode={step % 1 === 0 ? 'numeric' : 'decimal'}
            value={draft}
            min={min}
            max={max}
            step={step}
            disabled={disabled}
            aria-invalid={Boolean(error)}
            aria-describedby={error ? errorId : undefined}
            onChange={(event) => {
              const next = event.target.value;
              setDraft(next);
              if (next !== '' && Number.isFinite(Number(next))) {
                const parsed = Number(next);
                const aligned = Math.abs((parsed - min) / step - Math.round((parsed - min) / step)) < 1e-8;
                if (parsed >= min && parsed <= max && aligned) onChange(parsed);
              }
            }}
            onBlur={() => commit(draft)}
            className="h-12 w-full rounded-none border-y border-line bg-card px-3 text-center font-mono text-[15px] tabular-nums text-ink outline-none focus:z-10 focus:border-acc focus:ring-2 focus:ring-acc/40 disabled:cursor-not-allowed disabled:opacity-60"
          />
          {unit && (
            <span aria-hidden="true" className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 text-[12px] font-semibold text-ink3">
              {unit}
            </span>
          )}
        </div>
        <button
          type="button"
          onClick={() => changeBy(1)}
          disabled={disabled || value >= max}
          aria-label={`Increase ${label}`}
          className="grid size-12 shrink-0 place-items-center rounded-r-xl border border-line bg-card text-ink2 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:z-10 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed disabled:opacity-40 motion-reduce:transition-none"
        >
          <Icon name="plus" size={15} />
        </button>
      </div>
      <p className="px-1 text-[12.5px] text-ink3">
        {min}–{max}{unit ? ` ${unit}` : ''}, in steps of {step}.
      </p>
      {error && <p id={errorId} role="alert" className="px-1 text-[12.5px] font-medium text-bad">{error}</p>}
    </div>
  );
}

export function UnitStepper(props: NumberStepperProps & { unit: string }) {
  return <NumberStepper {...props} />;
}

/** A slider and exact stepper that represent the same server-bounded value. */
export function ResourceSliderStepper({
  marks = [],
  ...props
}: NumberStepperProps & { marks?: { value: number; label: string }[] }) {
  const rangeId = useId();
  const sortedMarks = useMemo(() => [...marks].sort((a, b) => a.value - b.value), [marks]);
  return (
    <div className="grid gap-3 rounded-2xl bg-s2 p-4">
      <label htmlFor={rangeId} className="sr-only">{props.label}</label>
      <input
        id={rangeId}
        type="range"
        value={props.value}
        min={props.min}
        max={props.max}
        step={props.step ?? 1}
        disabled={props.disabled}
        onChange={(event) => props.onChange(Number(event.target.value))}
        className="h-11 w-full accent-acc disabled:opacity-50"
      />
      {sortedMarks.length > 0 && (
        <div className="flex justify-between gap-2 text-[11.5px] text-ink3" aria-hidden="true">
          {sortedMarks.map((mark) => <span key={mark.value}>{mark.label}</span>)}
        </div>
      )}
      <NumberStepper {...props} />
    </div>
  );
}

export interface QuoteLine {
  label: string;
  amount: number;
}

export interface FileDropzoneProps {
  files: File[];
  onFilesChange: (files: File[]) => void;
  accept: string[];
  maxFiles: number;
  maxBytes: number;
  label?: string;
  disabled?: boolean;
  error?: string;
}

function formatBytes(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${Math.round(bytes / 1024)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

function matchesMime(file: File, accepted: string[]): boolean {
  return accepted.some((type) => type.endsWith('/*') ? file.type.startsWith(type.slice(0, -1)) : file.type === type);
}

/** Keyboard and drag accessible file staging with explicit quotas and removable selections. */
export function FileDropzone({
  files,
  onFilesChange,
  accept,
  maxFiles,
  maxBytes,
  label = 'Attachments',
  disabled,
  error,
}: FileDropzoneProps) {
  const inputId = useId();
  const [dragging, setDragging] = useState(false);
  const [localError, setLocalError] = useState<string>();
  const describedBy = `${inputId}-help${error || localError ? ` ${inputId}-error` : ''}`;

  const add = (incoming: File[]) => {
    const combined = [...files];
    for (const file of incoming) {
      if (combined.some((current) => current.name === file.name && current.size === file.size)) continue;
      if (!matchesMime(file, accept)) {
        setLocalError(`${file.name} has a file type that is not supported.`);
        return;
      }
      if (file.size > maxBytes) {
        setLocalError(`${file.name} is larger than ${formatBytes(maxBytes)}.`);
        return;
      }
      combined.push(file);
    }
    if (combined.length > maxFiles) {
      setLocalError(`Choose no more than ${maxFiles} files.`);
      return;
    }
    setLocalError(undefined);
    onFilesChange(combined);
  };

  const drop = (event: DragEvent<HTMLLabelElement>) => {
    event.preventDefault();
    setDragging(false);
    if (!disabled) add(Array.from(event.dataTransfer.files));
  };

  return (
    <div className="grid gap-2">
      <p className="px-1 text-[14px] font-medium text-ink">{label}</p>
      <label
        htmlFor={inputId}
        onDragEnter={(event) => { event.preventDefault(); if (!disabled) setDragging(true); }}
        onDragOver={(event) => event.preventDefault()}
        onDragLeave={(event) => { if (!event.currentTarget.contains(event.relatedTarget as Node | null)) setDragging(false); }}
        onDrop={drop}
        className={cn(
          'group grid min-h-32 cursor-pointer place-items-center rounded-2xl border border-dashed border-line bg-card p-5 text-center transition-[border-color,background-color,transform] duration-[180ms] hover:border-acc/60 hover:bg-s3 focus-within:border-acc focus-within:ring-2 focus-within:ring-acc/40 motion-reduce:transition-none',
          dragging && 'scale-[1.01] border-acc bg-acc-bg motion-reduce:scale-100',
          disabled && 'cursor-not-allowed opacity-50',
          (error || localError) && 'border-bad',
        )}
      >
        <input
          id={inputId}
          type="file"
          multiple={maxFiles > 1}
          disabled={disabled}
          accept={accept.join(',')}
          aria-invalid={Boolean(error || localError)}
          aria-describedby={describedBy}
          onChange={(event) => {
            add(Array.from(event.target.files ?? []));
            event.target.value = '';
          }}
          className="sr-only"
        />
        <span>
          <span className="mx-auto grid size-10 place-items-center rounded-xl bg-s3 text-acc transition-transform duration-[180ms] group-hover:-translate-y-0.5 motion-reduce:transition-none motion-reduce:group-hover:translate-y-0">
            <Icon name="filePlus" size={17} />
          </span>
          <span className="mt-3 block text-[14px] font-semibold text-ink">Drop files here or choose from your device</span>
          <span id={`${inputId}-help`} className="mt-1 block text-[12.5px] text-ink3">
            Up to {maxFiles} files, {formatBytes(maxBytes)} each.
          </span>
        </span>
      </label>
      {(error || localError) && <p id={`${inputId}-error`} role="alert" className="px-1 text-[12.5px] font-medium text-bad">{error ?? localError}</p>}
      {files.length > 0 && (
        <ul className="grid gap-2" aria-label="Selected attachments">
          {files.map((file, index) => (
            <li key={`${file.name}-${file.size}-${index}`} className="flex min-w-0 items-center justify-between gap-3 rounded-xl bg-s2 px-3 py-2.5">
              <span className="min-w-0 truncate text-[12.5px] text-ink2"><span className="font-mono text-ink">{file.name}</span> · {formatBytes(file.size)}</span>
              <button
                type="button"
                disabled={disabled}
                onClick={() => onFilesChange(files.filter((_, itemIndex) => itemIndex !== index))}
                aria-label={`Remove ${file.name}`}
                className="min-h-10 shrink-0 rounded-lg px-3 text-[12.5px] font-semibold text-ink2 transition-colors hover:bg-s3 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-50 motion-reduce:transition-none"
              >
                Remove
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/** Exact minor-unit money summary; callers supply every amount and currency from the API. */
export function QuoteSummary({
  title = 'Summary',
  lines,
  total,
  currency,
  period,
  note,
}: {
  title?: string;
  lines: QuoteLine[];
  total: number;
  currency: string;
  period?: string;
  note?: string;
}) {
  return (
    <aside aria-label={title} className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
      <h2 className="text-[16px] font-semibold text-ink">{title}</h2>
      <dl className="mt-4 grid gap-2.5">
        {lines.map((line) => (
          <div key={line.label} className="flex items-baseline justify-between gap-4 text-[13.5px]">
            <dt className="text-ink2">{line.label}</dt>
            <dd className="text-ink"><Money amount={line.amount} currency={currency} /></dd>
          </div>
        ))}
        <div className="mt-2 flex items-baseline justify-between gap-4 border-t border-line pt-3">
          <dt className="font-semibold text-ink">Total</dt>
          <dd className="text-[17px] font-semibold text-ink"><Money amount={total} currency={currency} period={period} /></dd>
        </div>
      </dl>
      {note && <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">{note}</p>}
    </aside>
  );
}

/** Protect browser unloads and same-site link navigation while an editor has an unsaved draft. */
export function useUnsavedChangesGuard(dirty: boolean, message = 'Discard your unsaved changes?') {
  useEffect(() => {
    if (!dirty || typeof window === 'undefined') return;
    const beforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    const beforeLink = (event: MouseEvent) => {
      const target = event.target instanceof Element ? event.target.closest('a[href]') : null;
      if (!target || !(target instanceof HTMLAnchorElement)) return;
      const destination = new URL(target.href, window.location.href);
      if (destination.origin !== window.location.origin || destination.href === window.location.href) return;
      if (!window.confirm(message)) {
        event.preventDefault();
        event.stopImmediatePropagation();
      }
    };
    const currentUrl = window.location.href;
    const beforeHistory = () => {
      if (window.confirm(message)) return;
      window.history.pushState(null, '', currentUrl);
    };
    window.addEventListener('beforeunload', beforeUnload);
    window.addEventListener('popstate', beforeHistory);
    document.addEventListener('click', beforeLink, true);
    return () => {
      window.removeEventListener('beforeunload', beforeUnload);
      window.removeEventListener('popstate', beforeHistory);
      document.removeEventListener('click', beforeLink, true);
    };
  }, [dirty, message]);
}

/** Reusable full-page create/edit frame with breadcrumbs and a mobile-safe action footer. */
export function PageEditorShell({
  eyebrow,
  title,
  description,
  backTo,
  backLabel,
  children,
  aside,
  actions,
  dirty = false,
}: {
  eyebrow: string;
  title: string;
  description?: string;
  backTo: string;
  backLabel: string;
  children: ReactNode;
  aside?: ReactNode;
  actions: ReactNode;
  dirty?: boolean;
}) {
  return (
    <div className="grid gap-5 pb-24">
      <header className="grid gap-3">
        <Link to={backTo} className="inline-flex w-fit items-center gap-2 rounded-lg text-[13.5px] font-medium text-ink2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">
          <Icon name="arrowLeft" size={14} />
          {backLabel}
        </Link>
        <div>
          <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-acc">{eyebrow}</p>
          <h1 className="mt-1 text-[clamp(1.6rem,3vw,2.25rem)] font-semibold tracking-[-0.045em] text-ink">{title}</h1>
          {description && <p className="mt-2 max-w-2xl text-[14px] leading-relaxed text-ink2">{description}</p>}
        </div>
      </header>
      <div className={cn('grid gap-5', Boolean(aside) && 'lg:grid-cols-[minmax(0,1fr)_20rem] lg:items-start')}>
        <main className="min-w-0 rounded-2xl bg-s1 p-4 sm:p-6">{children}</main>
        {aside}
      </div>
      <footer className="fixed inset-x-0 bottom-0 z-30 border-t border-line bg-bg/95 px-4 py-3 pb-[max(.75rem,env(safe-area-inset-bottom))] backdrop-blur md:left-[var(--bm-sidebar-width,0px)]">
        <div className="mx-auto flex max-w-[1280px] flex-wrap items-center justify-between gap-3">
          <p className="text-[12.5px] text-ink3" aria-live="polite">{dirty ? 'Unsaved changes' : 'No unsaved changes'}</p>
          <div className="flex flex-1 flex-col-reverse gap-2 sm:flex-initial sm:flex-row [&>*]:w-full sm:[&>*]:w-auto">{actions}</div>
        </div>
      </footer>
    </div>
  );
}

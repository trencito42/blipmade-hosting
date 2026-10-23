import { useState, type InputHTMLAttributes, type ReactNode } from 'react';
import { Icon } from '../icons';
import { cn } from '../lib';

/**
 * The one field of the five auth screens.
 *
 * The container is a rounded pill and it carries the only focus indicator of
 * the field: its ring. The input never draws a ring or an outline of its own,
 * so the focus is never shown twice.
 *
 * The container also carries the colour of the browser fill
 * (`--bm-field-bg`), and its own background is that same colour. A field the
 * browser fills therefore keeps the colour of the container, and the round
 * shape of the pill survives the square the browser would paint.
 */

/**
 * The container of a field.
 *
 * The error state keeps its red ring while the field is focused: the message
 * under the field says what is wrong, the ring says that something is wrong.
 */
export function FieldShell({
  error = false,
  disabled = false,
  className,
  children,
}: {
  error?: boolean;
  disabled?: boolean;
  className?: string;
  children: ReactNode;
}) {
  return (
    <div
      className={cn(
        'flex h-14 items-center overflow-hidden rounded-full pl-5 pr-2 ring-2 transition-colors duration-[180ms]',
        // The background of the container is the colour the browser paints the
        // fill with, so an autofilled field is invisible against the pill.
        'bg-[var(--bm-field-bg)]',
        error
          ? '[--bm-field-bg:color-mix(in_oklab,var(--color-bad)_10%,var(--color-bg))] ring-bad'
          : '[--bm-field-bg:var(--color-s1)] focus-within:[--bm-field-bg:var(--color-s2)] ring-transparent focus-within:ring-acc',
        disabled && 'cursor-not-allowed opacity-60',
        className,
      )}
    >
      {children}
    </div>
  );
}

/**
 * The input inside the container.
 *
 * The outline is removed with a priority the global rule cannot beat, because
 * the ring of the container is the focus indicator of the field.
 */
export function FieldInput({
  describedBy,
  className,
  ...props
}: Omit<InputHTMLAttributes<HTMLInputElement>, 'className'> & { describedBy?: string; className?: string }) {
  return (
    <input
      {...props}
      aria-describedby={describedBy}
      className={cn(
        'h-full min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none! placeholder:text-ink3',
        // The fill of the browser sets the colour of the text, so the
        // placeholder needs its own colour to stay muted.
        '[&::placeholder]:[-webkit-text-fill-color:var(--color-ink3)]',
        'disabled:cursor-not-allowed disabled:text-ink3',
        className,
      )}
    />
  );
}

/** The button that shows the password in clear text, and hides it again. */
export function FieldReveal({
  shown,
  onToggle,
  disabled = false,
}: {
  shown: boolean;
  onToggle: () => void;
  disabled?: boolean;
}) {
  const label = shown ? 'Hide password' : 'Show password';
  return (
    <button
      type="button"
      onClick={onToggle}
      disabled={disabled}
      aria-label={label}
      title={label}
      className="grid size-11 shrink-0 place-items-center rounded-full text-ink3 transition-colors duration-[180ms] hover:bg-s3 hover:text-ink focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-acc outline-none! disabled:cursor-not-allowed disabled:opacity-50"
    >
      <Icon name={shown ? 'eyeOff' : 'eye'} />
    </button>
  );
}

export interface AuthFieldProps {
  /** The id of the input. The label and the message point at it. */
  id: string;
  label: ReactNode;
  value: string;
  onChange: (value: string) => void;
  onBlur?: () => void;
  type?: 'text' | 'email' | 'password';
  autoComplete?: string;
  inputMode?: 'text' | 'email' | 'numeric' | 'tel';
  name?: string;
  /** The message under the field. It replaces the hint while it is there. */
  error?: string | null;
  /** The quiet text under the field, for instance the rules of a password. */
  hint?: ReactNode;
  disabled?: boolean;
}

/**
 * A label, the field and the message under it.
 *
 * The message is a live region, so it is announced when it appears after a
 * submit, and the input points at it with aria-describedby.
 */
export function AuthField({
  id,
  label,
  value,
  onChange,
  onBlur,
  type = 'text',
  autoComplete,
  inputMode,
  name,
  error,
  hint,
  disabled = false,
}: AuthFieldProps) {
  const [shown, setShown] = useState(false);
  const errorId = `${id}-error`;
  const hintId = `${id}-hint`;
  const invalid = !!error;

  return (
    <div className="grid gap-2">
      <label htmlFor={id} className="px-1 text-[14px] font-bold">
        {label}
      </label>
      <FieldShell error={invalid} disabled={disabled}>
        <FieldInput
          id={id}
          name={name ?? id}
          type={type === 'password' && shown ? 'text' : type}
          autoComplete={autoComplete}
          inputMode={inputMode}
          value={value}
          disabled={disabled}
          aria-invalid={invalid || undefined}
          describedBy={error ? errorId : hint ? hintId : undefined}
          onChange={(e) => onChange(e.target.value)}
          onBlur={onBlur}
        />
        {type === 'password' && (
          <FieldReveal shown={shown} onToggle={() => setShown((v) => !v)} disabled={disabled} />
        )}
      </FieldShell>
      {error ? (
        <p id={errorId} role="alert" className="px-1 text-[12.5px] font-medium text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={hintId} className="px-1 text-[12.5px] text-ink3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

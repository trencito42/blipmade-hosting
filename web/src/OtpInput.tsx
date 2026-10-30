import { useEffect, useRef, type ClipboardEvent, type KeyboardEvent } from 'react';

/**
 * A code of six digits, one digit in each box.
 *
 * Typing moves to the next box, Backspace goes back, the arrows move, and pasting a whole code
 * fills every box. The first box carries `autocomplete="one-time-code"`, so a phone offers the
 * code of the message or of the app. `onComplete` runs when the last digit is in.
 */
export function OtpInput({
  value,
  onChange,
  onComplete,
  length = 6,
  disabled,
  invalid,
  autoFocus,
  label = 'Verification code',
}: {
  value: string;
  onChange: (value: string) => void;
  onComplete?: (value: string) => void;
  length?: number;
  disabled?: boolean;
  invalid?: boolean;
  autoFocus?: boolean;
  label?: string;
}) {
  const refs = useRef<(HTMLInputElement | null)[]>([]);
  const digits = Array.from({ length }, (_, index) => value[index] ?? '');

  useEffect(() => {
    if (autoFocus) refs.current[0]?.focus();
  }, [autoFocus]);

  const set = (next: string) => {
    const clean = next.replace(/\D/g, '').slice(0, length);
    onChange(clean);
    if (clean.length === length) onComplete?.(clean);
  };

  const place = (index: number, text: string) => {
    const typed = text.replace(/\D/g, '');
    if (!typed) return;
    const before = value.slice(0, index).padEnd(index, ' ');
    const merged = (before + typed + value.slice(index + typed.length)).replace(/ /g, '');
    set(merged);
    refs.current[Math.min(index + typed.length, length - 1)]?.focus();
  };

  const onKey = (index: number, event: KeyboardEvent<HTMLInputElement>) => {
    if (event.key === 'Backspace') {
      event.preventDefault();
      if (digits[index]) {
        set(value.slice(0, index) + value.slice(index + 1));
      } else if (index > 0) {
        set(value.slice(0, index - 1) + value.slice(index));
        refs.current[index - 1]?.focus();
      }
    } else if (event.key === 'ArrowLeft' && index > 0) {
      event.preventDefault();
      refs.current[index - 1]?.focus();
    } else if (event.key === 'ArrowRight' && index < length - 1) {
      event.preventDefault();
      refs.current[index + 1]?.focus();
    }
  };

  const onPaste = (event: ClipboardEvent<HTMLInputElement>) => {
    event.preventDefault();
    set(event.clipboardData.getData('text'));
    refs.current[Math.min(event.clipboardData.getData('text').replace(/\D/g, '').length, length - 1)]?.focus();
  };

  return (
    <div role="group" aria-label={label} className="flex items-center justify-center gap-2 sm:gap-2.5">
      {digits.map((digit, index) => (
        <span key={index} className="contents">
          {index === length / 2 && <span aria-hidden="true" className="mx-0.5 h-0.5 w-2.5 rounded bg-line" />}
          <input
            ref={(element) => {
              refs.current[index] = element;
            }}
            value={digit}
            onChange={(event) => place(index, event.target.value.slice(-1) || event.target.value)}
            onKeyDown={(event) => onKey(index, event)}
            onPaste={onPaste}
            onFocus={(event) => event.target.select()}
            inputMode="numeric"
            pattern="[0-9]*"
            maxLength={length}
            autoComplete={index === 0 ? 'one-time-code' : 'off'}
            aria-label={`${label}, digit ${index + 1} of ${length}`}
            aria-invalid={invalid || undefined}
            disabled={disabled}
            className={`h-14 w-11 rounded-xl border bg-card text-center font-mono text-[22px] font-semibold text-ink outline-none transition-colors focus:border-green focus:ring-2 focus:ring-green/40 disabled:opacity-60 sm:w-12 ${
              invalid ? 'border-bad' : digit ? 'border-ink/40' : 'border-line'
            }`}
          />
        </span>
      ))}
    </div>
  );
}

import { useEffect, useId, useState } from 'react';
import { PrimaryButton, SoftButton, TextInput } from '../../../ui-app';

/**
 * A question with one line of text as the answer: the new name of a file, the
 * name of a folder, the permissions.
 */
export default function PromptDialog({
  title,
  label,
  hint,
  initial,
  confirmLabel,
  validate,
  mono,
  onSubmit,
  onCancel,
}: {
  title: string;
  label: string;
  hint?: string;
  initial: string;
  confirmLabel: string;
  /** Returns the problem with the value, or null when it is fine. */
  validate?: (value: string) => string | null;
  mono?: boolean;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [value, setValue] = useState(initial);
  const [busy, setBusy] = useState(false);
  const titleId = useId();
  const fieldId = useId();

  useEffect(() => {
    const element = document.getElementById(fieldId) as HTMLInputElement | null;
    if (!element) return;
    element.focus();
    // A name is selected up to its extension, so a rename keeps the extension by default.
    const dot = initial.lastIndexOf('.');
    element.setSelectionRange(0, dot > 0 ? dot : initial.length);
  }, [initial, fieldId]);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') onCancel();
    };
    addEventListener('keydown', onKey);
    return () => removeEventListener('keydown', onKey);
  }, [onCancel]);

  const problem = value.trim() ? (validate?.(value.trim()) ?? null) : null;
  const blocked = busy || !value.trim() || problem !== null;

  const submit = async () => {
    if (blocked) return;
    setBusy(true);
    try {
      await onSubmit(value.trim());
    } finally {
      setBusy(false);
    }
  };

  return (
    <div className="fixed inset-0 z-50 flex items-end justify-center bg-bg/80 p-3 sm:items-center" role="dialog" aria-modal="true" aria-labelledby={titleId}>
      <form
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="grid w-full max-w-[440px] gap-4 rounded-2xl border border-line bg-card p-5"
      >
        <h2 id={titleId} className="text-[18px] font-semibold tracking-[-0.03em] text-ink">
          {title}
        </h2>
        <TextInput
          id={fieldId}
          label={label}
          hint={hint}
          value={value}
          onChange={(event) => setValue(event.target.value)}
          error={problem ?? undefined}
          autoComplete="off"
          spellCheck={false}
          className={mono ? 'font-mono' : undefined}
        />
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton onClick={onCancel} disabled={busy}>
            Cancel
          </SoftButton>
          <PrimaryButton type="submit" disabled={blocked}>
            {busy ? 'Working…' : confirmLabel}
          </PrimaryButton>
        </div>
      </form>
    </div>
  );
}

import type { ReactNode } from 'react';
import { Link } from '../../router';
import { PageEditorShell } from '../components/premium';
import { PrimaryButton, SoftButton } from '../../ui-app';

export interface WizardStep {
  id: string;
  title: string;
  description?: string;
}

interface ProductWizardShellProps {
  eyebrow: string;
  title: string;
  description: string;
  backTo: string;
  backLabel?: string;
  steps: WizardStep[];
  stepIndex: number;
  onStep: (index: number) => void;
  canContinue: boolean;
  continueLabel?: string;
  onContinue: () => void;
  summary?: ReactNode;
  children: ReactNode;
}

/** Shared step chrome for family deploy wizards: one heading, progress, back without losing state. */
export function ProductWizardShell({
  eyebrow,
  title,
  description,
  backTo,
  backLabel = 'Back to deploy',
  steps,
  stepIndex,
  onStep,
  canContinue,
  continueLabel = 'Continue',
  onContinue,
  summary,
  children,
}: ProductWizardShellProps) {
  const step = steps[stepIndex];
  return (
    <PageEditorShell
      eyebrow={eyebrow}
      title={title}
      description={description}
      backTo={backTo}
      backLabel={backLabel}
      stickyActions
      actions={
        <div className="flex flex-wrap items-center gap-2">
          {stepIndex > 0 ? (
            <SoftButton type="button" onClick={() => onStep(stepIndex - 1)}>
              Back
            </SoftButton>
          ) : (
            <Link to={backTo} className="inline-flex min-h-11 items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink2">
              {backLabel}
            </Link>
          )}
          <PrimaryButton type="button" disabled={!canContinue} onClick={onContinue}>
            {stepIndex >= steps.length - 1 ? 'Review checkout' : continueLabel}
          </PrimaryButton>
        </div>
      }
    >
      <nav aria-label="Configuration steps" className="mb-6 flex flex-wrap gap-2 border-b border-line pb-4">
        {steps.map((entry, index) => {
          const active = index === stepIndex;
          const done = index < stepIndex;
          return (
            <button
              key={entry.id}
              type="button"
              onClick={() => index <= stepIndex && onStep(index)}
              disabled={index > stepIndex}
              aria-current={active ? 'step' : undefined}
              className={`inline-flex min-h-9 items-center gap-2 rounded-full border px-3 text-[13px] font-semibold transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:opacity-50 ${
                active ? 'border-acc bg-acc/15 text-ink' : done ? 'border-line text-ink2 hover:border-ink/30' : 'border-line/70 text-ink3'
              }`}
            >
              <span className="font-mono text-[11px] tabular-nums opacity-70">{index + 1}</span>
              {entry.title}
            </button>
          );
        })}
      </nav>
      {step && (
        <header className="mb-4 grid gap-1">
          <h3 className="font-display text-[20px] font-semibold tracking-[-0.03em] text-ink">{step.title}</h3>
          {step.description ? <p className="max-w-2xl text-[14px] leading-relaxed text-ink3">{step.description}</p> : null}
        </header>
      )}
      <div className="grid gap-6 lg:grid-cols-[1fr_min(18rem,100%)] lg:items-start">
        <div className="min-w-0">{children}</div>
        {summary ? (
          <aside className="rounded-[20px] border border-line bg-s1/50 p-4 lg:sticky lg:top-24">
            <p className="mb-3 text-[12px] font-semibold uppercase tracking-wide text-ink3">Summary</p>
            {summary}
          </aside>
        ) : null}
      </div>
    </PageEditorShell>
  );
}

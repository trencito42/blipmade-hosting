import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

const BACK_TO = '/app/settings?tab=keys';

const ACCESS = [
  { value: 'read', title: 'Read only', text: 'Lists and reads your services. Cannot change anything.' },
  { value: 'write', title: 'Read and write', text: 'Can also start, stop and change your services.' },
] as const;

const EXPIRY = [
  { value: '30', label: '30 days' },
  { value: '90', label: '90 days' },
  { value: '365', label: '1 year' },
  { value: 'never', label: 'Never' },
] as const;

/**
 * A new API key. The key is shown once, on this page, after the request succeeds. It is never put in the address,
 * in the storage of the browser or in a toast, and it is dropped from the page when the person leaves it.
 */
export default function ApiKeyNew() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [name, setName] = useState('');
  const [scope, setScope] = useState<(typeof ACCESS)[number]['value']>('read');
  const [days, setDays] = useState<(typeof EXPIRY)[number]['value']>('90');
  const [touched, setTouched] = useState(false);
  const [made, setMade] = useState<string | null>(null);
  const dirty = made === null && name.trim() !== '';
  useUnsavedChangesGuard(dirty, 'Discard this key?');

  const create = useAction(async () =>
    post<{ key: string }>('/settings/api-keys', { name: name.trim(), scope, expiresInDays: days === 'never' ? null : Number(days) }),
  );
  const nameError = touched && name.trim().length < 2 ? 'Give the key a name of at least 2 characters.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (name.trim().length < 2) return;
    const result = await create.run();
    if (result) setMade(result.key);
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this key?')) navigate(BACK_TO);
  };
  const copy = () =>
    navigator.clipboard.writeText(made ?? '').then(
      () => toast.push('The key was copied.', 'ok'),
      () => toast.push('Copy failed. Select the key and copy it by hand.', 'error'),
    );

  if (made !== null) {
    return (
      <PageEditorShell
        eyebrow="Security"
        title="Your new API key"
        description="Copy the key now. It is shown only this once and cannot be read again."
        backTo={BACK_TO}
        backLabel="Back to security"
        actions={
          <>
            <SoftButton type="button" onClick={() => void copy()}>Copy the key</SoftButton>
            <PrimaryButton type="button" onClick={() => navigate(BACK_TO, { replace: true })}>I saved it</PrimaryButton>
          </>
        }
      >
        <div className="grid gap-3">
          <p className="break-all rounded-xl bg-card px-3 py-3 font-mono text-[13px] text-ink" data-testid="new-api-key">{made}</p>
          <p className="break-all font-mono text-[12px] text-ink3">
            curl -H &quot;Authorization: Bearer {made.slice(0, 12)}…&quot; https://blipmade.com/api/instances
          </p>
        </div>
      </PageEditorShell>
    );
  }

  return (
    <PageEditorShell
      eyebrow="Security"
      title="New API key"
      description="Use the API from your own scripts and tools. A key reaches the services of your account. It never reaches your settings, your payment method or your invoices."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || !dirty}>
            {create.pending ? 'Making…' : 'Make the key'}
          </PrimaryButton>
        </>
      }
    >
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-5">
        <TextInput
          label="Name"
          value={name}
          onChange={(event) => setName(event.target.value)}
          placeholder="deploy script"
          autoComplete="off"
          error={nameError ?? create.fieldErrors.name}
        />
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13.5px] font-medium text-ink">Access</legend>
          <div className="grid gap-2 sm:grid-cols-2">
            {ACCESS.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[13.5px] text-ink2 ${scope === option.value ? 'border-acc/50 bg-acc-bg' : 'border-line bg-card'}`}
              >
                <input type="radio" name="scope" value={option.value} checked={scope === option.value} onChange={() => setScope(option.value)} className="mt-0.5 size-5 accent-[var(--color-acc)]" />
                <span><strong className="block text-ink">{option.title}</strong>{option.text}</span>
              </label>
            ))}
          </div>
        </fieldset>
        <fieldset className="grid gap-2">
          <legend className="mb-1 text-[13.5px] font-medium text-ink">Expires</legend>
          <div role="radiogroup" aria-label="Expires" className="flex flex-wrap gap-2">
            {EXPIRY.map((option) => (
              <label
                key={option.value}
                className={`flex min-h-11 cursor-pointer items-center gap-2 rounded-full border px-4 text-[13.5px] ${days === option.value ? 'border-acc/50 bg-acc-bg text-ink' : 'border-line text-ink2'}`}
              >
                <input type="radio" name="expires" value={option.value} checked={days === option.value} onChange={() => setDays(option.value)} className="sr-only" />
                {option.label}
              </label>
            ))}
          </div>
          {days === 'never' && <p className="text-[12.5px] text-ink3">A key that never expires stays valid until you revoke it.</p>}
        </fieldset>
        {create.error && !create.fieldErrors.name && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{create.error}</p>
        )}
      </form>
    </PageEditorShell>
  );
}

import { useEffect, useState } from 'react';
import { get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { BillingAddressFields, emptyBillingAddress, validateBillingAddress, type BillingAddressValue } from './BillingAddressFields';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';
import { VatCheck } from './Settings';

interface AccountSettings {
  profile: { email: string; emailVerified: boolean };
  billingAddress: BillingAddressValue | null;
  pendingEmail: string | null;
}

const BACK_TO = '/app/settings';

function useAccountSettings() {
  return useAsync<AccountSettings>((signal) => get<AccountSettings>('/settings', undefined, signal), []);
}

/** The request to change the address of the account. The address changes only when the new one answers. */
export function ChangeEmail() {
  const { navigate } = useRouter();
  const toast = useToast();
  const settings = useAccountSettings();
  const [email, setEmail] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = email.trim() !== '';
  useUnsavedChangesGuard(dirty, 'Discard the new address?');

  const request = useAction(async () =>
    post<{ message: string; delivered: boolean; pendingEmail: string }>('/settings/email', { email: email.trim() }),
  );
  const looksLikeEmail = /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email.trim());
  const error = touched && !looksLikeEmail ? 'Enter a valid email address.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (!looksLikeEmail) return;
    const result = await request.run();
    if (!result) return;
    toast.push(result.message, 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new address?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Account"
      title="Change email address"
      description="The address of the account changes only after the new address has answered."
      backTo={BACK_TO}
      backLabel="Back to settings"
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">Current address</h2>
          {settings.loading ? (
            <p className="mt-2 text-[13px] text-ink3">Loading…</p>
          ) : (
            <>
              <p className="mt-2 break-all font-mono text-[13px] text-ink">{settings.data?.profile.email ?? '—'}</p>
              <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">It keeps working until the new address is confirmed.</p>
              {settings.data?.pendingEmail && (
                <p className="mt-3 rounded-xl bg-acc-bg p-3 text-[12.5px] text-acc" role="status">
                  A link was already sent to {settings.data.pendingEmail}. A new request replaces it.
                </p>
              )}
            </>
          )}
        </aside>
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={request.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={request.pending || !dirty}>
            {request.pending ? 'Sending…' : 'Send the confirmation link'}
          </PrimaryButton>
        </>
      }
    >
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
        <TextInput
          label="New email address"
          type="email"
          inputMode="email"
          autoComplete="email"
          value={email}
          onChange={(event) => setEmail(event.target.value)}
          error={error ?? request.fieldErrors.email}
          placeholder="name@example.com"
        />
        {request.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{request.error}</p>}
      </form>
    </PageEditorShell>
  );
}

/** The billing details that are copied onto new invoices. */
export function EditBillingAddress() {
  const { navigate } = useRouter();
  const toast = useToast();
  const settings = useAccountSettings();
  const [value, setValue] = useState<BillingAddressValue | null>(null);
  const [errors, setErrors] = useState<Partial<Record<string, string>>>({});
  useEffect(() => {
    if (settings.data && value === null) setValue(settings.data.billingAddress ?? emptyBillingAddress);
  }, [settings.data, value]);
  const original = settings.data?.billingAddress ?? emptyBillingAddress;
  const current = value ?? original;
  const dirty = value !== null && JSON.stringify(value) !== JSON.stringify(original);
  useUnsavedChangesGuard(dirty, 'Discard the changes to the billing address?');

  const save = useAction(async () => {
    await put('/settings/billing-address', current);
    return true;
  });

  const submit = async () => {
    const problems = validateBillingAddress(current);
    setErrors(problems);
    if (Object.keys(problems).length > 0) return;
    const result = await save.run();
    if (!result) return;
    toast.push('Billing address saved', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the changes to the billing address?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Billing"
      title="Billing address"
      description="These details are saved to your account and copied onto new invoices. Invoices that already exist do not change."
      backTo={BACK_TO}
      backLabel="Back to settings"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || settings.loading || !dirty}>
            {save.pending ? 'Saving…' : 'Save billing address'}
          </PrimaryButton>
        </>
      }
    >
      {settings.loading ? (
        <LoadingBlock rows={4} label="Loading your billing address" />
      ) : settings.error ? (
        <ErrorState title="Your account could not be loaded" message={settings.error.message} onRetry={settings.reload} />
      ) : (
        <div className="grid gap-4">
          <VatCheck country={current.country} taxId={current.taxId} />
          <BillingAddressFields value={current} onChange={(next) => { setValue(next); setErrors({}); }} errors={{ ...save.fieldErrors, ...errors }} />
          {(Object.keys(errors).length > 0 || save.error) && (
            <p role="alert" className="text-[13px] text-bad">
              {Object.keys(errors).length > 0 ? 'Please fix the highlighted fields.' : save.error}
            </p>
          )}
        </div>
      )}
    </PageEditorShell>
  );
}

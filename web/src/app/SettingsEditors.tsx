import { useEffect, useState } from 'react';
import { del, get, post, put } from '../lib/api';
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
  account?: { deletionRequestedAt: string | null; services: number; subscriptions: number };
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
      stickyActions
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

const CLOSURE_BACK = '/app/settings?tab=account';
const CLOSE_PHRASE = 'CLOSE MY ACCOUNT';

const shortDate = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });

/** The request to close the account. It is recorded for a person of the team; nothing is removed by this page. */
export function CloseAccount() {
  const { navigate } = useRouter();
  const toast = useToast();
  const settings = useAccountSettings();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(password || confirmation);
  useUnsavedChangesGuard(dirty, 'Discard this request?');
  const account = settings.data?.account;
  const requestedAt = account?.deletionRequestedAt ?? null;

  const request = useAction(async () => post<{ requestedAt: string; message: string }>('/settings/account/closure', { password, confirmation: CLOSE_PHRASE }));
  const takeBack = useAction(async () => {
    await del('/settings/account/closure');
    return true;
  });
  const ready = Boolean(password) && confirmation === CLOSE_PHRASE;

  const submit = async () => {
    setTouched(true);
    if (!ready) return;
    const result = await request.run();
    if (!result) return;
    toast.push('The request is recorded', 'ok');
    navigate(CLOSURE_BACK, { replace: true });
  };
  const withdraw = async () => {
    const done = await takeBack.run();
    if (!done) return;
    toast.push('The request was taken back', 'ok');
    navigate(CLOSURE_BACK, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this request?')) navigate(CLOSURE_BACK);
  };

  return (
    <PageEditorShell
      eyebrow="Account"
      title={requestedAt ? 'Request to close the account' : 'Close the account'}
      description="The request is recorded and a person of the team looks at it before anything is removed."
      backTo={CLOSURE_BACK}
      backLabel="Back to settings"
      dirty={dirty}
      actions={
        requestedAt ? (
          <>
            <SoftButton type="button" onClick={discard}>Back</SoftButton>
            <PrimaryButton type="button" onClick={() => void withdraw()} disabled={takeBack.pending}>{takeBack.pending ? 'Working…' : 'Take the request back'}</PrimaryButton>
          </>
        ) : (
          <>
            <SoftButton type="button" onClick={discard} disabled={request.pending}>Discard</SoftButton>
            <button
              type="button"
              onClick={() => void submit()}
              disabled={request.pending || settings.loading || !ready}
              className="inline-flex h-11 items-center justify-center rounded-xl bg-bad px-5 text-[14.5px] font-semibold text-white transition-colors hover:bg-bad/85 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-bad disabled:cursor-not-allowed disabled:opacity-50"
            >
              {request.pending ? 'Working…' : 'Ask for the account to be closed'}
            </button>
          </>
        )
      }
    >
      {settings.loading ? (
        <LoadingBlock rows={3} label="Loading your account" />
      ) : settings.error ? (
        <ErrorState title="Your account could not be loaded" message={settings.error.message} onRetry={settings.reload} />
      ) : requestedAt ? (
        <div className="grid gap-4">
          <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc" role="status">
            The request to close this account was recorded on {shortDate(requestedAt)}. Your services keep running until the end of the period
            you paid for, and the team will write to you before anything is closed.
          </p>
          {takeBack.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{takeBack.error}</p>}
        </div>
      ) : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">Closing the account ends your services</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">
              Your apps and databases keep running until the end of the period you paid for. After that they are stopped.
              {account && account.services > 0
                ? ` This account has ${account.services} active service${account.services === 1 ? '' : 's'} and ${account.subscriptions} subscription${account.subscriptions === 1 ? '' : 's'}.`
                : ''}
            </p>
          </div>
          <TextInput label="Your password" type="password" autoComplete="current-password" value={password} onChange={(event) => setPassword(event.target.value)} error={request.fieldErrors.password ?? (touched && !password ? 'Enter your password.' : undefined)} />
          <TextInput label={`Type ${CLOSE_PHRASE} to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={touched && confirmation !== CLOSE_PHRASE ? `Type ${CLOSE_PHRASE} to confirm.` : undefined} autoComplete="off" spellCheck={false} className="font-mono" />
          {request.error && !request.fieldErrors.password && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{request.error}</p>}
        </form>
      )}
    </PageEditorShell>
  );
}

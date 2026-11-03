import { useState } from 'react';
import { get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
import { denseDanger, denseGhost, maskEmail } from './Overview';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

/** Both pages return to the customer, on the tab the action belongs to. */
const backOf = (id: string) => `/admin/customers/${encodeURIComponent(id)}`;

/** A credit for a customer: the amount, the reason, and the typed amount. It is taken off the next invoice and cannot be undone from here. */
export function CustomerCreditAdjust() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const state = useAsync<{ canCredit: boolean; providerBalance: number | null }>((signal) => get(`/admin/customers/${encodeURIComponent(id)}/credit`, undefined, signal), [id]);
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const validAmount = Number.isFinite(cents) && cents >= 1 && cents <= 50_000;
  const dirty = !done && (amount !== '' || reason !== '' || typed !== '');
  useUnsavedChangesGuard(dirty, 'Discard this credit?');
  const send = useAction(async () => post(`/admin/customers/${encodeURIComponent(id)}/credit`, { amount: cents, currency: 'EUR', reason: reason.trim() }));
  const ready = mayWrite && Boolean(state.data?.canCredit) && validAmount && reason.trim().length >= 5 && typed === (cents / 100).toFixed(2) && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The credit was given.', 'ok');
    navigate(backOf(id), { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this credit?')) navigate(backOf(id));
  };
  return (
    <PageEditorShell eyebrow="Customers" title="Give credit" description="Money the platform gives the customer. It is taken off their next invoice and cannot be undone from here." backTo={backOf(id)} backLabel="Back to the customer" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Giving…' : 'Give the credit'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the credit" />
        : state.error || !state.data ? <ErrorState title="The credit could not be read" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />
        : !state.data.canCredit ? <p className="text-[13.5px] text-ink3">A credit needs a customer at the payment provider (they have not started a checkout yet).</p>
        : (
          <div className="grid gap-3">
            <TextInput label="Amount (EUR)" value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="5.00" hint="Between 0.01 and 500.00." />
            <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Downtime on 30 Oct" hint="At least 5 characters. It goes to the audit log." />
            {validAmount && <TextInput label={`Type ${(cents / 100).toFixed(2)} to confirm`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" />}
            {!mayWrite && <p className="text-[13px] text-ink3">Your role may not give credit.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

/** A private note on a customer, for the team. */
export function CustomerNoteNew() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const [body, setBody] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && body.trim() !== '';
  useUnsavedChangesGuard(dirty, 'Discard this note?');
  const send = useAction(async () => post(`/admin/customers/${encodeURIComponent(id)}/notes`, { body }));
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The note was added.', 'ok');
    navigate(backOf(id), { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this note?')) navigate(backOf(id));
  };
  return (
    <PageEditorShell eyebrow="Customers" title="New note" description="Private, for the team. The customer does not see it." backTo={backOf(id)} backLabel="Back to the customer" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || !body.trim() || send.pending}>{send.pending ? 'Saving…' : 'Add the note'}</PrimaryButton></>}>
      <div className="grid gap-3">
        <TextArea label="Note" value={body} onChange={(event) => setBody(event.target.value)} rows={6} disabled={!mayWrite} />
        {!mayWrite && <p className="text-[13px] text-ink3">Your role may not write notes.</p>}
        {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
      </div>
    </PageEditorShell>
  );
}

/** Suspend or reinstate an account. A reason is required and goes to the audit log; suspending ends every session now. */
export function CustomerAccountAction() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const state = useAsync<{ customer: { id: string; email: string; suspendedAt: string | null; instances: unknown[] } }>((signal) => get(`/admin/customers/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const customer = state.data?.customer;
  const suspended = Boolean(customer?.suspendedAt);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && reason !== '';
  useUnsavedChangesGuard(dirty, 'Discard this change?');
  const send = useAction(async () => post(`/admin/customers/${encodeURIComponent(id)}/suspend`, { suspended: !suspended, reason: reason.trim() }));
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push(suspended ? 'Customer reinstated' : 'Customer suspended', 'ok');
    navigate(backOf(id), { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this change?')) navigate(backOf(id));
  };
  const masked = customer ? maskEmail(customer.email) : '';
  return (
    <PageEditorShell eyebrow="Customers" title={suspended ? 'Reinstate the customer' : 'Suspend the customer'}
      description={customer ? (suspended ? `Reinstating lets ${masked} sign in again. The change is recorded in the audit log.` : `Suspending ${masked} ends every session of this account now and blocks new sign-ins. Their ${customer.instances.length} instance${customer.instances.length === 1 ? '' : 's'} keep running. The change is recorded in the audit log.`) : 'Every change is recorded in the audit log with your reason.'}
      backTo={backOf(id)} backLabel="Back to the customer" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || reason.trim().length < 1 || send.pending}>{send.pending ? 'Working…' : suspended ? 'Reinstate customer' : 'Suspend customer'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the customer" />
        : state.error || !customer ? <ErrorState title="The customer could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            <TextArea label="Reason (required)" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={!mayWrite} hint="Give a reason. It is written to the audit log." />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not allow &quot;customers.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

/** The name of a customer. The change is written to the audit log. */
export function CustomerProfileEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const state = useAsync<{ customer: { name: string | null } }>((signal) => get(`/admin/customers/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const [first = '', ...rest] = (state.data?.customer.name ?? '').split(' ');
  const [firstName, setFirstName] = useState<string | null>(null);
  const [lastName, setLastName] = useState<string | null>(null);
  const [done, setDone] = useState(false);
  const values = { first: firstName ?? first, last: lastName ?? rest.join(' ') };
  const changed = values.first !== first || values.last !== rest.join(' ');
  const dirty = !done && changed;
  useUnsavedChangesGuard(dirty, 'Discard the new name?');
  const send = useAction(async () => patch(`/admin/customers/${encodeURIComponent(id)}/name`, { firstName: values.first.trim(), lastName: values.last.trim() }));
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The name was changed.', 'ok');
    navigate(backOf(id), { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new name?')) navigate(backOf(id));
  };
  return (
    <PageEditorShell eyebrow="Customers" title="Edit the name" description="The change is written to the audit log." backTo={backOf(id)} backLabel="Back to the customer" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || !changed || !values.first.trim() || !values.last.trim() || send.pending}>{send.pending ? 'Saving…' : 'Save the name'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the customer" />
        : state.error || !state.data ? <ErrorState title="The customer could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="First name" value={values.first} onChange={(event) => setFirstName(event.target.value)} disabled={!mayWrite} />
            <TextInput label="Last name" value={values.last} onChange={(event) => setLastName(event.target.value)} disabled={!mayWrite} />
            {!mayWrite && <p className="text-[13px] text-ink3 sm:col-span-2">Your role does not allow &quot;customers.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad sm:col-span-2">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

type SecurityAction = { key: string; title: string; text: string; button: string; path: string; done: string; danger?: boolean };
const SECURITY_ACTIONS: SecurityAction[] = [
  { key: 'reset', title: 'Send a password reset', text: 'A reset link is queued for the address of the customer.', button: 'Send the link', path: 'send-password-reset', done: 'The reset link was queued for the customer.' },
  { key: 'verify', title: 'Mark the email as verified', text: 'Use it when the customer proved the address in another way.', button: 'Mark as verified', path: 'verify-email', done: 'The address is marked as verified.' },
  { key: 'reset2fa', title: 'Reset two-factor', text: 'Two-factor is removed and every session is closed. The customer must set it up again.', button: 'Reset two-factor', path: 'reset-2fa', done: 'Two-factor was reset and the sessions were closed.', danger: true },
  { key: 'sessions', title: 'Sign the customer out everywhere', text: 'Every session of the customer is closed now.', button: 'Sign out everywhere', path: 'revoke-sessions', done: 'Every session of the customer was closed.', danger: true },
];

/** The security actions on an account. The ones that remove access need an explicit acknowledgement first. */
export function CustomerSecurityActions() {
  const { id = '' } = useParams();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'customers.write');
  const state = useAsync<{ customer: { email: string; emailVerified: boolean } }>((signal) => get(`/admin/customers/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const [ack, setAck] = useState<Record<string, boolean>>({});
  const [busy, setBusy] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const run = async (action: SecurityAction) => {
    setBusy(action.key);
    setError(null);
    try {
      await post(`/admin/customers/${encodeURIComponent(id)}/${action.path}`);
      toast.push(action.done, 'ok');
      setAck((current) => ({ ...current, [action.key]: false }));
      state.reload();
    } catch (failure) {
      setError(failure instanceof Error ? failure.message : 'That did not work.');
    } finally {
      setBusy(null);
    }
  };
  const customer = state.data?.customer;
  return (
    <PageEditorShell eyebrow="Customers" title="Security actions" description="Each action is written to the audit log." backTo={backOf(id)} backLabel="Back to the customer" actions={null}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the customer" />
        : state.error || !customer ? <ErrorState title="The customer could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not allow &quot;customers.write&quot;.</p>}
            {SECURITY_ACTIONS.filter((action) => action.key !== 'verify' || !customer.emailVerified).map((action) => (
              <section key={action.key} className="grid gap-2 rounded-2xl border border-line p-4">
                <h2 className="text-[15px] font-semibold text-ink">{action.title}</h2>
                <p className="text-[13.5px] text-ink2">{action.text}</p>
                {action.danger && (
                  <label className="flex items-center gap-2 text-[13.5px] text-ink">
                    <input type="checkbox" checked={Boolean(ack[action.key])} disabled={!mayWrite} onChange={(event) => setAck((current) => ({ ...current, [action.key]: event.target.checked }))} className="size-5" />
                    I understand the customer loses access until they act.
                  </label>
                )}
                <div>
                  <button type="button" disabled={!mayWrite || busy !== null || (action.danger === true && !ack[action.key])} onClick={() => void run(action)} className={action.danger ? denseDanger : denseGhost}>{busy === action.key ? 'Working…' : action.button}</button>
                </div>
              </section>
            ))}
            {error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

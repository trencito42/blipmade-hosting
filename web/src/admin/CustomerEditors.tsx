import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, TextInput, useToast } from '../ui-app';
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

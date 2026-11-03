import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, Money, PrimaryButton, SoftButton, StatusPill, TextArea, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

interface OrderLite {
  id: string; number: string; status: string; fulfillmentStatus: string; total: number; currency: string; paidAt: string | null;
  user: { firstName: string; lastName: string; email: string };
  payments: { id: string; status: string }[];
}

type Mode = 'refund' | 'retry';

/**
 * A high-impact action on one order: what the order is now, what the action does, the reason for the audit log, and for a
 * refund the typed order number. The server decides whether the action is allowed; the page only offers it when it can be.
 */
function OrderAction({ mode }: { mode: Mode }) {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'orders.write');
  const backTo = `/admin/orders/${encodeURIComponent(id)}`;
  const state = useAsync<{ order: OrderLite }>((signal) => get(`/admin/orders/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const order = state.data?.order;
  const [reason, setReason] = useState('');
  const [typed, setTyped] = useState('');
  const [done, setDone] = useState(false);
  const refund = mode === 'refund';
  const dirty = !done && (reason !== '' || typed !== '');
  useUnsavedChangesGuard(dirty, 'Discard this action?');
  const allowed = Boolean(order) && ['paid', 'fulfilled'].includes(order!.status) &&
    (refund ? !order!.payments.some((payment) => payment.status === 'refunded') : order!.fulfillmentStatus !== 'fulfilled');
  const send = useAction(async () => post(refund ? `/admin/orders/${encodeURIComponent(id)}/refund` : `/admin/orders/${encodeURIComponent(id)}/retry-fulfilment`, { reason: reason.trim() }));
  const ready = mayWrite && allowed && reason.trim().length >= 3 && (!refund || typed === order?.number) && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push(refund ? 'Payment refunded.' : 'Delivery queued.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this action?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Orders"
      title={refund ? 'Refund the order' : 'Retry delivery'}
      description={refund ? 'Stripe returns the full payment. This cannot be undone from Blipmade.' : 'Only missing or failed work is queued again. Existing resources are reused.'}
      backTo={backTo}
      backLabel="Back to the order"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Working…' : refund ? 'Refund payment' : 'Retry delivery'}</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the order" />
        : state.error || !order ? <ErrorState title="The order could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-4">
            <dl className="grid gap-3 rounded-2xl bg-s2 p-4 text-[13.5px] sm:grid-cols-4">
              <div><dt className="text-ink3">Order</dt><dd className="font-mono text-ink">{order.number}</dd></div>
              <div><dt className="text-ink3">Customer</dt><dd className="break-words text-ink">{order.user.firstName} {order.user.lastName}<span className="block font-mono text-[12px] text-ink3">{order.user.email}</span></dd></div>
              <div><dt className="text-ink3">Total</dt><dd className="font-mono text-ink"><Money amount={order.total} currency={order.currency} /></dd></div>
              <div><dt className="text-ink3">Now</dt><dd className="flex flex-wrap gap-1.5"><StatusPill status={order.status} /><StatusPill status={order.fulfillmentStatus} /></dd></div>
            </dl>
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;orders.write&quot;.</p>}
            {mayWrite && !allowed && <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink">{refund ? 'This order cannot be refunded: it is not paid, or it is already refunded.' : 'There is nothing to retry: the order is not paid, or its delivery is complete.'}</p>}
            <TextArea label="Reason for the audit log" value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={!mayWrite || !allowed} />
            {refund && <TextInput label={`Type ${order.number} to confirm the refund`} value={typed} onChange={(event) => setTyped(event.target.value)} autoComplete="off" disabled={!mayWrite || !allowed} />}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

export const OrderRefund = () => <OrderAction mode="refund" />;
export const OrderRetry = () => <OrderAction mode="retry" />;

/** A partial refund: the amount to give back and why. It goes back to the card at the payment provider and cannot be undone. */
export function OrderPartialRefund() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'orders.write');
  const backTo = `/admin/orders/${encodeURIComponent(id)}`;
  const state = useAsync<{ order: OrderLite }>((signal) => get(`/admin/orders/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const order = state.data?.order;
  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const cents = Math.round(Number(amount.replace(',', '.')) * 100);
  const validAmount = Number.isFinite(cents) && cents >= 1 && (!order || cents <= order.total);
  const dirty = !done && (amount !== '' || reason !== '');
  useUnsavedChangesGuard(dirty, 'Discard this refund?');
  const allowed = Boolean(order) && ['paid', 'fulfilled'].includes(order!.status);
  const send = useAction(async () => post(`/admin/orders/${encodeURIComponent(id)}/partial-refund`, { amount: cents, reason: reason.trim() }));
  const ready = mayWrite && allowed && validAmount && reason.trim().length >= 5 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The refund was made.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this refund?')) navigate(backTo);
  };
  return (
    <PageEditorShell eyebrow="Orders" title="Refund part of the order" description="It goes back to the card at the payment provider, and cannot be undone." backTo={backTo} backLabel="Back to the order" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Refunding…' : 'Refund this amount'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the order" />
        : state.error || !order ? <ErrorState title="The order could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2"><span className="font-mono text-ink">{order.number}</span> · the order was <Money amount={order.total} currency={order.currency} /></p>
            {!allowed && <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink">This order cannot be refunded: it is not paid.</p>}
            <TextInput label={`Amount (${order.currency})`} value={amount} onChange={(event) => setAmount(event.target.value)} inputMode="decimal" placeholder="5.00" disabled={!mayWrite || !allowed} error={amount !== '' && !validAmount ? 'Write an amount between 0.01 and the total of the order.' : undefined} />
            <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} hint="At least 5 characters. It goes to the audit log." disabled={!mayWrite || !allowed} />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;orders.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

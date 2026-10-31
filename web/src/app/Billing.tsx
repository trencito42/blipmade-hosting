import { CreditNotice } from './CreditNotice';
import { useEffect, useMemo, useState } from 'react';
import { get, post, type Invoice, type Subscription } from '../lib/api';
import { formatPrice } from '../lib/pricing';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useRouter } from '../router';
import {
  ButtonLink,
  CardList,
  ConfirmDialog,
  DataTable,
  EmptyState,
  ErrorState,
  LoadingBlock,
  Money,
  Panel,
  PrimaryButton,
  SoftButton,
  StatTile,
  StatusPill,
  useToast,
} from '../ui-app';

/**
 * Billing. Every amount is an integer in minor units returned by the API.
 * No MRR, total or tax is computed on the client.
 *
 * The page asks the platform whether a payment can be taken before it offers
 * one, and it uses the words of the server for everything it says about
 * payments. An action that cannot work is never shown as if it worked.
 */

interface PendingOrder {
  id: string;
  number: string;
  status: string;
  total: number;
  currency: string;
  createdAt: string;
  items: { name: string }[];
}

interface PaymentMethod {
  brand?: string;
  last4?: string;
  expMonth?: number;
  expYear?: number;
  type?: string;
}

interface BillingSummary {
  currency: string;
  monthlyEstimate: number;
  /** One total for each currency: amounts in different currencies are never added. */
  monthlyByCurrency?: { currency: string; amount: number }[];
  /** The nearest renewal that costs something. */
  nextRenewal?: { at: string; amount: number; currency: string; subscriptionId: string } | null;
  currentPeriodEnd: string | null;
  paymentMethod: PaymentMethod | null;
  hasStripeCustomer: boolean;
  subscriptions: Subscription[];
}

/**
 * The state of the payment the customer comes back from.
 */
export type CheckoutState = 'idle' | 'confirming' | 'confirmed' | 'failed';

/**
 * What the platform says about the payments, as GET /billing/payment-state
 * sends it.
 *
 * The platform decides whether a payment can be taken and says why when it
 * cannot. The page never decides this by itself.
 */
export interface PaymentState {
  /** True when a payment can really be taken. */
  enabled: boolean;
  /** True when the local test gateway stands in for the payment provider. */
  simulated: boolean;
  /** Why no payment is possible, in the words of the server. */
  reason: string | null;
}

/** The answer of the platform about the payments. */
export interface PaymentStateResponse {
  payments: PaymentState;
}

/**
 * The answer of the billing portal.
 *
 * A null address is the normal answer for a customer who has no payment
 * method on file yet, and the message says what is the matter.
 */
export interface PortalResponse {
  url: string | null;
  message: string | null;
}

const INVOICE_STATUS_LABELS: Record<string, string> = {
  DRAFT: 'Draft',
  OPEN: 'Open',
  PAID: 'Paid',
  VOID: 'Void',
  UNCOLLECTIBLE: 'Uncollectible',
};

const SUBSCRIPTION_STATUS_LABELS: Record<string, string> = {
  TRIALING: 'Trialing',
  ACTIVE: 'Active',
  PAST_DUE: 'Past due',
  PAUSED: 'Paused',
  CANCELLED: 'Cancelled',
  INCOMPLETE: 'Incomplete',
  INCOMPLETE_EXPIRED: 'Expired',
};

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Only describes the fields the API actually returned. */
function describePaymentMethod(method: PaymentMethod | null | undefined): string {
  if (!method) return '—';
  const brand = method.brand ?? method.type;
  const last4 = method.last4;
  if (brand && last4) return `${brand} ····${last4}`;
  if (last4) return `Card ····${last4}`;
  if (brand) return brand;
  return 'Payment method on file';
}

/**
 * Whether a payment can be taken, in the words of the platform.
 *
 * The platform decides it and says why when it cannot. The page never
 * decides this by itself: it shows the answer of the server, so a customer is
 * never offered a payment that cannot be made.
 */
export function paymentAvailability(state: PaymentState | null): {
  available: boolean;
  simulated: boolean;
  reason: string | null;
} {
  if (!state) {
    // The platform has not answered yet: the page cannot promise a payment,
    // and it has no reason to give.
    return { available: false, simulated: false, reason: null };
  }
  return { available: state.enabled, simulated: state.simulated, reason: state.reason };
}

/**
 * What the answer of the billing portal means for the page.
 *
 * `opened` means the customer is taken to the portal of the payment
 * provider. `notice` is the normal answer for a customer who has no payment
 * method on file yet: the message of the server says so, and it is a note
 * and never a failure.
 */
export type PortalOutcome =
  | { kind: 'opened'; url: string }
  | { kind: 'notice'; message: string };

/**
 * Opens the billing portal, or returns the note of the server.
 *
 * A null address is not an error: it is the answer for a customer who has
 * never paid. No portal is opened for it, and the message of the server is
 * returned so that the page shows it as what it is.
 */
export async function openPaymentMethod(
  request: () => Promise<PortalResponse>,
  open: (url: string) => void,
): Promise<PortalOutcome> {
  const result = await request();
  if (result.url) {
    open(result.url);
    return { kind: 'opened', url: result.url };
  }
  return { kind: 'notice', message: result.message ?? 'No payment method is on file yet.' };
}

/**
 * What the page says about the payment the customer just came back from.
 *
 * A payment is only announced as a real one when the platform says that it
 * was a real one. While the local test gateway is in use, its own sentence
 * is shown instead, because no money was taken.
 */
export function checkoutNotice(options: {
  cancelled: boolean;
  succeeded: boolean;
  state: CheckoutState;
  payments: PaymentState | null;
}): { title: string; description: string; body: string } {
  const { cancelled, succeeded, state, payments } = options;
  // What the customer reads under the state of the payment.
  const body = 'You can follow the state of the order and of the services in your dashboard.';

  if (cancelled) {
    return {
      title: 'Payment cancelled',
      description: 'You left the payment page without paying. The order is still waiting for you.',
      body,
    };
  }

  // A payment that could not be confirmed is never good news, whatever the
  // platform says about the payments.
  if (state === 'failed') {
    return {
      title: 'Payment',
      description: 'The payment could not be confirmed.',
      // The local test gateway takes no money, so the customer is not sent
      // looking for money that never left the account.
      body:
        payments?.simulated === true
          ? 'The order is still waiting for the payment. You can pay again from the order.'
          : 'The order is still waiting for the payment. You can pay again from the order, or write to us if the money left your account.',
    };
  }

  if (state === 'confirming') {
    return { title: 'Payment', description: 'Confirming your payment…', body };
  }

  // The platform has not answered yet: the page does not say that money was
  // taken before the platform says that it was.
  if (!payments) {
    return { title: 'Payment', description: 'Checking the state of your payment…', body };
  }

  // The local test gateway is not a payment: the sentence of the server says
  // that no real money was taken, and the page shows that sentence.
  if (payments.simulated) {
    return {
      title: 'Test payment',
      description: payments.reason ?? 'No real payment was taken.',
      body,
    };
  }

  if (succeeded) {
    return {
      title: 'Payment received',
      description: 'Your payment was received. The services are being prepared.',
      body,
    };
  }

  if (state === 'confirmed') {
    return {
      title: 'Payment received',
      description: 'Your payment was confirmed. The services are being prepared.',
      body,
    };
  }

  return { title: 'Payment', description: 'Checking the state of your payment…', body };
}

/**
 * The sentence under the name of a subscription.
 *
 * A subscription that ends keeps running until the end of the period that
 * was paid for, so the page says that and never that it is cancelled.
 */
export function subscriptionPeriod(subscription: Subscription): string {
  const date = formatDate(subscription.currentPeriodEnd);
  if (!subscription.currentPeriodEnd) return 'The end of this billing period is not available yet.';
  if (subscription.cancelAtPeriodEnd) {
    return `Cancels at the end of the paid period — ${date}. The service keeps running until then.`;
  }
  if (subscription.stripeManaged === false) {
    return `Paid through ${date}. Automatic renewal is not set up.`;
  }
  if (subscription.status.toUpperCase() === 'PAST_DUE') {
    return `The payment due on ${date} did not go through. Update the payment method to keep the service.`;
  }
  return `Renews ${date}`;
}

/**
 * The action the page offers for a subscription.
 *
 * A subscription that ends at the close of the paid period can be resumed; a
 * subscription that renews can be cancelled. Only one of the two is ever
 * offered, so the page never shows a resume for a subscription that renews.
 */
export function subscriptionAction(subscription: Subscription): 'resume' | 'cancel' {
  return subscription.cancelAtPeriodEnd ? 'resume' : 'cancel';
}

/** The link to the copy of the invoice that the payment provider holds, when there is one. */
function invoiceLink(invoice: Invoice) {
  return invoice.hostedUrl ? (
                      <a
                        href={invoice.hostedUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-bold text-acc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        Open
                      </a>
                    ) : invoice.pdfUrl ? (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="font-bold text-acc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        PDF
                      </a>
                    ) : null;
}

export default function Billing() {
  const { push } = useToast();
  const { query } = useRouter();

  // The customer comes back here from the payment provider. The session of
  // the payment travels in the address, so the page has to read it: without
  // it the page shows an empty estimate and the order waits forever for a
  // payment that the browser already made.
  const checkout = query.checkout ?? null;
  const paymentCancelled = checkout === 'cancelled';
  const paymentSucceeded = checkout === 'success';
  // The local gateway names the session after the order, so the order is
  // known without asking the provider.
  const checkoutOrderId = checkout && checkout.startsWith('test_cs_') ? checkout.slice('test_cs_'.length) : null;

  const summaryState = useAsync<BillingSummary>(
    (signal) => get<BillingSummary>('/billing/summary', undefined, signal),
    [],
  );
  const invoicesState = useAsync<{ invoices: Invoice[] }>(
    (signal) => get<{ invoices: Invoice[] }>('/billing/invoices', undefined, signal),
    [],
  );
  const ordersState = useAsync<{ orders: PendingOrder[] }>(
    (signal) => get<{ orders: PendingOrder[] }>('/orders', undefined, signal),
    [],
  );
  const subscriptionsState = useAsync<{ subscriptions: Subscription[] }>(
    (signal) => get<{ subscriptions: Subscription[] }>('/billing/subscriptions', undefined, signal),
    [],
  );
  // The page asks the platform whether a payment can be taken before it
  // offers one. The answer of the server says why it cannot, so the page
  // never writes a reason of its own.
  const paymentsState = useAsync<PaymentStateResponse>(
    (signal) => get<PaymentStateResponse>('/billing/payment-state', undefined, signal),
    [],
  );

  const [pendingCancel, setPendingCancel] = useState<Subscription | null>(null);
  const [payingOrderId, setPayingOrderId] = useState<string | null>(null);
  const [paymentNotice, setPaymentNotice] = useState<string | null>(null);
  const [busySubscriptionId, setBusySubscriptionId] = useState<string | null>(null);
  const [checkoutState, setCheckoutState] = useState<CheckoutState>('idle');

  const summary = summaryState.data;
  const invoices = useMemo(() => invoicesState.data?.invoices ?? [], [invoicesState.data]);
  const unpaidOrders = (ordersState.data?.orders ?? []).filter((order) => order.status === 'AWAITING_PAYMENT' || order.status === 'PENDING');
  const subscriptions = useMemo(() => subscriptionsState.data?.subscriptions ?? [], [subscriptionsState.data]);

  // What the platform says about the payments. The page shows that answer
  // and never decides by itself that a payment is possible.
  const payments = paymentsState.data?.payments ?? null;
  const availability = paymentAvailability(payments);
  // The answer of the platform could not be read: the action stays offered,
  // because the platform refuses with its own reason when it cannot take a
  // payment, and that reason is shown.
  const paymentAvailable = paymentsState.error !== null || availability.available;
  // The sentence of the server is the sentence the customer reads. The
  // platform uses the same one when it sends no reason of its own.
  const unavailableReason =
    payments !== null && !availability.available
      ? availability.reason ?? 'Payments are not available at the moment.'
      : null;
  // A card is only on file when a payment could really have been taken, so
  // the claim is only withdrawn when the platform says that no payment is
  // possible.
  const cardCanBeManaged = Boolean(summary?.hasStripeCustomer) && !availability.simulated && (payments === null || availability.available);
  // What the page says about the payment the customer just came back from.
  const checkoutCopy = checkoutNotice({
    cancelled: paymentCancelled,
    succeeded: paymentSucceeded,
    state: checkoutState,
    payments,
  });

  // The payment is confirmed once, when the customer comes back from the
  // local gateway. The confirmation is the answer of the platform, so the
  // page asks for it and then shows the state of the order.
  useEffect(() => {
    if (!checkoutOrderId || checkoutState !== 'idle') return;
    let cancelled = false;
    setCheckoutState('confirming');
    post<{ order: { id: string; status: string; total: number } }>(`/orders/${checkoutOrderId}/confirm`)
      .then(() => {
        if (cancelled) return;
        setCheckoutState('confirmed');
        refreshAll();
      })
      .catch(() => {
        if (cancelled) return;
        // The panel of the payment says that the payment could not be
        // confirmed and that the order is still waiting for it.
        setCheckoutState('failed');
      });
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [checkoutOrderId]);

  const refreshAll = () => {
    subscriptionsState.reload();
    summaryState.reload();
    invoicesState.reload();
    ordersState.reload();
  };

  useEffect(() => {
    if (!paymentSucceeded) return;
    const timer = window.setInterval(() => {
      invoicesState.reload();
      ordersState.reload();
      summaryState.reload();
    }, 3000);
    const stop = window.setTimeout(() => window.clearInterval(timer), 30000);
    return () => { window.clearInterval(timer); window.clearTimeout(stop); };
  }, [paymentSucceeded, invoicesState.reload, ordersState.reload, summaryState.reload]);

  const payOrder = async (id: string) => {
    setPayingOrderId(id);
    try {
      const checkout = await post<{ url: string | null; message?: string }>(`/orders/${id}/checkout`);
      if (checkout.url) location.assign(checkout.url);
      else push(checkout.message ?? 'Checkout is unavailable.', 'error');
    } catch (error) {
      push(error instanceof Error ? error.message : 'Checkout could not be opened.', 'error');
    } finally { setPayingOrderId(null); }
  };

  const cancel = useAction(async (id: string) => {
    await post(`/billing/subscriptions/${id}/cancel`);
    refreshAll();
    setPendingCancel(null);
    push('The service keeps running until the end of the paid period.');
  });

  const resume = useAction(async (id: string) => {
    await post(`/billing/subscriptions/${id}/resume`);
    refreshAll();
    push('Subscription will renew at the close of the current period.');
  });

  const paymentMethodAction = useAction(async () => {
    setPaymentNotice(null);
    const outcome = await openPaymentMethod(
      () => post<PortalResponse>('/billing/payment-method'),
      (url) => location.assign(url),
    );
    // A null address is not a failure: it is the answer for a customer who
    // has no payment method on file yet, so it is shown as a note.
    if (outcome.kind === 'notice') setPaymentNotice(outcome.message);
  });

  const summaryError = summaryState.error;
  const invoiceError = invoicesState.error;

  return (
    <div className="grid gap-4">
      <CreditNotice />
      {/* The state of the payment the customer just came back from. Without
          this the page shows an empty estimate and the order waits for a
          payment that the browser already made. */}
      {checkout ? (
        <Panel title={checkoutCopy.title} description={checkoutCopy.description}>
          <p className="text-ink2">{checkoutCopy.body}</p>
        </Panel>
      ) : null}

      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-2">
        {summaryState.loading ? (
          <div className="sm:col-span-2">
            <LoadingBlock rows={1} label="Loading your billing summary" />
          </div>
        ) : summaryError ? (
          <div className="sm:col-span-2">
            <ErrorState
              title="Could not load your billing summary"
              message={summaryError.message}
              onRetry={summaryState.reload}
            />
          </div>
        ) : summary ? (
          <>
            <StatTile
              label="Monthly total"
              value={
                summary.monthlyByCurrency && summary.monthlyByCurrency.length > 1 ? (
                  <span className="grid gap-1 text-[20px]">
                    {summary.monthlyByCurrency.map((line) => (
                      <Money key={line.currency} amount={line.amount} currency={line.currency} />
                    ))}
                  </span>
                ) : (
                  <Money amount={summary.monthlyEstimate} currency={summary.currency} />
                )
              }
              hint="Every subscription you pay for: apps, servers and email. A yearly plan counts as a twelfth a month."
            />
            <StatTile
              label="Next renewal"
              value={summary.nextRenewal ? formatDate(summary.nextRenewal.at) : 'None'}
              hint={
                summary.nextRenewal
                  ? `${formatPrice(summary.nextRenewal.amount, summary.nextRenewal.currency)} is charged on that day.`
                  : 'No payment is scheduled.'
              }
            />
          </>
        ) : null}
      </section>

      {/* Payment method action */}
      <Panel
        title="Payment method"
        description={
          summary?.paymentMethod
            ? describePaymentMethod(summary.paymentMethod)
            : summary?.hasStripeCustomer
              ? 'Managed in the Stripe billing portal.'
              : 'No payment method on file.'
        }
        action={
          <PrimaryButton
            onClick={() => void paymentMethodAction.run()}
            disabled={!paymentAvailable || !cardCanBeManaged || paymentMethodAction.pending}
          >
            {paymentMethodAction.pending ? 'Working…' : 'Manage payment method'}
          </PrimaryButton>
        }
        actionBelow
      >
        <div className="grid gap-3">
          {unavailableReason && (
            <p role="status" className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">
              {unavailableReason}
            </p>
          )}
          {summary && !summary.hasStripeCustomer && (
            <div className="flex flex-wrap items-center justify-between gap-3 rounded-2xl bg-s2 px-4 py-3">
              <p className="min-w-0 flex-1 text-[14px] text-ink2">
                A free first term does not set up automatic Stripe renewal. Contact support before the period ends.
              </p>
              <ButtonLink to="/app/tickets" variant="soft">Contact support about renewal</ButtonLink>
            </div>
          )}
          {paymentNotice && (
            <p role="status" className="rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink2">
              {paymentNotice}
            </p>
          )}
          {paymentMethodAction.error && (
            <p role="alert" className="text-[13.5px] font-medium text-bad">
              {paymentMethodAction.error}
            </p>
          )}
        </div>
      </Panel>

      {/* Subscriptions */}
      <Panel title="Subscriptions" description="One subscription for each app, server, VPS and mail plan.">
        {subscriptionsState.loading ? (
          <LoadingBlock rows={2} label="Loading your subscriptions" />
        ) : subscriptionsState.error ? (
          <ErrorState
            title="Could not load your subscriptions"
            message={subscriptionsState.error.message}
            onRetry={subscriptionsState.reload}
          />
        ) : !subscriptions.length ? (
          <EmptyState
            title="No subscriptions yet"
            description="A subscription starts with your first instance. Deploy an app or a database and the plan follows it."
            action={
              <ButtonLink to="/app/deploy">See what you can deploy</ButtonLink>
            }
          />
        ) : (
          <div className="grid gap-2">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-2xl bg-s2 p-3.5 sm:flex sm:items-center sm:gap-4">
                <div className="flex min-w-0 flex-1 flex-wrap items-start justify-between gap-3">
                  {/* The name keeps its room. On a phone the status and the
                      amount move to the next line instead of cutting the name
                      to a few letters. */}
                  <div className="w-0 min-w-[10rem] flex-1">
                    <p
                      className="truncate text-[15.5px] font-bold tracking-[-0.02em] text-ink"
                      title={subscription.instanceName ?? undefined}
                    >
                      {subscription.instanceName ?? 'Subscription'}
                    </p>
                    <p className="mt-0.5 text-[13px] text-ink3">{subscriptionPeriod(subscription)}</p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill
                      status={subscription.status}
                      label={SUBSCRIPTION_STATUS_LABELS[subscription.status.toUpperCase()] ?? subscription.status}
                    />
                    <span className="font-mono text-[14px] font-semibold text-ink">
                      <Money amount={subscription.amount} currency={subscription.currency} />
                      {subscription.stripeManaged === false && <span className="ml-1 text-[12px] font-normal text-ink3">this period</span>}
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2 sm:mt-0 sm:shrink-0 sm:justify-end">
                  {subscriptionAction(subscription) === 'resume' ? (
                    <SoftButton
                      onClick={() => {
                        setBusySubscriptionId(subscription.id);
                        void resume.run(subscription.id).finally(() => setBusySubscriptionId(null));
                      }}
                      disabled={resume.pending}
                      className="w-full sm:w-auto"
                    >
                      {busySubscriptionId === subscription.id ? 'Working…' : 'Resume'}
                    </SoftButton>
                  ) : (
                    <SoftButton
                      onClick={() => setPendingCancel(subscription)}
                      disabled={cancel.pending}
                      className="w-full sm:w-auto"
                    >
                      Cancel at period end
                    </SoftButton>
                  )}
                </div>
              </div>
            ))}
            {resume.error && (
              <p role="alert" className="text-[13.5px] font-medium text-bad">
                {resume.error}
              </p>
            )}
            {cancel.error && (
              <p role="alert" className="text-[13.5px] font-medium text-bad">
                {cancel.error}
              </p>
            )}
          </div>
        )}
      </Panel>

      {unpaidOrders.length > 0 && (
        <Panel title="Orders awaiting payment" description="Complete checkout to activate these services. The final invoice appears after payment is confirmed.">
          <div className="grid gap-2">
            {unpaidOrders.map((order) => (
              <div key={order.id} className="flex flex-wrap items-center justify-between gap-3 rounded-2xl border border-line p-4">
                <div>
                  <p className="font-semibold text-ink">Order #{order.number} · {order.items.map((item) => item.name).join(', ')}</p>
                  <p className="text-[13px] text-ink3">Created {formatDate(order.createdAt)} · <Money amount={order.total} currency={order.currency} /></p>
                </div>
                <PrimaryButton onClick={() => void payOrder(order.id)} disabled={payingOrderId === order.id || !paymentAvailable}>
                  {payingOrderId === order.id ? 'Opening checkout…' : 'Pay now'}
                </PrimaryButton>
              </div>
            ))}
          </div>
        </Panel>
      )}

      {/* Invoices */}
      <Panel title="Invoices">
        {invoicesState.loading ? (
          <LoadingBlock rows={3} label="Loading your invoices" />
        ) : invoiceError ? (
          <ErrorState
            title="Could not load your invoices"
            message={invoiceError.message}
            onRetry={invoicesState.reload}
          />
        ) : !invoices.length ? (
          <EmptyState title="No invoices yet" description="Invoices appear here after your first payment." />
        ) : (
          <>
            <DataTable
              columns={[
                {
                  key: 'number',
                  header: 'Number',
                  nowrap: true,
                  render: (invoice) => (
                    <span className="grid gap-1">
                      <span className="font-mono text-[13px]">{invoice.number}</span>
                      {invoice.billingAddress && (
                        <address className="max-w-[260px] whitespace-normal text-[12px] not-italic text-ink3">
                          {invoice.billingAddress.companyName && <>{invoice.billingAddress.companyName}<br /></>}
                          {invoice.billingAddress.fullName}<br />
                          {invoice.billingAddress.line1}{invoice.billingAddress.line2 ? `, ${invoice.billingAddress.line2}` : ''}<br />
                          {invoice.billingAddress.postalCode} {invoice.billingAddress.city}, {invoice.billingAddress.country}
                          {invoice.billingAddress.taxId && <><br />Tax ID: {invoice.billingAddress.taxId}</>}
                        </address>
                      )}
                    </span>
                  ),
                },
                {
                  key: 'date',
                  header: 'Date',
                  nowrap: true,
                  render: (invoice) => <span className="text-[13.5px] text-ink2">{formatDate(invoice.createdAt)}</span>,
                },
                {
                  key: 'amount',
                  header: 'Amount',
                  align: 'right',
                  nowrap: true,
                  render: (invoice) => (
                    <span className="grid gap-0.5">
                      <Money amount={invoice.total} currency={invoice.currency} />
                      <span className="text-[12px] text-ink3">
                        amount <Money amount={invoice.amount} currency={invoice.currency} /> · tax{' '}
                        <Money amount={invoice.tax} currency={invoice.currency} />
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'status',
                  header: 'Status',
                  nowrap: true,
                  render: (invoice) => (
                    <StatusPill status={invoice.status} label={INVOICE_STATUS_LABELS[invoice.status.toUpperCase()] ?? invoice.status} />
                  ),
                },
                {
                  key: 'link',
                  header: 'Invoice',
                  nowrap: true,
                  render: (invoice) => (
                    <span className="inline-flex items-center gap-3">
                      <Link
                        to={`/app/billing/invoices/${invoice.id}`}
                        className="font-bold text-acc hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        View
                      </Link>
                      {invoiceLink(invoice)}
                    </span>
                  ),
                },
              ]}
              rows={invoices}
              rowKey={(invoice) => invoice.id}
            />

            <CardList rows={invoices} rowKey={(invoice) => invoice.id}>
              {(invoice) => (
                <div className="grid gap-2">
                  <div className="flex items-start justify-between gap-3">
                    <div className="w-0 min-w-0 flex-1">
                      <p className="truncate font-mono text-[14px] font-medium text-ink" title={invoice.number}>
                        {invoice.number}
                      </p>
                      <p className="text-[12.5px] text-ink3">{formatDate(invoice.createdAt)}</p>
                    </div>
                    <span className="shrink-0 font-mono text-[15px] font-semibold text-ink">
                      <Money amount={invoice.total} currency={invoice.currency} />
                    </span>
                  </div>
                  <div className="flex items-center justify-between gap-3">
                    <StatusPill
                      status={invoice.status}
                      label={INVOICE_STATUS_LABELS[invoice.status.toUpperCase()] ?? invoice.status}
                    />
                    <ButtonLink to={`/app/billing/invoices/${invoice.id}`} variant="soft">
                      View invoice
                    </ButtonLink>
                    {invoice.hostedUrl ? (
                      <ButtonLink
                        href={invoice.hostedUrl}
                        variant="soft"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        Open invoice
                      </ButtonLink>
                    ) : invoice.pdfUrl ? (
                      <ButtonLink
                        href={invoice.pdfUrl}
                        variant="soft"
                        target="_blank"
                        rel="noreferrer noopener"
                      >
                        PDF
                      </ButtonLink>
                    ) : null}
                  </div>
                </div>
              )}
            </CardList>
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={Boolean(pendingCancel)}
        title="Cancel this subscription?"
        description={
          pendingCancel
            ? `${pendingCancel.instanceName ?? 'This instance'} keeps running until ${formatDate(
                pendingCancel.currentPeriodEnd,
              )}, then it is stopped and no longer billed.`
            : undefined
        }
        confirmLabel="Cancel subscription"
        busy={cancel.pending}
        onCancel={() => setPendingCancel(null)}
        onConfirm={() => {
          if (pendingCancel) void cancel.run(pendingCancel.id);
        }}
      />
    </div>
  );
}

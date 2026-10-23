import { useMemo, useState } from 'react';
import { get, post, type Invoice, type Subscription } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link } from '../router';
import {
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
 */

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
  currentPeriodEnd: string | null;
  paymentMethod: PaymentMethod | null;
  subscriptions: Subscription[];
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

const linkButton =
  'inline-flex h-11 items-center justify-center gap-2 rounded-full bg-acc px-5 text-[14.5px] font-bold text-on-acc transition-colors duration-[180ms] hover:bg-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc';

function formatDate(value: string | null | undefined): string {
  if (!value) return '—';
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return new Intl.DateTimeFormat('en-IE', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
}

/** Only describes the fields the API actually returned. */
function describePaymentMethod(method: PaymentMethod | null | undefined): string {
  if (!method) return 'No payment method on file';
  const brand = method.brand ?? method.type;
  const last4 = method.last4;
  if (brand && last4) return `${brand} ····${last4}`;
  if (last4) return `Card ····${last4}`;
  if (brand) return brand;
  return 'Payment method on file';
}

export default function Billing() {
  const { push } = useToast();

  const summaryState = useAsync<BillingSummary>(
    (signal) => get<BillingSummary>('/billing/summary', undefined, signal),
    [],
  );
  const invoicesState = useAsync<{ invoices: Invoice[] }>(
    (signal) => get<{ invoices: Invoice[] }>('/billing/invoices', undefined, signal),
    [],
  );
  const subscriptionsState = useAsync<{ subscriptions: Subscription[] }>(
    (signal) => get<{ subscriptions: Subscription[] }>('/billing/subscriptions', undefined, signal),
    [],
  );

  const [pendingCancel, setPendingCancel] = useState<Subscription | null>(null);
  const [paymentIssue, setPaymentIssue] = useState<string | null>(null);
  const [busySubscriptionId, setBusySubscriptionId] = useState<string | null>(null);

  const summary = summaryState.data;
  const invoices = useMemo(() => invoicesState.data?.invoices ?? [], [invoicesState.data]);
  const subscriptions = useMemo(() => subscriptionsState.data?.subscriptions ?? [], [subscriptionsState.data]);

  const refreshAll = () => {
    subscriptionsState.reload();
    summaryState.reload();
  };

  const cancel = useAction(async (id: string) => {
    await post(`/billing/subscriptions/${id}/cancel`);
    refreshAll();
    setPendingCancel(null);
    push('Subscription will end at the close of the current period.');
  });

  const resume = useAction(async (id: string) => {
    await post(`/billing/subscriptions/${id}/resume`);
    refreshAll();
    push('Subscription will renew at the close of the current period.');
  });

  const paymentMethodAction = useAction(async () => {
    setPaymentIssue(null);
    const result = await post<{ url: string | null }>('/billing/payment-method');
    if (result.url) {
      location.assign(result.url);
      return;
    }
    setPaymentIssue('Payment details cannot be changed here: billing is not configured in this environment.');
  });

  const summaryError = summaryState.error;
  const invoiceError = invoicesState.error;

  return (
    <div className="grid gap-4">
      {/* Summary */}
      <section className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
        {summaryState.loading ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <LoadingBlock rows={1} label="Loading your billing summary" />
          </div>
        ) : summaryError ? (
          <div className="sm:col-span-2 lg:col-span-3">
            <ErrorState
              title="Could not load your billing summary"
              message={summaryError.message}
              onRetry={summaryState.reload}
            />
          </div>
        ) : summary ? (
          <>
            <StatTile
              label="This month (estimate)"
              value={<Money amount={summary.monthlyEstimate} currency={summary.currency} />}
              hint={`Estimated from your current subscriptions in ${summary.currency}.`}
            />
            <StatTile
              label="Current period ends"
              value={formatDate(summary.currentPeriodEnd)}
              hint={summary.currentPeriodEnd ? undefined : 'Not available yet'}
            />
            <StatTile
              label="Payment method"
              value={describePaymentMethod(summary.paymentMethod)}
              hint={summary.paymentMethod ? undefined : 'No payment method on file.'}
            />
          </>
        ) : null}
      </section>

      {/* Payment method action */}
      <Panel title="Payment method">
        <div className="grid gap-3">
          <p className="text-[14px] text-ink2">
            Manage the card or payment method used for your subscriptions. You are taken to the secure billing portal.
          </p>
          <div>
            <PrimaryButton
              onClick={() => void paymentMethodAction.run()}
              disabled={paymentMethodAction.pending}
              className="w-full sm:w-auto"
            >
              {paymentMethodAction.pending ? 'Working…' : 'Manage payment method'}
            </PrimaryButton>
          </div>
          {paymentIssue && (
            <p role="alert" className="rounded-2xl bg-bad/12 px-4 py-3 text-[14px] text-ink2">
              <span className="font-bold text-bad">Not available. </span>
              {paymentIssue}
            </p>
          )}
          {paymentMethodAction.error && (
            <p role="alert" className="text-[13.5px] font-bold text-bad">
              {paymentMethodAction.error}
            </p>
          )}
        </div>
      </Panel>

      {/* Subscriptions */}
      <Panel title="Subscriptions" description="One subscription per instance.">
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
              <Link to="/app/deploy" className={linkButton}>
                See what you can deploy
              </Link>
            }
          />
        ) : (
          <div className="grid gap-2">
            {subscriptions.map((subscription) => (
              <div key={subscription.id} className="rounded-2xl bg-s2 p-3.5">
                <div className="flex flex-wrap items-start justify-between gap-3">
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
                    <p className="mt-0.5 text-[13px] text-ink3">
                      {subscription.cancelAtPeriodEnd
                        ? `Ends ${formatDate(subscription.currentPeriodEnd)}`
                        : `Renews ${formatDate(subscription.currentPeriodEnd)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <StatusPill
                      status={subscription.status}
                      label={SUBSCRIPTION_STATUS_LABELS[subscription.status.toUpperCase()] ?? subscription.status}
                    />
                    <span className="font-mono text-[14px] font-semibold text-ink">
                      <Money amount={subscription.amount} currency={subscription.currency} />
                    </span>
                  </div>
                </div>
                <div className="mt-3 flex flex-wrap gap-2">
                  {subscription.cancelAtPeriodEnd ? (
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
              <p role="alert" className="text-[13.5px] font-bold text-bad">
                {resume.error}
              </p>
            )}
            {cancel.error && (
              <p role="alert" className="text-[13.5px] font-bold text-bad">
                {cancel.error}
              </p>
            )}
          </div>
        )}
      </Panel>

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
                  render: (invoice) => <span className="font-mono text-[13px]">{invoice.number}</span>,
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
                  render: (invoice) =>
                    invoice.hostedUrl ? (
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
                    ) : (
                      <span className="text-ink3">—</span>
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
                      <p className="truncate font-mono text-[14px] font-bold text-ink" title={invoice.number}>
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
                    {invoice.hostedUrl ? (
                      <a
                        href={invoice.hostedUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex h-11 items-center justify-center rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        Open invoice
                      </a>
                    ) : invoice.pdfUrl ? (
                      <a
                        href={invoice.pdfUrl}
                        target="_blank"
                        rel="noreferrer noopener"
                        className="inline-flex h-11 items-center justify-center rounded-full bg-s3 px-4 text-[13.5px] font-bold text-ink transition-colors duration-[180ms] hover:bg-line focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                      >
                        PDF
                      </a>
                    ) : (
                      <span className="text-[12.5px] text-ink3">No link available</span>
                    )}
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

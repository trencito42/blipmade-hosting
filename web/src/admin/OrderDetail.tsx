import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Money, Panel, StatusPill } from '../ui-app';
import { DASH, denseGhost, fmtDateTime } from './Overview';

interface OrderControl {
  id: string; number: string; status: string; fulfillmentStatus: string; kind: string; total: number; discount: number; currency: string; createdAt: string; paidAt: string | null;
  stripeCheckoutSessionId: string | null; stripePaymentIntentId: string | null; billingAddress: Record<string, unknown> | null;
  user: { id: string; email: string; firstName: string; lastName: string; suspendedAt: string | null };
  promotion: { id: string; code: string; type: string; value: number } | null;
  risk: { score: number; level: string; signals: { id: string; text: string; weight: number }[] } | null;
  items: { id: string; name: string; quantity: number; unitAmount: number; total: number; currency: string; fulfillmentStatus: string; fulfillmentError: string | null; product: { name: string; slug: string }; subscription: { id: string; status: string; stripeSubscriptionId: string | null } | null; instances: { id: string; name: string; status: string }[]; mailService: { id: string; status: string; domains: { name: string }[] } | null; vpsService: { id: string; name: string; status: string; vmid: number | null } | null }[];
  payments: { id: string; amount: number; currency: string; status: string; failureMessage: string | null; stripePaymentIntentId: string | null; stripeChargeId: string | null; stripeCustomerId: string | null; stripeSubscriptionId: string | null; stripeInvoiceId: string | null; createdAt: string }[];
  invoices: { id: string; number: string; status: string; total: number; currency: string; stripeInvoiceId: string | null; hostedUrl: string | null; pdfUrl: string | null; createdAt: string }[];
  webhooks: { id: string; type: string; status: string; attempts: number; error: string | null; createdAt: string; processedAt: string | null }[];
  events: { id: string; type: string; state: string; channels: Record<string, string>; lastError: string | null; occurredAt: string }[];
  audit: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
}

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="rounded-2xl bg-s2 px-4 py-3"><dt className="font-mono text-[11px] uppercase tracking-[.08em] text-ink3">{label}</dt><dd className="mt-1 break-words text-[14px] text-ink">{children}</dd></div>;
}

export default function OrderDetail() {
  const { id } = useParams();
  const state = useAsync<{ order: OrderControl }>((signal) => get(`/admin/orders/${id}`, undefined, signal), [id]);
  if (state.loading && !state.data) return <LoadingBlock rows={8} label="Loading the order" />;
  if (state.error || !state.data) return <ErrorState title="The order could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />;
  const order = state.data.order;
  const pipeline = [
    { label: 'Order', state: order.status },
    { label: 'Payment', state: order.payments[0]?.status ?? 'missing' },
    { label: 'Invoice', state: order.invoices[0]?.status ?? 'missing' },
    { label: 'Fulfilment', state: order.fulfillmentStatus },
    { label: 'Service', state: order.items.some((item) => item.instances.length || item.mailService || item.vpsService) ? 'created' : 'missing' },
  ];

  return <div className="grid gap-4">
    <Panel title={order.number} description="Order, money, fulfilment and delivery in one place." action={<Link to="/admin/orders" className={denseGhost}>Back to orders</Link>}>
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">{pipeline.map((step) => <div key={step.label} className="flex items-center gap-2 rounded-2xl bg-s2 px-3 py-2"><span className="text-[12px] font-semibold text-ink3">{step.label}</span><StatusPill status={step.state} /></div>)}</div>
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Customer"><Link to={`/admin/customers/${order.user.id}`} className="text-acc hover:underline">{order.user.firstName} {order.user.lastName}</Link><span className="block font-mono text-[12px] text-ink3">{order.user.email}</span></Fact>
          <Fact label="Total"><Money amount={order.total} currency={order.currency} />{order.discount > 0 && <span className="block text-[12px] text-ink3">discount <Money amount={order.discount} currency={order.currency} /></span>}</Fact>
          <Fact label="Created">{fmtDateTime(order.createdAt)}<span className="block text-[12px] text-ink3">paid {fmtDateTime(order.paidAt)}</span></Fact>
          <Fact label="Risk">{order.risk ? <Link to={`/admin/customers/${order.user.id}`} className={order.risk.level === 'high' ? 'font-bold text-bad' : 'text-ink'}>{order.risk.score}/100 · {order.risk.level}</Link> : DASH}</Fact>
          <Fact label="Promotion">{order.promotion ? <Link to={`/admin/promotions/${order.promotion.id}`} className="font-mono text-acc hover:underline">{order.promotion.code}</Link> : DASH}</Fact>
          <Fact label="Checkout">{order.stripeCheckoutSessionId ?? DASH}</Fact>
          <Fact label="Payment intent">{order.stripePaymentIntentId ?? DASH}</Fact>
          <Fact label="Billing address">{order.billingAddress ? Object.values(order.billingAddress).filter(Boolean).join(', ') : DASH}</Fact>
        </dl>
      </div>
    </Panel>

    <Panel title="Items and services" description="Every line is tied to its subscription and delivered resource.">
      <ul className="grid gap-2">{order.items.map((item) => <li key={item.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex flex-wrap items-start justify-between gap-3"><div><strong className="text-[14px] text-ink">{item.name} ×{item.quantity}</strong><p className="text-[12.5px] text-ink3">{item.product.slug} · <Money amount={item.total} currency={item.currency} /></p></div><StatusPill status={item.fulfillmentStatus} /></div>{item.fulfillmentError && <p className="mt-2 text-[13px] text-bad">{item.fulfillmentError}</p>}<div className="mt-2 flex flex-wrap gap-2 text-[12.5px]">{item.instances.map((service) => <Link key={service.id} to={`/admin/services/${service.id}`} className="rounded-full bg-s3 px-3 py-1 text-acc">{service.name} · {service.status}</Link>)}{item.vpsService && <span className="rounded-full bg-s3 px-3 py-1">VPS {item.vpsService.name} · {item.vpsService.status}</span>}{item.mailService && <span className="rounded-full bg-s3 px-3 py-1">Mail {item.mailService.domains[0]?.name ?? item.mailService.id} · {item.mailService.status}</span>}{item.subscription && <span className="rounded-full bg-s3 px-3 py-1">Subscription · {item.subscription.status}</span>}</div></li>)}</ul>
    </Panel>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Payments" description="Provider identifiers and failures are visible without opening Stripe.">
        {order.payments.length === 0 ? <EmptyState title="No payment." description="The provider has not attached a payment to this order." /> : <ul className="grid gap-2">{order.payments.map((payment) => <li key={payment.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex justify-between gap-2"><Money amount={payment.amount} currency={payment.currency} /><StatusPill status={payment.status} /></div><p className="mt-1 break-all font-mono text-[11.5px] text-ink3">{payment.stripePaymentIntentId ?? payment.id}</p>{payment.failureMessage && <p className="mt-1 text-[13px] text-bad">{payment.failureMessage}</p>}</li>)}</ul>}
      </Panel>
      <Panel title="Invoices" description="Invoices generated for this order.">
        {order.invoices.length === 0 ? <EmptyState title="No invoice." description="No invoice is linked to this order yet." /> : <ul className="grid gap-2">{order.invoices.map((invoice) => <li key={invoice.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex justify-between gap-2"><span className="font-mono text-[13px] text-ink">{invoice.number}</span><StatusPill status={invoice.status} /></div><div className="mt-1 flex flex-wrap gap-3 text-[12px]"><Money amount={invoice.total} currency={invoice.currency} />{invoice.hostedUrl && <a href={invoice.hostedUrl} target="_blank" rel="noreferrer" className="text-acc">Open provider invoice</a>}{invoice.pdfUrl && <a href={invoice.pdfUrl} target="_blank" rel="noreferrer" className="text-acc">PDF</a>}</div></li>)}</ul>}
      </Panel>
    </div>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Payment webhooks" description="Only Stripe events correlated with this order or its provider identifiers.">
        {order.webhooks.length === 0 ? <EmptyState title="No matching webhook." description="Nothing correlated with this order was found among recent provider events." /> : <ul className="grid gap-2">{order.webhooks.map((event) => <li key={event.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="font-mono text-[12.5px] text-ink">{event.type}</strong><StatusPill status={event.status} /></div><p className="mt-1 text-[12px] text-ink3">{fmtDateTime(event.createdAt)} · {event.attempts} attempt(s)</p>{event.error && <p className="mt-1 text-[13px] text-bad">{event.error}</p>}</li>)}</ul>}
      </Panel>
      <Panel title="Customer notifications" description="Events sent because of this order.">
        {order.events.length === 0 ? <EmptyState title="No matching notification." description="No customer event is correlated with this order." /> : <ul className="grid gap-2">{order.events.map((event) => <li key={event.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="font-mono text-[12.5px] text-ink">{event.type}</strong><StatusPill status={event.state} /></div>{event.lastError && <p className="mt-1 text-[13px] text-bad">{event.lastError}</p>}</li>)}</ul>}
      </Panel>
    </div>

    <Panel title="Audit trail" description="Operator actions connected to this order or customer.">
      {order.audit.length === 0 ? <EmptyState title="No operator action." description="Changes will appear here." /> : <ul className="grid gap-2">{order.audit.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-s2 px-4 py-3"><span className="font-mono text-[12.5px] text-ink">{entry.action}</span><span className="text-[12px] text-ink3">{entry.actorEmail ?? 'system'} · {fmtDateTime(entry.createdAt)}</span></li>)}</ul>}
    </Panel>
  </div>;
}

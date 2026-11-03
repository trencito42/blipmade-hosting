import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Money, Panel, StatusPill } from '../ui-app';
import { denseGhost, fmtDateTime } from './Overview';

interface PromotionControl {
  id: string; code: string; type: string; value: number; maxRedemptions: number | null; maxPerUser: number | null; active: boolean; startsAt: string | null; endsAt: string | null; createdAt: string;
  stats: { redemptions: number; reserved: number; discountGranted: number; revenue: number; uniqueCustomers: number; protectedCards: number };
  redemptions: { id: string; amount: number; cardFingerprintHash: string | null; createdAt: string; user: { id: string; email: string; firstName: string; lastName: string }; order: { id: string; number: string; status: string; total: number; currency: string } }[];
  audit: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
}


export default function PromotionDetail() {
  const { id } = useParams();
  const state = useAsync<{ promotion: PromotionControl }>((signal) => get(`/admin/promotions/${id}`, undefined, signal), [id]);
  if (state.loading && !state.data) return <LoadingBlock rows={7} label="Loading the campaign" />;
  if (state.error || !state.data) return <ErrorState title="The campaign could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />;
  const promotion = state.data.promotion;
  return <div className="grid gap-4">
    <Panel title={promotion.code} description="Campaign control, usage, customers and audit." action={<Link to="/admin/promotions" className={denseGhost}>Back to promotions</Link>}>
      <div className="flex flex-wrap items-center gap-3"><StatusPill status={promotion.active ? 'active' : 'inactive'} /><span className="text-[14px] text-ink2">{promotion.type === 'percent' ? `${promotion.value / 100}% off` : <Money amount={promotion.value} />}</span><span className="text-[12.5px] text-ink3">created {fmtDateTime(promotion.createdAt)}</span></div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">{[
        ['Used', String(promotion.stats.redemptions)], ['Reserved', String(promotion.stats.reserved)], ['Customers', String(promotion.stats.uniqueCustomers)], ['Protected cards', String(promotion.stats.protectedCards)], ['Discount granted', `${(promotion.stats.discountGranted / 100).toFixed(2)} EUR`], ['Revenue', `${(promotion.stats.revenue / 100).toFixed(2)} EUR`],
      ].map(([label, value]) => <div key={label} className="rounded-2xl bg-s2 px-4 py-3"><dt className="font-mono text-[10.5px] uppercase tracking-[.08em] text-ink3">{label}</dt><dd className="mt-1 text-[17px] font-semibold text-ink">{value}</dd></div>)}</dl>
    </Panel>

    <Panel title="Campaign settings" description="The value and code stay immutable after creation." action={<Link to={`/admin/promotions/${encodeURIComponent(promotion.id)}/edit`} className={denseGhost}>Edit settings</Link>}>
      <dl className="grid gap-3 text-[13.5px] sm:grid-cols-4">
        <div><dt className="text-ink3">Total cap</dt><dd className="font-mono text-ink">{promotion.maxRedemptions ?? 'no cap'}</dd></div>
        <div><dt className="text-ink3">Per account</dt><dd className="font-mono text-ink">{promotion.maxPerUser ?? 'no limit'}</dd></div>
        <div><dt className="text-ink3">Starts</dt><dd className="text-ink">{promotion.startsAt ? fmtDateTime(promotion.startsAt) : 'at once'}</dd></div>
        <div><dt className="text-ink3">Ends</dt><dd className="text-ink">{promotion.endsAt ? fmtDateTime(promotion.endsAt) : 'never'}</dd></div>
      </dl>
    </Panel>

    <Panel title="Redemptions" description="The actual paid uses. Card fingerprints are never exposed; only whether protection was recorded.">
      {promotion.redemptions.length === 0 ? <EmptyState title="No redemption yet." description="Paid orders that consume this campaign appear here." /> : <ul className="grid gap-2">{promotion.redemptions.map((redemption) => <li key={redemption.id} className="grid gap-2 rounded-2xl bg-s2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center"><div className="min-w-0"><Link to={`/admin/customers/${redemption.user.id}`} className="block truncate font-semibold text-acc">{redemption.user.firstName} {redemption.user.lastName}</Link><span className="block truncate font-mono text-[11.5px] text-ink3">{redemption.user.email}</span></div><Link to={`/admin/orders/${redemption.order.id}`} className="font-mono text-[12.5px] text-acc">{redemption.order.number}</Link><Money amount={redemption.amount} currency={redemption.order.currency} /><span className="text-[12px] text-ink3">{redemption.cardFingerprintHash ? 'card protected' : 'no card identity'} · {fmtDateTime(redemption.createdAt)}</span></li>)}</ul>}
    </Panel>

    <Panel title="Audit trail" description="Every campaign change and the operator who made it.">
      {promotion.audit.length === 0 ? <EmptyState title="No change recorded." description="Future changes appear here." /> : <ul className="grid gap-2">{promotion.audit.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-s2 px-4 py-3"><span className="font-mono text-[12.5px] text-ink">{entry.action}</span><span className="text-[12px] text-ink3">{entry.actorEmail ?? 'system'} · {fmtDateTime(entry.createdAt)}</span></li>)}</ul>}
    </Panel>

  </div>;
}

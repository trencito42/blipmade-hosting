import { useEffect, useState } from 'react';
import { get, patch } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
import { denseDanger, denseGhost, denseInput, fmtDateTime } from './Overview';

interface PromotionControl {
  id: string; code: string; type: string; value: number; maxRedemptions: number | null; maxPerUser: number | null; active: boolean; startsAt: string | null; endsAt: string | null; createdAt: string;
  stats: { redemptions: number; reserved: number; discountGranted: number; revenue: number; uniqueCustomers: number; protectedCards: number };
  redemptions: { id: string; amount: number; cardFingerprintHash: string | null; createdAt: string; user: { id: string; email: string; firstName: string; lastName: string }; order: { id: string; number: string; status: string; total: number; currency: string } }[];
  audit: { id: string; action: string; actorEmail: string | null; createdAt: string }[];
}

const localValue = (value: string | null) => value ? new Date(value).toISOString().slice(0, 16) : '';
const isoValue = (value: string) => value ? new Date(value).toISOString() : null;

export default function PromotionDetail() {
  const { id } = useParams();
  const toast = useToast();
  const state = useAsync<{ promotion: PromotionControl }>((signal) => get(`/admin/promotions/${id}`, undefined, signal), [id]);
  const [max, setMax] = useState('');
  const [perUser, setPerUser] = useState('');
  const [startsAt, setStartsAt] = useState('');
  const [endsAt, setEndsAt] = useState('');
  const [active, setActive] = useState(false);
  const [confirming, setConfirming] = useState(false);
  const [busy, setBusy] = useState(false);

  useEffect(() => {
    const promotion = state.data?.promotion;
    if (!promotion) return;
    setMax(promotion.maxRedemptions === null ? '' : String(promotion.maxRedemptions));
    setPerUser(promotion.maxPerUser === null ? '' : String(promotion.maxPerUser));
    setStartsAt(localValue(promotion.startsAt)); setEndsAt(localValue(promotion.endsAt)); setActive(promotion.active);
  }, [state.data?.promotion]);

  if (state.loading && !state.data) return <LoadingBlock rows={7} label="Loading the campaign" />;
  if (state.error || !state.data) return <ErrorState title="The campaign could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />;
  const promotion = state.data.promotion;
  const validLimit = (value: string) => value === '' || (/^\d+$/.test(value) && Number(value) >= 1);
  const valid = validLimit(max) && validLimit(perUser) && (!startsAt || !endsAt || Date.parse(endsAt) > Date.parse(startsAt)) && (max === '' || Number(max) >= promotion.stats.reserved);

  const save = async () => {
    setBusy(true);
    try {
      await patch(`/admin/promotions/${promotion.id}`, { maxRedemptions: max === '' ? null : Number(max), maxPerUser: perUser === '' ? null : Number(perUser), startsAt: isoValue(startsAt), endsAt: isoValue(endsAt), active });
      toast.push('Campaign settings saved.', 'ok'); setConfirming(false); state.reload();
    } catch (error) { toast.push(error instanceof Error ? error.message : 'That did not work.', 'error'); }
    finally { setBusy(false); }
  };

  return <div className="grid gap-4">
    <Panel title={promotion.code} description="Campaign control, usage, customers and audit." action={<Link to="/admin/promotions" className={denseGhost}>Back to promotions</Link>}>
      <div className="flex flex-wrap items-center gap-3"><StatusPill status={promotion.active ? 'active' : 'inactive'} /><span className="text-[14px] text-ink2">{promotion.type === 'percent' ? `${promotion.value / 100}% off` : <Money amount={promotion.value} />}</span><span className="text-[12.5px] text-ink3">created {fmtDateTime(promotion.createdAt)}</span></div>
      <dl className="mt-4 grid gap-2 sm:grid-cols-2 xl:grid-cols-6">{[
        ['Used', String(promotion.stats.redemptions)], ['Reserved', String(promotion.stats.reserved)], ['Customers', String(promotion.stats.uniqueCustomers)], ['Protected cards', String(promotion.stats.protectedCards)], ['Discount granted', `${(promotion.stats.discountGranted / 100).toFixed(2)} EUR`], ['Revenue', `${(promotion.stats.revenue / 100).toFixed(2)} EUR`],
      ].map(([label, value]) => <div key={label} className="rounded-2xl bg-s2 px-4 py-3"><dt className="font-mono text-[10.5px] uppercase tracking-[.08em] text-ink3">{label}</dt><dd className="mt-1 text-[17px] font-semibold text-ink">{value}</dd></div>)}</dl>
    </Panel>

    <Panel title="Campaign settings" description="The value and code stay immutable after creation. Limits, availability and schedule remain manageable.">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Total redemption cap" htmlFor="campaign-cap" hint={`At least ${promotion.stats.reserved}, or empty for no cap.`}><input id="campaign-cap" className={denseInput} inputMode="numeric" value={max} onChange={(event) => setMax(event.target.value)} /></Field>
        <Field label="Limit per account" htmlFor="campaign-per-user" hint="Empty means no account limit. Card identity still protects 100% campaigns."><input id="campaign-per-user" className={denseInput} inputMode="numeric" value={perUser} onChange={(event) => setPerUser(event.target.value)} /></Field>
        <Field label="Starts at" htmlFor="campaign-start"><input id="campaign-start" type="datetime-local" className={denseInput} value={startsAt} onChange={(event) => setStartsAt(event.target.value)} /></Field>
        <Field label="Ends at" htmlFor="campaign-end"><input id="campaign-end" type="datetime-local" className={denseInput} value={endsAt} onChange={(event) => setEndsAt(event.target.value)} /></Field>
      </div>
      <div className="mt-3 flex flex-wrap gap-2"><button type="button" aria-pressed={active} onClick={() => setActive((value) => !value)} className={active ? denseGhost : denseDanger}>{active ? 'Active — click to pause' : 'Paused — click to activate'}</button><button type="button" disabled={!valid || busy} className={denseGhost} onClick={() => setConfirming(true)}>Review changes</button></div>
      {!valid && <p className="mt-2 text-[13px] text-bad">Use positive whole-number limits, keep the cap above current reservations, and make the end later than the start.</p>}
    </Panel>

    <Panel title="Redemptions" description="The actual paid uses. Card fingerprints are never exposed; only whether protection was recorded.">
      {promotion.redemptions.length === 0 ? <EmptyState title="No redemption yet." description="Paid orders that consume this campaign appear here." /> : <ul className="grid gap-2">{promotion.redemptions.map((redemption) => <li key={redemption.id} className="grid gap-2 rounded-2xl bg-s2 px-4 py-3 lg:grid-cols-[minmax(0,1fr)_auto_auto_auto] lg:items-center"><div className="min-w-0"><Link to={`/admin/customers/${redemption.user.id}`} className="block truncate font-semibold text-acc">{redemption.user.firstName} {redemption.user.lastName}</Link><span className="block truncate font-mono text-[11.5px] text-ink3">{redemption.user.email}</span></div><Link to={`/admin/orders/${redemption.order.id}`} className="font-mono text-[12.5px] text-acc">{redemption.order.number}</Link><Money amount={redemption.amount} currency={redemption.order.currency} /><span className="text-[12px] text-ink3">{redemption.cardFingerprintHash ? 'card protected' : 'no card identity'} · {fmtDateTime(redemption.createdAt)}</span></li>)}</ul>}
    </Panel>

    <Panel title="Audit trail" description="Every campaign change and the operator who made it.">
      {promotion.audit.length === 0 ? <EmptyState title="No change recorded." description="Future changes appear here." /> : <ul className="grid gap-2">{promotion.audit.map((entry) => <li key={entry.id} className="flex flex-wrap justify-between gap-2 rounded-2xl bg-s2 px-4 py-3"><span className="font-mono text-[12.5px] text-ink">{entry.action}</span><span className="text-[12px] text-ink3">{entry.actorEmail ?? 'system'} · {fmtDateTime(entry.createdAt)}</span></li>)}</ul>}
    </Panel>

    <ConfirmDialog open={confirming} title={`Save ${promotion.code}?`} description={`The campaign will be ${active ? 'active' : 'paused'}, with ${max || 'no'} total cap and ${perUser || 'no'} per-account limit.`} confirmLabel="Save campaign" busy={busy} onCancel={() => setConfirming(false)} onConfirm={() => void save()} />
  </div>;
}

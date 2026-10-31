import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link, useParams } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Money, Panel, StatusPill, useToast } from '../ui-app';
import { ConfirmWithReason, DASH, denseDanger, denseGhost, denseInput, fmtDateTime } from './Overview';

interface ServiceControl {
  id: string; name: string; status: string; ram: number; cpu: number; disk: number; price: number; currency: string;
  createdAt: string; updatedAt: string; pterodactylServerId: number | null; pterodactylUuid: string | null; pterodactylAllocation: number | null;
  provisionStep: string | null; provisionError: string | null; runtimeState: string | null; runtimeCondition: string | null; runtimeStateCheckedAt: string | null; runtimeStateStale: boolean;
  user: { id: string; email: string; firstName: string; lastName: string; suspendedAt: string | null };
  product: { name: string; slug: string; category: string };
  order: { id: string; number: string; status: string; total: number; currency: string } | null;
  subscription: { id: string; status: string; amount: number; currency: string; currentPeriodEnd: string | null; cancelAtPeriodEnd: boolean } | null;
  panel: { databases: number; backups: number; allocations: number; suspended: boolean } | null; panelError: string | null;
  uptime: { checks: number; up: number; percent: number | null };
  risk: { score: number; level: string; signals: { id: string; text: string; weight: number }[] } | null;
  events: { id: string; type: string; message: string; createdAt: string }[];
  audit: { id: string; action: string; actorEmail: string | null; meta: unknown; createdAt: string }[];
  tickets: { id: string; number: number; subject: string; status: string; createdAt: string }[];
  abuse: { id: string; category: string; target: string; status: string; createdAt: string }[];
}

const retryable = new Set(['pending', 'provisioning', 'failed', 'degraded']);

function Fact({ label, children }: { label: string; children: React.ReactNode }) {
  return <div className="min-w-0 rounded-2xl bg-s2 px-4 py-3"><dt className="font-mono text-[11px] uppercase tracking-[.08em] text-ink3">{label}</dt><dd className="mt-1 break-words text-[14px] text-ink">{children}</dd></div>;
}

export default function ServiceDetail() {
  const { id } = useParams();
  const toast = useToast();
  const state = useAsync<{ service: ServiceControl }>((signal) => get(`/admin/services/${id}`, undefined, signal), [id]);
  const [busy, setBusy] = useState(false);
  const [action, setAction] = useState<'retry' | 'suspend' | 'resume' | 'reinstall' | null>(null);
  const [reason, setReason] = useState('');
  const [databases, setDatabases] = useState('');
  const [databaseReason, setDatabaseReason] = useState('');
  const run = async (work: () => Promise<unknown>, message: string) => {
    setBusy(true);
    try { await work(); toast.push(message, 'ok'); state.reload(); }
    catch (error) { toast.push(error instanceof Error ? error.message : 'That did not work.', 'error'); }
    finally { setBusy(false); }
  };

  if (state.loading && !state.data) return <LoadingBlock rows={8} label="Loading the service control centre" />;
  if (state.error || !state.data) return <ErrorState title="The service could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />;
  const service = state.data.service;
  const suspended = service.status === 'suspended' || service.panel?.suspended;

  return <div className="grid gap-4">
    <Panel title={service.name} description={`${service.product.name} · control centre`} action={<Link to="/admin/services" className={denseGhost}>Back to services</Link>}>
      <div className="grid gap-3">
        <div className="flex flex-wrap items-center gap-2"><StatusPill status={service.status} /><span className="font-mono text-[12.5px] text-ink3">{service.id}</span>{service.risk && <Link to={`/admin/customers/${service.user.id}`} className={service.risk.level === 'high' ? 'rounded-full bg-bad/15 px-3 py-1 text-[12px] font-bold text-bad' : 'rounded-full bg-s3 px-3 py-1 text-[12px] font-bold text-ink2'}>Risk {service.risk.score}/100</Link>}</div>
        <dl className="grid gap-2 sm:grid-cols-2 xl:grid-cols-4">
          <Fact label="Customer"><Link to={`/admin/customers/${service.user.id}`} className="text-acc hover:underline">{service.user.firstName} {service.user.lastName}</Link><span className="block font-mono text-[12px] text-ink3">{service.user.email}</span></Fact>
          <Fact label="Resources">{service.ram} MB · {service.cpu} vCPU · {service.disk} GB</Fact>
          <Fact label="Runtime">{service.runtimeCondition ?? service.runtimeState ?? DASH}{service.runtimeStateStale && <span className="block text-warn">stale</span>}<span className="block text-[12px] text-ink3">{fmtDateTime(service.runtimeStateCheckedAt)}</span></Fact>
          <Fact label="Price"><Money amount={service.price} currency={service.currency} period="month" /></Fact>
          <Fact label="Panel">Server #{service.pterodactylServerId ?? DASH}<span className="block font-mono text-[12px] text-ink3">allocation {service.pterodactylAllocation ?? DASH}</span></Fact>
          <Fact label="Provisioning">{service.provisionStep ?? 'No active step'}{service.provisionError && <span className="block text-bad">{service.provisionError}</span>}</Fact>
          <Fact label="Uptime">{service.uptime.percent === null ? DASH : `${service.uptime.percent}%`}<span className="block text-[12px] text-ink3">{service.uptime.up}/{service.uptime.checks} recent checks</span></Fact>
          <Fact label="Billing">{service.subscription ? <><StatusPill status={service.subscription.status} /><span className="ml-2"><Money amount={service.subscription.amount} currency={service.subscription.currency} period="month" /></span></> : 'No subscription'}</Fact>
        </dl>
      </div>
    </Panel>

    <Panel title="Management" description="Actions are state-aware. Destructive changes require confirmation and are written to the audit log.">
      <div className="grid gap-4">
        <div className="flex flex-wrap gap-2">
          {retryable.has(service.status) && <button type="button" className={denseGhost} disabled={busy} onClick={() => { setReason(''); setAction('retry'); }}>Retry provisioning</button>}
          {service.pterodactylServerId && <button type="button" className={denseGhost} disabled={busy} onClick={() => { setReason(''); setAction(suspended ? 'resume' : 'suspend'); }}>{suspended ? 'Resume service' : 'Suspend service'}</button>}
          {service.pterodactylServerId && <button type="button" className={denseDanger} disabled={busy} onClick={() => { setReason(''); setAction('reinstall'); }}>Reinstall</button>}
        </div>
        {service.panel && <div className="grid gap-2 rounded-2xl bg-s2 p-4 sm:grid-cols-[minmax(0,1fr)_9rem_minmax(12rem,1fr)_auto] sm:items-end">
          <p className="text-[13.5px] text-ink2">Panel limits: {service.panel.databases} databases · {service.panel.backups} backups · {service.panel.allocations} allocations.</p>
          <label className="grid gap-1 text-[12.5px] font-medium text-ink">Database limit<input className={denseInput} inputMode="numeric" value={databases} onChange={(event) => setDatabases(event.target.value)} placeholder={String(service.panel.databases)} /></label>
          <label className="grid gap-1 text-[12.5px] font-medium text-ink">Reason<input className={denseInput} value={databaseReason} onChange={(event) => setDatabaseReason(event.target.value)} placeholder="Customer plan change" /></label>
          <button type="button" className={denseGhost} disabled={busy || !/^\d+$/.test(databases) || Number(databases) > 20 || databaseReason.trim().length < 3} onClick={() => void run(() => post(`/admin/instances/${service.id}/database-limit`, { databases: Number(databases), reason: databaseReason.trim() }), 'Database limit updated.')}>Save limit</button>
        </div>}
        {service.panelError && <p className="rounded-2xl bg-warn/10 px-4 py-3 text-[13px] text-warn">Panel live data unavailable: {service.panelError}</p>}
      </div>
    </Panel>

    <div className="grid gap-4 xl:grid-cols-2">
      <Panel title="Commercial chain" description="The sale and contract behind this service.">
        <dl className="grid gap-2">
          <Fact label="Order">{service.order ? <Link className="text-acc hover:underline" to={`/admin/orders/${service.order.id}`}>{service.order.number}</Link> : DASH}</Fact>
          <Fact label="Subscription">{service.subscription?.id ?? DASH}<span className="block text-[12px] text-ink3">period end {fmtDateTime(service.subscription?.currentPeriodEnd)}</span></Fact>
        </dl>
      </Panel>
      <Panel title="Safety and support" description="Risk, reports and tickets connected to this service.">
        <div className="grid gap-2 text-[13.5px] text-ink2"><p>{service.abuse.length} abuse report(s) · {service.tickets.length} ticket(s).</p>{service.tickets.map((ticket) => <Link key={ticket.id} to={`/admin/tickets?ticket=${ticket.id}`} className="rounded-2xl bg-s2 px-4 py-2 hover:bg-s3">#{ticket.number} · {ticket.subject} <StatusPill status={ticket.status} /></Link>)}</div>
      </Panel>
    </div>

    <Panel title="Timeline" description="Service events and operator actions, newest first.">
      {service.events.length + service.audit.length === 0 ? <EmptyState title="No event yet." description="Provisioning and operator actions will appear here." /> : <ul className="grid gap-2">{[
        ...service.events.map((entry) => ({ id: `e-${entry.id}`, at: entry.createdAt, title: entry.type, body: entry.message })),
        ...service.audit.map((entry) => ({ id: `a-${entry.id}`, at: entry.createdAt, title: entry.action, body: entry.actorEmail ?? 'system' })),
      ].sort((a, b) => Date.parse(b.at) - Date.parse(a.at)).map((entry) => <li key={entry.id} className="rounded-2xl bg-s2 px-4 py-3"><div className="flex flex-wrap justify-between gap-2"><strong className="text-[13.5px] text-ink">{entry.title}</strong><span className="text-[12px] text-ink3">{fmtDateTime(entry.at)}</span></div><p className="mt-1 text-[13px] text-ink2">{entry.body}</p></li>)}</ul>}
    </Panel>

    <ConfirmWithReason open={action !== null} title={action === 'retry' ? `Retry provisioning for ${service.name}?` : action === 'reinstall' ? `Reinstall ${service.name}?` : action === 'resume' ? `Resume ${service.name}?` : `Suspend ${service.name}?`} description={action === 'retry' ? 'Only the incomplete idempotent provisioning steps are queued again.' : action === 'reinstall' ? 'This erases the files in the container and installs the service again.' : 'The panel state and the platform record are changed together.'} confirmLabel={action === 'retry' ? 'Retry provisioning' : action === 'reinstall' ? 'Reinstall' : action === 'resume' ? 'Resume service' : 'Suspend service'} reasonLabel="Reason for the audit log" reason={reason} onReasonChange={setReason} onCancel={() => setAction(null)} busy={busy} error={reason.trim().length < 3 ? 'Write a reason of at least three characters.' : null} onConfirm={() => { if (!action || reason.trim().length < 3) return; const chosen = action; setAction(null); if (chosen === 'retry') void run(() => post(`/admin/instances/${service.id}/retry`, { reason: reason.trim() }), 'Provisioning queued.'); else if (chosen === 'reinstall') void run(() => post(`/admin/instances/${service.id}/reinstall`, { confirm: true, reason: reason.trim() }), 'Reinstall requested.'); else void run(() => post(`/admin/instances/${service.id}/suspend`, { suspended: chosen === 'suspend', reason: reason.trim() }), chosen === 'suspend' ? 'Service suspended.' : 'Service resumed.'); }} />
  </div>;
}

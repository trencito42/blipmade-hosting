import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { LoadingBlock, Panel, StatusPill } from '../ui-app';
import { fmtDateTime } from './Overview';

/**
 * The customer beside the thread: who they are, their services, their other conversations, the clocks of this one and, for
 * a role that may read orders, their last invoices. It is a summary of what the platform holds and carries no secret.
 */

interface Context {
  customer: { id: string; name: string; email: string; verified: boolean; suspended: boolean; since: string };
  conversation: { channel: string; priority: string; status: string; department: string | null; assignedTo: string | null; relatedInstance: { name: string; status: string; product: string } | null; sla: Record<'first' | 'next' | 'resolution', { state: string; dueAt: string | null }> };
  services: { kind: string; id: string; name: string; product: string; status: string }[];
  recent: { id: string; number: number; subject: string; status: string; channel: string }[];
  billing: { number: string; status: string; total: number; currency: string }[] | null;
}

const money = (cents: number, currency: string) => new Intl.NumberFormat('en', { style: 'currency', currency }).format(cents / 100);

export function ContextPanel({ ticketId }: { ticketId: string }) {
  const context = useAsync((signal) => get<Context>(`/admin/support/conversations/${ticketId}/context`, undefined, signal), [ticketId]);
  if (context.loading && !context.data) return <LoadingBlock rows={2} label="Loading the customer" />;
  if (context.error || !context.data) return null;
  const c = context.data;
  const clocks = Object.entries(c.conversation.sla).filter(([, clock]) => clock.state !== 'none');
  return (
    <Panel title="The customer" description={`${c.customer.name} · ${c.customer.email}`}>
      <div className="grid gap-3 text-[13.5px]">
        <p className="text-ink2">
          Customer since {fmtDateTime(c.customer.since)} · {c.customer.verified ? 'email verified' : 'email not verified'}{c.customer.suspended ? ' · account suspended' : ''}
        </p>
        <p className="text-ink2">
          {c.conversation.channel} · priority {c.conversation.priority} · {c.conversation.department ?? 'no department'} · {c.conversation.assignedTo ?? 'unassigned'}
        </p>
        {clocks.length > 0 && (
          <ul className="flex flex-wrap gap-2" aria-label="Answer time">
            {clocks.map(([name, clock]) => (
              <li key={name} className="flex items-center gap-1.5 text-ink2">
                <span className="capitalize">{name === 'first' ? 'First answer' : name === 'next' ? 'Next answer' : 'Resolution'}</span>
                <StatusPill status={clock.state === 'breached' ? 'late' : clock.state === 'at_risk' ? 'at risk' : clock.state === 'met' ? 'met' : 'on time'} />
                {clock.dueAt && <span className="font-mono text-[12px] text-ink3">{fmtDateTime(clock.dueAt)}</span>}
              </li>
            ))}
          </ul>
        )}
        {c.conversation.relatedInstance && <p className="text-ink2">About: {c.conversation.relatedInstance.name} ({c.conversation.relatedInstance.product}), {c.conversation.relatedInstance.status}</p>}
        {c.services.length > 0 && (
          <div>
            <p className="mb-1 font-semibold text-ink">Services</p>
            <ul className="grid gap-0.5 text-ink2">
              {c.services.map((service) => <li key={`${service.kind}-${service.id}`}>{service.name} · {service.product} · {service.status}</li>)}
            </ul>
          </div>
        )}
        {c.recent.length > 0 && (
          <div>
            <p className="mb-1 font-semibold text-ink">Other conversations</p>
            <ul className="grid gap-0.5 text-ink2">
              {c.recent.map((row) => <li key={row.id}><a className="underline" href={`/admin/tickets?ticket=${row.id}`}>#{row.number} {row.subject}</a> · {row.status}</li>)}
            </ul>
          </div>
        )}
        {c.billing && (
          <div>
            <p className="mb-1 font-semibold text-ink">Last invoices</p>
            {c.billing.length === 0 ? <p className="text-ink2">None.</p> : <ul className="grid gap-0.5 text-ink2">{c.billing.map((row) => <li key={row.number}>{row.number} · {row.status} · {money(row.total, row.currency)}</li>)}</ul>}
          </div>
        )}
      </div>
    </Panel>
  );
}

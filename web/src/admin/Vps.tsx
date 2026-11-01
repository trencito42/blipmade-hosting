import { useState } from 'react';
import { del, get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { memLabel } from '../lib/pricing';
import { Link } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill, useToast } from '../ui-app';
import { can, denseDanger, denseGhost, fmtDate, useAdminSession } from './Overview';

/**
 * Virtual private servers, for the staff: every server of the platform, with the owner,
 * the slot on the hypervisor and the actions that need no customer: power, build again,
 * reinstall and delete. Each action is written to the audit log.
 */
interface AdminVps {
  id: string;
  name: string;
  status: string;
  power: 'running' | 'stopped' | 'unknown';
  plan: { slug: string; name: string };
  ram: number;
  cpu: number;
  disk: number;
  publicIp: string | null;
  sshPort: number | null;
  dedicatedIp: boolean;
  lastError: string | null;
  createdAt: string;
  owner: { id: string; email: string };
  slot: number;
  vmid: number | null;
  privateIp: string | null;
}

interface Usage {
  cpuPercent: number;
  cpus: number;
  memoryUsed: number;
  memoryTotal: number;
  uptimeSeconds: number;
  networkIn: number;
  networkOut: number;
}

const mb = (n: number) => `${Math.round(n / 1024 / 1024)} MB`;

function UsageLine({ id }: { id: string }) {
  const state = useAsync<{ usage: Usage }>((signal) => get<{ usage: Usage }>(`/admin/vps/${id}/usage`, undefined, signal), [id]);
  if (state.error) return <p className="text-[12.5px] text-ink3">Usage is not available: {state.error.message}</p>;
  const u = state.data?.usage;
  if (!u) return <p className="text-[12.5px] text-ink3">Reading the usage…</p>;
  return (
    <p className="font-mono text-[12.5px] text-ink2">
      CPU {u.cpuPercent}% of {u.cpus} · memory {mb(u.memoryUsed)} of {mb(u.memoryTotal)} · up {Math.floor(u.uptimeSeconds / 3600)} h · in {mb(u.networkIn)} · out {mb(u.networkOut)}
    </p>
  );
}

interface PlanQuote {
  currency: string;
  from: { name: string; amount: number; ram: number; cpu: number; disk: number };
  to: { name: string; amount: number; ram: number; cpu: number; disk: number };
  delta: number;
  billedNow: number | null;
  blocked: string | null;
  takesEffect: string;
}

const money = (cents: number, currency: string) => `${(cents / 100).toFixed(2)} ${currency}`;

/**
 * The commercial change of plan. The price is asked from the server first and shown; the server
 * moves to the new plan and the subscription moves to its price in one operation.
 */
function PlanChange({ server, onDone }: { server: AdminVps; onDone: () => void }) {
  const toast = useToast();
  const plans = useAsync<{ plans: { slug: string; name: string; cpu: number; ram: number; disk: number }[] }>((signal) => get('/vps/plans', undefined, signal), []);
  const [slug, setSlug] = useState('');
  const [quote, setQuote] = useState<PlanQuote | null>(null);
  const [busy, setBusy] = useState(false);
  const options = (plans.data?.plans ?? []).filter((plan) => plan.slug !== server.plan.slug && plan.disk >= server.disk);

  const choose = (value: string) => {
    setSlug(value);
    setQuote(null);
    if (!value) return;
    get<{ quote: PlanQuote }>(`/admin/vps/${server.id}/plan-quote`, { slug: value })
      .then((result) => setQuote(result.quote))
      .catch((failure: Error) => toast.push(failure.message, 'error'));
  };

  return (
    <span className="inline-flex flex-wrap items-center gap-1.5">
      <select aria-label={`Plan for ${server.name}`} value={slug} onChange={(event) => choose(event.target.value)} className={`${denseGhost} w-auto`}>
        <option value="">Change plan…</option>
        {options.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name} · {plan.cpu} vCPU · {memLabel(plan.ram)} · {plan.disk} GB</option>)}
      </select>
      {quote && (
        <span role="status" className="text-[12.5px] text-ink2">
          {quote.blocked ?? `${money(quote.from.amount, quote.currency)} → ${money(quote.to.amount, quote.currency)} a month (${quote.delta >= 0 ? '+' : ''}${money(quote.delta, quote.currency)}), from the next renewal.`}
        </span>
      )}
      {quote && !quote.blocked && (
        <button type="button" className={denseDanger} disabled={busy} onClick={() => {
          setBusy(true);
          post(`/admin/vps/${server.id}/plan`, { slug, expectedAmount: quote.to.amount })
            .then(() => { toast.push('The plan and the subscription were changed. Restart the server to use the new processor and memory.', 'ok'); setSlug(''); setQuote(null); onDone(); })
            .catch((failure: Error) => toast.push(failure.message, 'error'))
            .finally(() => setBusy(false));
        }}>Change plan and price</button>
      )}
    </span>
  );
}

/**
 * The administrative adjustment: resources without a change of the bill. It asks for a reason and for
 * the explicit statement that it is free, and the server keeps the record.
 */
function FreeAdjustment({ server, onDone }: { server: AdminVps; onDone: () => void }) {
  const toast = useToast();
  const [open, setOpen] = useState(false);
  const [ram, setRam] = useState(String(server.ram));
  const [cpu, setCpu] = useState(String(server.cpu));
  const [disk, setDisk] = useState(String(server.disk));
  const [reason, setReason] = useState('');
  const [free, setFree] = useState(false);
  const [busy, setBusy] = useState(false);
  if (!open) return <button type="button" className={denseGhost} onClick={() => setOpen(true)}>Adjust resources (free)</button>;
  const field = 'w-20 rounded-lg bg-s2 px-2 py-1 text-[13px]';
  return (
    <form
      className="grid w-full gap-2 rounded-2xl bg-s2 p-3 text-[13px]"
      onSubmit={(event) => {
        event.preventDefault();
        setBusy(true);
        post(`/admin/vps/${server.id}/resources`, { ram: Number(ram), cpu: Number(cpu), disk: Number(disk), reason, freeOverride: true })
          .then(() => { toast.push('The resources were adjusted. The bill was not changed. Restart the server to use the new processor and memory.', 'ok'); setOpen(false); onDone(); })
          .catch((failure: Error) => toast.push(failure.message, 'error'))
          .finally(() => setBusy(false));
      }}
    >
      <p className="text-ink2">This changes the size of the server and not the bill. The customer is never charged for it, and the reason is kept on the server.</p>
      <div className="flex flex-wrap items-center gap-2">
        <label>Memory MB <input aria-label="Memory in MB" className={field} type="number" min={256} value={ram} onChange={(event) => setRam(event.target.value)} /></label>
        <label>vCPU <input aria-label="vCPU" className={field} type="number" min={1} value={cpu} onChange={(event) => setCpu(event.target.value)} /></label>
        <label>Disk GB <input aria-label="Disk in GB" className={field} type="number" min={server.disk} value={disk} onChange={(event) => setDisk(event.target.value)} /></label>
      </div>
      <label className="grid gap-1">Reason (at least 10 characters)
        <input aria-label="Reason" className="rounded-lg bg-s1 px-2 py-1" value={reason} onChange={(event) => setReason(event.target.value)} minLength={10} maxLength={500} required />
      </label>
      <label className="flex items-center gap-2"><input type="checkbox" checked={free} onChange={(event) => setFree(event.target.checked)} /> I understand this is free and the price does not change.</label>
      <div className="flex gap-2">
        <button type="submit" className={denseDanger} disabled={busy || !free || reason.trim().length < 10}>Apply the adjustment</button>
        <button type="button" className={denseGhost} onClick={() => setOpen(false)}>Cancel</button>
      </div>
    </form>
  );
}

export default function AdminVpsPage() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'services.write');
  const toast = useToast();
  const state = useAsync<{ servers: AdminVps[] }>((signal) => get<{ servers: AdminVps[] }>('/admin/vps', undefined, signal), []);
  const [confirm, setConfirm] = useState<{ kind: 'reinstall' | 'destroy'; server: AdminVps } | null>(null);
  const [busy, setBusy] = useState<string | null>(null);

  const run = async (key: string, work: () => Promise<unknown>, message: string) => {
    setBusy(key);
    try {
      await work();
      toast.push(message, 'ok');
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(null);
    }
  };

  const servers = state.data?.servers ?? [];
  return (
    <div className="grid gap-4">
      <Panel title="Servers" description="Every virtual private server of the platform.">
        {state.loading && !state.data ? (
          <LoadingBlock rows={3} label="Loading the servers" />
        ) : state.error ? (
          <ErrorState title="The servers could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : servers.length === 0 ? (
          <EmptyState title="No server yet" description="Servers appear here when a customer orders one." />
        ) : (
          <ul className="grid gap-3">
            {servers.map((server) => (
              <li key={server.id} className="grid gap-2 rounded-2xl bg-s2 p-4">
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-[15.5px] font-bold text-ink">{server.name}</p>
                    <p className="text-[13px] text-ink3">
                      {server.plan.name} · {server.cpu} vCPU · {memLabel(server.ram)} · {server.disk} GB · {server.publicIp ?? 'no address'}
                      {server.sshPort ? `:${server.sshPort}` : ''} · VM {server.vmid ?? '—'} · {server.privateIp ?? '—'}
                    </p>
                    <p className="text-[13px] text-ink3">
                      <Link to={`/admin/customers/${server.owner.id}`} className="text-acc hover:underline">{server.owner.email}</Link> · {fmtDate(server.createdAt)}
                    </p>
                  </div>
                  <StatusPill status={server.status} label={`${server.status}${server.power !== 'unknown' ? ` · ${server.power}` : ''}`} />
                </div>
                {server.lastError && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">{server.lastError}</p>}
                {server.status === 'active' && server.power === 'running' && <UsageLine id={server.id} />}
                {mayWrite && (
                  <div className="flex flex-wrap gap-2">
                    {server.status === 'active' && (
                      <>
                        <button type="button" className={denseGhost} disabled={busy !== null || server.power === 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'start' }), 'Starting.')}>Start</button>
                        <button type="button" className={denseGhost} disabled={busy !== null || server.power !== 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'reboot' }), 'Restarting.')}>Restart</button>
                        <button type="button" className={denseGhost} disabled={busy !== null || server.power !== 'running'} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/power`, { action: 'stop' }), 'Stopped.')}>Force stop</button>
                        <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => setConfirm({ kind: 'reinstall', server })}>Reinstall</button>
                      </>
                    )}
                    {(server.status === 'failed' || server.status === 'pending') && (
                      <button type="button" className={denseGhost} disabled={busy !== null} onClick={() => void run(server.id, () => post(`/admin/vps/${server.id}/retry`), 'Build queued again.')}>Build again</button>
                    )}
                    {server.status === 'active' && can(session.staff, 'pricing.write') && <PlanChange server={server} onDone={state.reload} />}
                    {server.status === 'active' && can(session.staff, 'pricing.write') && <FreeAdjustment server={server} onDone={state.reload} />}
                    {server.status !== 'cancelled' && (
                      <button type="button" className={denseDanger} disabled={busy !== null} onClick={() => setConfirm({ kind: 'destroy', server })}>Delete the machine</button>
                    )}
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ConfirmDialog
        open={confirm !== null}
        title={confirm?.kind === 'destroy' ? 'Delete this machine?' : 'Reinstall this server?'}
        description={
          confirm?.kind === 'destroy'
            ? 'The machine and its disk are deleted and the address is freed. The subscription is not cancelled here: cancel it on the billing of the customer.'
            : 'Everything on its disk is deleted and the server is built again.'
        }
        confirmLabel={confirm?.kind === 'destroy' ? 'Delete' : 'Reinstall'}
        requireText={confirm?.server.name}
        onCancel={() => setConfirm(null)}
        onConfirm={() => {
          const current = confirm;
          setConfirm(null);
          if (!current) return;
          void run(
            current.server.id,
            () => (current.kind === 'destroy' ? del(`/admin/vps/${current.server.id}`, { confirm: true }) : post(`/admin/vps/${current.server.id}/reinstall`, { confirm: true })),
            current.kind === 'destroy' ? 'The machine was deleted.' : 'The server is being built again.',
          );
        }}
      />
    </div>
  );
}

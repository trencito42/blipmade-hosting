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

/** Moves the server to another plan on the hypervisor. The price the customer pays is not changed here. */
function PlanChange({ server, onDone }: { server: AdminVps; onDone: () => void }) {
  const toast = useToast();
  const plans = useAsync<{ plans: { slug: string; name: string; cpu: number; ram: number; disk: number }[] }>((signal) => get('/vps/plans', undefined, signal), []);
  const [slug, setSlug] = useState('');
  const [busy, setBusy] = useState(false);
  const options = (plans.data?.plans ?? []).filter((plan) => plan.slug !== server.plan.slug && plan.disk >= server.disk);
  return (
    <span className="inline-flex items-center gap-1.5">
      <select aria-label={`Plan for ${server.name}`} value={slug} onChange={(event) => setSlug(event.target.value)} className={`${denseGhost} w-auto`}>
        <option value="">Change plan…</option>
        {options.map((plan) => <option key={plan.slug} value={plan.slug}>{plan.name} · {plan.cpu} vCPU · {memLabel(plan.ram)} · {plan.disk} GB</option>)}
      </select>
      {slug && (
        <button type="button" className={denseDanger} disabled={busy} onClick={() => {
          setBusy(true);
          post(`/admin/vps/${server.id}/plan`, { slug })
            .then(() => { toast.push('The plan was changed. Restart the server to use the new processor and memory. The price was not changed.', 'ok'); setSlug(''); onDone(); })
            .catch((failure: Error) => toast.push(failure.message, 'error'))
            .finally(() => setBusy(false));
        }}>Apply</button>
      )}
    </span>
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
                    {server.status === 'active' && <PlanChange server={server} onDone={state.reload} />}
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

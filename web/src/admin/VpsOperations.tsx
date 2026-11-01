import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, useToast } from '../ui-app';
import { denseGhost, denseDanger } from './Overview';

/**
 * The two reads that keep a VPS honest: the allocations (services, slots and Proxmox side by side) and
 * the billing check (servers whose size and bill disagree). Both only read. The one write quarantines
 * slots in the ledger and never touches a machine.
 */

interface Report {
  orphans: { vmid: number; name: string }[];
  foreignInRange: { vmid: number; name: string }[];
  missing: { id: string; vmid: number; status: string }[];
  unledgered: { id: string; slot: number }[];
  poolUnavailable: string | null;
  quarantined: number[];
  capacity: { used: number; max: number };
}

export function VpsAllocations({ mayWrite }: { mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ report: Report; ledger: { slot: number; state: string; note: string | null }[] }>((signal) => get('/admin/vps/allocations', undefined, signal), []);
  const [busy, setBusy] = useState(false);
  const report = state.data?.report;
  const problems = report ? report.orphans.length + report.foreignInRange.length + report.missing.length + report.unledgered.length : 0;
  return (
    <Panel title="Allocations" description="Slots, services and Proxmox compared. Nothing here changes a machine.">
      {state.loading ? <LoadingBlock rows={2} label="Reading the allocations" /> : state.error || !report ? <ErrorState title="The allocations could not be read" message={state.error?.message ?? 'No answer.'} onRetry={state.reload} /> : (
        <div className="grid gap-2 text-[13px] text-ink2">
          <p><strong className="text-ink">{report.capacity.used} of {report.capacity.max}</strong> slots used. {report.quarantined.length ? `Quarantined: ${report.quarantined.join(', ')}.` : 'No slot is quarantined.'}</p>
          {report.poolUnavailable && <p role="alert" className="text-bad">The pool of Proxmox cannot be listed (the token needs Pool.Audit on /pool/vps), so unknown machines cannot be found. {report.poolUnavailable}</p>}
          {problems === 0 && !report.poolUnavailable && <p>Everything matches.</p>}
          {report.missing.map((row) => <p key={row.id}>Server {row.id} is {row.status.toLowerCase()} and its machine {row.vmid} is not on Proxmox.</p>)}
          {report.orphans.map((row) => <p key={row.vmid}>Machine {row.vmid} ({row.name}) carries our tag and belongs to no service.</p>)}
          {report.foreignInRange.map((row) => <p key={row.vmid}>Machine {row.vmid} ({row.name}) is in our range and is not ours.</p>)}
          {report.unledgered.map((row) => <p key={row.id}>Slot {row.slot} of server {row.id} is missing from the ledger.</p>)}
          <div className="flex gap-2">
            <button type="button" className={denseGhost} onClick={state.reload}>Read again</button>
            {mayWrite && problems > 0 && (
              <button type="button" className={denseDanger} disabled={busy} onClick={() => { setBusy(true); post('/admin/vps/allocations/reconcile').then(() => { toast.push('The ledger was updated. No machine was touched.', 'ok'); state.reload(); }).catch((failure: Error) => toast.push(failure.message, 'error')).finally(() => setBusy(false)); }}>Quarantine the unknown slots</button>
            )}
          </div>
        </div>
      )}
    </Panel>
  );
}

export function VpsBillingCheck() {
  const state = useAsync<{ mismatches: { serviceId: string; kind: string; detail: string }[] }>((signal) => get('/admin/vps-billing-check', undefined, signal), []);
  return (
    <Panel title="Billing check" description="Servers whose size or bill does not agree with their plan. A size given on purpose (a recorded free adjustment) is not listed.">
      {state.loading ? <LoadingBlock rows={2} label="Checking" /> : state.error ? <ErrorState title="The check could not run" message={state.error.message} onRetry={state.reload} /> : !state.data?.mismatches.length ? <p className="text-[13px] text-ink2">Every server agrees with its plan and its subscription.</p> : (
        <ul className="grid gap-1.5 text-[13px] text-ink2">
          {state.data.mismatches.map((row, index) => <li key={`${row.serviceId}-${index}`}><span className="font-mono text-[12px]">{row.serviceId}</span> · {row.kind.replace(/_/g, ' ').toLowerCase()} · {row.detail}</li>)}
        </ul>
      )}
    </Panel>
  );
}

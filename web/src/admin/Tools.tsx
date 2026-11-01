import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, useToast } from '../ui-app';
import { can, denseDanger, denseGhost, densePrimary, useAdminSession } from './Overview';

/**
 * Operator tools that had an endpoint and no screen: the jobs that failed for good (dead letters), the
 * correction of the monthly price of the services, and the report of the email delivery. Every write
 * asks first, and the price correction always shows what it would change before it changes anything.
 */

interface DeadLetter { id: string; queue: string; name: string; error: string | null; errorClass: string | null; attempts: number; failedAt: string; state: string; requeueCount: number }
interface Reconciliation { dryRun: boolean; checked: number; corrected: number; wouldCorrect: number; differences: { instanceId: string; previousPrice: number; price: number; delta: number; currency: string }[] }

function DeadLetters({ mayWrite }: { mayWrite: boolean }) {
  const toast = useToast();
  const state = useAsync<{ failures: DeadLetter[]; total: number }>((signal) => get('/admin/dead-letters', { state: 'pending' }, signal), []);
  const [target, setTarget] = useState<{ entry: DeadLetter; action: 'requeue' | 'close' } | null>(null);
  const [busy, setBusy] = useState(false);
  const act = async () => {
    if (!target) return;
    setBusy(true);
    try {
      await post(`/admin/dead-letters/${encodeURIComponent(target.entry.id)}/${target.action}`);
      toast.push(target.action === 'requeue' ? 'The job was queued again.' : 'The failure was closed.', 'ok');
      setTarget(null);
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
    }
  };
  return (
    <Panel title="Jobs that failed for good" description="A job that used up its attempts. Queue it again after the cause is fixed, or close it when it no longer matters.">
      {state.loading ? <LoadingBlock rows={2} label="Loading the failures" /> : state.error ? <ErrorState title="The failures could not be loaded" message={state.error.message} onRetry={state.reload} /> : !state.data?.failures.length ? <EmptyState title="No failure is waiting." description="Every job either finished or is still being tried." /> : (
        <ul className="grid gap-2 text-[13px]">
          {state.data.failures.map((entry) => (
            <li key={entry.id} className="grid gap-1 rounded-2xl bg-s2 p-3">
              <span className="font-semibold text-ink">{entry.queue} · {entry.name}</span>
              <span className="break-words text-ink2">{entry.errorClass ? `${entry.errorClass}: ` : ''}{entry.error ?? 'No message.'}</span>
              <span className="text-ink3">{entry.attempts} attempts · failed {new Date(entry.failedAt).toLocaleString()} · queued again {entry.requeueCount} times</span>
              {mayWrite && (
                <span className="flex gap-2">
                  <button type="button" className={denseGhost} onClick={() => setTarget({ entry, action: 'requeue' })}>Queue again</button>
                  <button type="button" className={denseGhost} onClick={() => setTarget({ entry, action: 'close' })}>Close</button>
                </span>
              )}
            </li>
          ))}
        </ul>
      )}
      <ConfirmDialog
        open={target !== null}
        title={target?.action === 'requeue' ? 'Queue this job again?' : 'Close this failure?'}
        description={target?.action === 'requeue' ? 'The job runs again with its original data. Make sure the cause is fixed, or it fails again.' : 'The failure leaves the list. Nothing is run.'}
        confirmLabel={target?.action === 'requeue' ? 'Queue again' : 'Close'}
        onCancel={() => setTarget(null)}
        onConfirm={() => void act()}
        busy={busy}
      />
    </Panel>
  );
}

function PriceCorrection() {
  const toast = useToast();
  const [result, setResult] = useState<Reconciliation | null>(null);
  const [busy, setBusy] = useState(false);
  const [confirm, setConfirm] = useState(false);
  const run = async (dryRun: boolean) => {
    setBusy(true);
    try {
      const next = await post<Reconciliation>('/admin/instances/reconcile-prices', { dryRun });
      setResult(next);
      if (!dryRun) toast.push(`${next.corrected} services were corrected.`, 'ok');
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    } finally {
      setBusy(false);
      setConfirm(false);
    }
  };
  return (
    <Panel title="Monthly price of the services" description="Compares the price written on each service with the price of its configuration. It changes the figure shown to the customer; it never charges anything and never touches a subscription.">
      <div className="grid gap-3 text-[13px] text-ink2">
        <div className="flex gap-2">
          <button type="button" className={denseGhost} disabled={busy} onClick={() => void run(true)}>Check what would change</button>
          {result?.dryRun && result.wouldCorrect > 0 && <button type="button" className={denseDanger} disabled={busy} onClick={() => setConfirm(true)}>Correct {result.wouldCorrect} services</button>}
        </div>
        {result && (
          <div className="grid gap-1">
            <p><strong className="text-ink">{result.checked}</strong> services checked. {result.dryRun ? `${result.wouldCorrect} would change.` : `${result.corrected} corrected.`}</p>
            {result.differences.map((row) => <p key={row.instanceId} className="font-mono text-[12px]">{row.instanceId}: {row.previousPrice} → {row.price} ({row.delta >= 0 ? '+' : ''}{row.delta}) {row.currency}</p>)}
            {result.differences.length >= 50 && <p className="text-ink3">Only the first 50 are listed.</p>}
          </div>
        )}
      </div>
      <ConfirmDialog open={confirm} title="Correct the prices?" description="The figure of every service listed is replaced by the price of its configuration, and each change is written to the journal. Subscriptions and invoices are not touched." confirmLabel="Correct" onCancel={() => setConfirm(false)} onConfirm={() => void run(false)} busy={busy} />
    </Panel>
  );
}

function EmailDelivery() {
  const state = useAsync<{ email: Record<string, unknown> }>((signal) => get('/admin/email/delivery', undefined, signal), []);
  return (
    <Panel title="Email delivery" description="What happened to the messages the platform sent. Bodies, tokens and credentials are never shown.">
      {state.loading ? <LoadingBlock rows={2} label="Loading the report" /> : state.error || !state.data ? <ErrorState title="The report could not be loaded" message={state.error?.message ?? 'No answer.'} onRetry={state.reload} /> : (
        <dl className="grid gap-1 text-[13px] sm:grid-cols-2">
          {Object.entries(state.data.email).filter(([, value]) => typeof value !== 'object' || value === null).map(([name, value]) => (
            <div key={name} className="flex justify-between gap-3 rounded-xl bg-s2 px-3 py-2"><dt className="text-ink3">{name.replace(/([A-Z])/g, ' $1').toLowerCase()}</dt><dd className="font-mono text-ink">{String(value ?? '—')}</dd></div>
          ))}
        </dl>
      )}
      <button type="button" className={`${denseGhost} mt-3`} onClick={state.reload}>Refresh</button>
    </Panel>
  );
}

export default function Tools() {
  const session = useAdminSession();
  const staff = session.staff;
  if (session.loading) return <LoadingBlock rows={3} label="Loading your permissions" />;
  return (
    <div className="grid gap-4">
      {can(staff, 'infrastructure.read') && <DeadLetters mayWrite={can(staff, 'infrastructure.write')} />}
      {can(staff, 'pricing.write') && <PriceCorrection />}
      {can(staff, 'settings.read') && <EmailDelivery />}
      {!can(staff, 'infrastructure.read') && !can(staff, 'pricing.write') && !can(staff, 'settings.read') && <ErrorState title="Nothing here for your role" message="These tools need infrastructure, pricing or settings permissions." />}
    </div>
  );
}

import { get, post, del } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, StatusPill, useToast } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { can, denseDanger, fmtDateTime, useAdminSession } from './Overview';

interface JobView {
  id: string; queue: string; queueLabel: string; name: string; state: string; attempts: number; maxAttempts: number;
  createdAt: string | null; startedAt: string | null; finishedAt: string | null; reason: string; trace: string[]; dataFields: string[];
}

/** One job of a queue: where it stands, why it failed and what can be done. The data of a job is never shown, only the names of its fields. */
export function QueueJob() {
  const { name = '', id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const state = useAsync<{ job: JobView }>((signal) => get(`/admin/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`, undefined, signal), [name, id]);
  const job = state.data?.job;
  const retry = useAction(async () => post(`/admin/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}/retry`));
  const remove = useAction(async () => del(`/admin/queues/${encodeURIComponent(name)}/jobs/${encodeURIComponent(id)}`));
  const failed = job?.state === 'failed';
  return (
    <PageEditorShell eyebrow="Job queues" title={job ? `${job.name} #${job.id}` : 'Job'} description={job ? job.queueLabel : undefined} backTo="/admin/queues" backLabel="Back to the queues"
      actions={mayWrite && failed ? (
        <>
          <button type="button" className={denseDanger} disabled={remove.pending || retry.pending} onClick={() => { if (window.confirm('Remove this job? It cannot be run again.')) void remove.run().then((ok) => { if (ok !== undefined) { toast.push('The job was removed.', 'ok'); navigate('/admin/queues', { replace: true }); } }); }}>Remove</button>
          <PrimaryButton type="button" disabled={retry.pending || remove.pending} onClick={() => void retry.run().then((ok) => { if (ok !== undefined) { toast.push('The job was queued again.', 'ok'); state.reload(); } })}>{retry.pending ? 'Queuing…' : 'Retry the job'}</PrimaryButton>
        </>
      ) : null}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the job" />
        : state.error || !job ? <ErrorState title="The job could not be loaded" message={state.error?.message ?? 'It was removed or it is not there.'} onRetry={state.reload} />
        : (
          <div className="grid gap-4">
            <dl className="grid gap-3 rounded-2xl bg-s2 p-4 text-[13.5px] sm:grid-cols-4">
              <div><dt className="text-ink3">State</dt><dd><StatusPill status={job.state} /></dd></div>
              <div><dt className="text-ink3">Attempts</dt><dd className="font-mono text-ink">{job.attempts} of {job.maxAttempts}</dd></div>
              <div><dt className="text-ink3">Created</dt><dd className="text-ink">{job.createdAt ? fmtDateTime(job.createdAt) : '—'}</dd></div>
              <div><dt className="text-ink3">Finished</dt><dd className="text-ink">{job.finishedAt ? fmtDateTime(job.finishedAt) : '—'}</dd></div>
            </dl>
            {job.reason && <Panel title="Why it failed"><p className="break-words font-mono text-[12.5px] text-bad">{job.reason}</p></Panel>}
            {job.trace.length > 0 && <Panel title="Trace"><pre className="overflow-x-auto whitespace-pre-wrap break-words font-mono text-[12px] text-ink2">{job.trace.join('\n\n')}</pre></Panel>}
            <Panel title="Data" description="The data of a job can hold a secret, so only the names of its fields are shown.">
              {job.dataFields.length === 0 ? <p className="text-[13.5px] text-ink3">No field.</p> : <p className="font-mono text-[12.5px] text-ink2">{job.dataFields.join(', ')}</p>}
            </Panel>
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;infrastructure.write&quot;.</p>}
            {(retry.error || remove.error) && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{retry.error || remove.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

interface NodeView { id: string; pterodactylId: number; name: string; fqdn: string; memory: number; disk: number; memoryAllocated: number; diskAllocated: number; maintenance: boolean; syncedAt: string }
interface NodeInstance { id: string; name: string; status: string; ram: number; cpu: number; disk: number; owner: { id: string; email: string } }
const gb = (mb: number) => `${(mb / 1024).toFixed(1)} GB`;

/** One node: its capacity as the panel last reported it, and the services that run on it. The node is owned by the panel, so it is changed there. */
export function InfrastructureNode() {
  const { id = '' } = useParams();
  const state = useAsync<{ node: NodeView; instances: NodeInstance[] }>((signal) => get(`/admin/infrastructure/nodes/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const node = state.data?.node;
  return (
    <PageEditorShell eyebrow="Infrastructure" title={node ? node.name : 'Node'} description={node ? node.fqdn : undefined} backTo="/admin/infrastructure" backLabel="Back to infrastructure" actions={null}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the node" />
        : state.error || !node ? <ErrorState title="The node could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-4">
            <dl className="grid gap-3 rounded-2xl bg-s2 p-4 text-[13.5px] sm:grid-cols-4">
              <div><dt className="text-ink3">State</dt><dd><StatusPill status={node.maintenance ? 'maintenance' : 'active'} label={node.maintenance ? 'Maintenance' : 'In service'} /></dd></div>
              <div><dt className="text-ink3">Memory</dt><dd className="font-mono text-ink">{gb(node.memoryAllocated)} / {gb(node.memory)}<span className="block text-ink3">{gb(node.memory - node.memoryAllocated)} free</span></dd></div>
              <div><dt className="text-ink3">Disk</dt><dd className="font-mono text-ink">{gb(node.diskAllocated)} / {gb(node.disk)}<span className="block text-ink3">{gb(node.disk - node.diskAllocated)} free</span></dd></div>
              <div><dt className="text-ink3">Panel id · synced</dt><dd className="text-ink"><span className="font-mono">{node.pterodactylId}</span><span className="block text-ink3">{fmtDateTime(node.syncedAt)}</span></dd></div>
            </dl>
            <p className="text-[13px] text-ink3">The node is owned by the game panel. Change its limits or its maintenance mode there, then sync from the infrastructure page.</p>
            <Panel title="Services on this node" description={`${state.data!.instances.length} service${state.data!.instances.length === 1 ? '' : 's'}.`}>
              {state.data!.instances.length === 0 ? <EmptyState title="No service on this node." description="Services appear here when they are placed on it." /> : (
                <ul className="divide-y divide-line">
                  {state.data!.instances.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                      <Link to={`/admin/services/${encodeURIComponent(row.id)}`} className="font-semibold text-acc hover:underline">{row.name}</Link>
                      <span className="font-mono text-[12.5px] text-ink2">{row.cpu} vCPU · {gb(row.ram)} · {gb(row.disk)}</span>
                      <StatusPill status={row.status.toLowerCase()} />
                      <Link to={`/admin/customers/${encodeURIComponent(row.owner.id)}`} className="min-w-0 truncate font-mono text-[12.5px] text-ink3 hover:text-ink">{row.owner.email}</Link>
                    </li>
                  ))}
                </ul>
              )}
            </Panel>
          </div>
        )}
    </PageEditorShell>
  );
}

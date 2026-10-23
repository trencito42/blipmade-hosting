import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Panel, StatTile, StatusPill, useToast } from '../ui-app';
import { DASH, LiveRegion, can, densePrimary, useStaffUser } from './Overview';

/**
 * Staff infrastructure — GET /api/admin/infrastructure,
 * POST /api/admin/infrastructure/sync
 *
 * Totals, allocations and headroom come from the API. The headroom is the
 * difference between the totals and the allocations the API reports.
 */

interface AdminNode {
  id: string;
  pterodactylId: number;
  name: string;
  fqdn: string;
  memory: number;
  disk: number;
  memoryAllocated: number;
  diskAllocated: number;
  maintenance: boolean;
}

interface AdminEgg {
  id: string;
  pterodactylId: number;
  name: string;
  uuid: string;
  dockerImage: string;
  startup: string;
}

interface AdminStats {
  nodes: number;
  totalMemory: number;
  allocatedMemory: number;
  totalDisk: number;
  allocatedDisk: number;
}

/** Megabytes to gigabytes, one decimal. */
function fmtMb(mb: number): string {
  if (!Number.isFinite(mb)) return DASH;
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
}

export default function Infrastructure() {
  const staff = useStaffUser();
  const toast = useToast();

  const state = useAsync(
    (signal) => get<{ nodes: AdminNode[]; eggs: AdminEgg[]; stats: AdminStats }>('/admin/infrastructure', undefined, signal),
    [],
  );

  const sync = useAction(async () => {
    return post<{ nodes: number; eggs: number }>('/admin/infrastructure/sync');
  });

  const nodes = state.data?.nodes ?? [];
  const eggs = state.data?.eggs ?? [];
  const stats = state.data?.stats;
  const mayWrite = can(staff, 'infrastructure.write');

  const runSync = async () => {
    const result = await sync.run();
    if (!result) return;
    toast.push(`Synced ${result.nodes} nodes and ${result.eggs} eggs`, 'ok');
    state.reload();
  };

  const memoryHeadroom = stats ? stats.totalMemory - stats.allocatedMemory : null;
  const diskHeadroom = stats ? stats.totalDisk - stats.allocatedDisk : null;

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${nodes.length} node${nodes.length === 1 ? '' : 's'}, ${eggs.length} egg${eggs.length === 1 ? '' : 's'}`} />
      <Panel
        title="Infrastructure"
        description="Nodes and eggs as the panel reports them. Syncing re-reads the panel and refreshes these numbers."
        actionBelow
        action={
          mayWrite ? (
            <button type="button" onClick={runSync} disabled={sync.pending} className={densePrimary}>
              {sync.pending ? 'Syncing…' : 'Sync panel'}
            </button>
          ) : undefined
        }
      >
        <div className="grid gap-3">
          {state.loading ? (
            <LoadingBlock rows={3} label="Loading the infrastructure" />
          ) : state.error ? (
            <ErrorState title="The infrastructure could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : (
            <>
              <section aria-label="Capacity" className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                <StatTile label="Nodes" value={stats ? stats.nodes : DASH} hint="Nodes in the panel." />
                <StatTile
                  label="Memory used"
                  value={stats ? fmtMb(stats.allocatedMemory) : DASH}
                  hint={stats ? `of ${fmtMb(stats.totalMemory)}` : undefined}
                />
                <StatTile
                  label="Disk used"
                  value={stats ? fmtMb(stats.allocatedDisk) : DASH}
                  hint={stats ? `of ${fmtMb(stats.totalDisk)}` : undefined}
                />
                <StatTile
                  label="Headroom"
                  value={
                    memoryHeadroom === null || diskHeadroom === null
                      ? DASH
                      : `${fmtMb(memoryHeadroom)} · ${fmtMb(diskHeadroom)}`
                  }
                  hint="Memory and disk still free."
                />
              </section>

              {sync.error && (
                <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
                  {sync.error}
                </p>
              )}

              {!mayWrite && (
                <p className="px-1 text-[13px] text-ink3">
                  Your role does not hold &quot;infrastructure.write&quot;, so syncing is hidden.
                </p>
              )}
            </>
          )}
        </div>
      </Panel>

      <Panel title="Nodes" description="Totals and allocations per node, with the free capacity left over.">
        {state.loading ? (
          <LoadingBlock rows={2} label="Loading nodes" />
        ) : state.error ? (
          <ErrorState title="The nodes could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : !nodes.length ? (
          <EmptyState title="No nodes." description="Sync the panel to pull the nodes into Blipmade." />
        ) : (
          <div className="grid gap-3">
            <DataTable<AdminNode>
              rows={nodes}
              rowKey={(node) => node.id}
              columns={[
                {
                  key: 'name',
                  header: 'Node',
                  truncate: true,
                  render: (node: AdminNode) => (
                    <span className="block min-w-0">
                      <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={node.name}>
                        {node.name}
                      </span>
                      <span className="block truncate font-mono text-[12.5px] text-ink3" title={node.fqdn}>
                        {node.fqdn}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'memory',
                  header: 'Memory',
                  align: 'right',
                  nowrap: true,
                  render: (node: AdminNode) => (
                    <span className="font-mono text-[12.5px] text-ink2">
                      {fmtMb(node.memoryAllocated)} / {fmtMb(node.memory)}
                      <span className="block text-ink3">{fmtMb(node.memory - node.memoryAllocated)} free</span>
                    </span>
                  ),
                },
                {
                  key: 'disk',
                  header: 'Disk',
                  align: 'right',
                  nowrap: true,
                  render: (node: AdminNode) => (
                    <span className="font-mono text-[12.5px] text-ink2">
                      {fmtMb(node.diskAllocated)} / {fmtMb(node.disk)}
                      <span className="block text-ink3">{fmtMb(node.disk - node.diskAllocated)} free</span>
                    </span>
                  ),
                },
                {
                  key: 'maintenance',
                  header: 'State',
                  nowrap: true,
                  render: (node: AdminNode) => (
                    <StatusPill
                      status={node.maintenance ? 'on_hold' : 'active'}
                      label={node.maintenance ? 'Maintenance' : 'Active'}
                    />
                  ),
                },
                {
                  key: 'panel',
                  header: 'Pterodactyl id',
                  nowrap: true,
                  render: (node: AdminNode) => (
                    <span className="font-mono text-[12.5px] text-ink2">{node.pterodactylId}</span>
                  ),
                },
              ]}
            />
            <CardList<AdminNode> rows={nodes} rowKey={(node) => node.id}>
              {(node) => (
                <div>
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={node.name}>
                        {node.name}
                      </p>
                      <p className="truncate font-mono text-[12.5px] text-ink3" title={node.fqdn}>
                        {node.fqdn}
                      </p>
                    </div>
                    <StatusPill
                      status={node.maintenance ? 'on_hold' : 'active'}
                      label={node.maintenance ? 'Maintenance' : 'Active'}
                    />
                  </div>
                  <dl className="mt-3 grid grid-cols-2 gap-2 text-[13px]">
                    <div className="min-w-0">
                      <dt className="text-ink3">Memory</dt>
                      <dd className="font-mono break-words text-ink">
                        {fmtMb(node.memoryAllocated)} / {fmtMb(node.memory)}
                      </dd>
                    </div>
                    <div className="min-w-0">
                      <dt className="text-ink3">Disk</dt>
                      <dd className="font-mono break-words text-ink">
                        {fmtMb(node.diskAllocated)} / {fmtMb(node.disk)}
                      </dd>
                    </div>
                  </dl>
                </div>
              )}
            </CardList>
          </div>
        )}
      </Panel>

      <Panel title="Eggs" description="The templates the panel can provision from.">
        {state.loading ? (
          <LoadingBlock rows={2} label="Loading eggs" />
        ) : state.error ? (
          <ErrorState title="The eggs could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : !eggs.length ? (
          <EmptyState title="No eggs." description="Sync the panel to pull the eggs into Blipmade." />
        ) : (
          <div className="grid gap-3">
            <DataTable<AdminEgg>
              rows={eggs}
              rowKey={(egg) => egg.id}
              columns={[
                {
                  key: 'name',
                  header: 'Egg',
                  truncate: true,
                  render: (egg: AdminEgg) => (
                    <span className="block min-w-0">
                      <span className="block truncate font-bold tracking-[-0.02em] text-ink" title={egg.name}>
                        {egg.name}
                      </span>
                      <span className="block truncate font-mono text-[12.5px] text-ink3" title={egg.uuid}>
                        {egg.uuid}
                      </span>
                    </span>
                  ),
                },
                {
                  key: 'image',
                  header: 'Docker image',
                  truncate: true,
                  render: (egg: AdminEgg) => (
                    <span className="block max-w-[280px] truncate font-mono text-[12.5px] text-ink2" title={egg.dockerImage}>
                      {egg.dockerImage}
                    </span>
                  ),
                },
                {
                  key: 'startup',
                  header: 'Startup',
                  truncate: true,
                  render: (egg: AdminEgg) => (
                    <span className="block max-w-[280px] truncate font-mono text-[12.5px] text-ink2" title={egg.startup}>
                      {egg.startup}
                    </span>
                  ),
                },
                {
                  key: 'panel',
                  header: 'Pterodactyl id',
                  nowrap: true,
                  render: (egg: AdminEgg) => <span className="font-mono text-[12.5px] text-ink2">{egg.pterodactylId}</span>,
                },
              ]}
            />
            <CardList<AdminEgg> rows={eggs} rowKey={(egg) => egg.id}>
              {(egg) => (
                <div>
                  <p className="truncate text-[15px] font-bold tracking-[-0.02em] text-ink" title={egg.name}>
                    {egg.name}
                  </p>
                  <p className="truncate font-mono text-[12.5px] text-ink3" title={egg.dockerImage}>
                    {egg.dockerImage}
                  </p>
                  <p className="mt-1.5 break-all font-mono text-[12px] text-ink3">{egg.startup}</p>
                </div>
              )}
            </CardList>
          </div>
        )}
      </Panel>
    </div>
  );
}

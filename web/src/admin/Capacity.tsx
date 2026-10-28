import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { CardList, DataTable, EmptyState, ErrorState, LoadingBlock, Money, Panel, StatTile } from '../ui-app';
import { DASH } from './Overview';
import type { TableColumn } from '../lib/table';

/**
 * The capacity of the platform and the revenue it carries.
 *
 * The memory and the disk come from the panel. The processors come from the
 * policy of the shared processors: a node sells the cores the operator
 * declared, multiplied by the factor of the oversubscription, and nothing
 * else. The revenue is the price of the running instances.
 *
 * The cost of the nodes is what the operator declared. When it was not
 * declared for every node, the margin is unknown and the panel says so
 * instead of showing a number that would be made up.
 */

interface CapacityNode {
  id: number;
  name: string;
  maintenance: boolean;
  memoryTotalMb: number;
  memoryAllocatedMb: number;
  memoryFreeMb: number;
  diskTotalMb: number;
  diskAllocatedMb: number;
  diskFreeMb: number;
  cores: number;
  coresDeclared: boolean;
  sellableVcpu: number;
  allocatedVcpu: number;
  freeVcpu: number;
  monthlyCost: number | null;
}

interface CapacityReport {
  nodes: CapacityNode[];
  totals: {
    memoryTotalMb: number;
    memoryAllocatedMb: number;
    memoryFreeMb: number;
    diskTotalMb: number;
    diskAllocatedMb: number;
    diskFreeMb: number;
    sellableVcpu: number;
    allocatedVcpu: number;
    freeVcpu: number;
  };
  policy: { oversubscription: number; defaultNodeCores: number; declaredNodes: number };
  revenue: {
    instances: number;
    mrr: number;
    yearly: number;
    currency: string;
    ramMb: number;
    cpu: number;
    diskGb: number;
    byProduct: { productId: string; name: string; slug: string; count: number; amount: number }[];
  };
  costs: { monthly: number | null; declared: boolean; note: string | null };
  margin: { monthly: number | null; percent: number | null };
}

/** Megabytes, in gigabytes, with one decimal. */
function gb(mb: number): string {
  if (!Number.isFinite(mb)) return DASH;
  return `${Math.round((mb / 1024) * 10) / 10} GB`;
}

/** The share of a capacity that is sold, as a percentage. */
function used(allocated: number, total: number): string {
  if (!total) return DASH;
  return `${Math.round((allocated / total) * 100)}%`;
}

export default function Capacity() {
  const state = useAsync(
    (signal) => get<CapacityReport>('/admin/capacity', undefined, signal),
    [],
  );
  const report = state.data;

  if (state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading the capacity of the platform" />
      </div>
    );
  }

  if (state.error || !report) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="The capacity could not be loaded"
          message={state.error?.message ?? 'The platform did not answer.'}
          onRetry={state.reload}
        />
      </div>
    );
  }

  const { totals, revenue, costs, margin, policy } = report;

  const columns: TableColumn<CapacityNode>[] = [
    { key: 'node', header: 'Node', render: (row) => row.name, nowrap: true },
    {
      key: 'memory',
      header: 'Memory',
      align: 'right',
      render: (row) => (
        <span className="font-mono">
          {gb(row.memoryAllocatedMb)} / {gb(row.memoryTotalMb)}
        </span>
      ),
      nowrap: true,
    },
    {
      key: 'memoryFree',
      header: 'Free',
      align: 'right',
      render: (row) => <span className="font-mono">{gb(row.memoryFreeMb)}</span>,
      nowrap: true,
    },
    {
      key: 'disk',
      header: 'Disk',
      align: 'right',
      render: (row) => (
        <span className="font-mono">
          {gb(row.diskAllocatedMb)} / {gb(row.diskTotalMb)}
        </span>
      ),
      nowrap: true,
    },
    {
      key: 'vcpu',
      header: 'vCPU sold',
      align: 'right',
      render: (row) => (
        <span className="font-mono">
          {row.allocatedVcpu} / {row.sellableVcpu}
        </span>
      ),
      nowrap: true,
    },
    {
      key: 'cores',
      header: 'Cores',
      align: 'right',
      render: (row) => (
        <span className="font-mono">
          {row.cores}
          {row.coresDeclared ? '' : ' (default)'}
        </span>
      ),
      nowrap: true,
    },
    {
      key: 'cost',
      header: 'Cost / month',
      align: 'right',
      render: (row) =>
        row.monthlyCost === null ? (
          <span className="text-ink3">not declared</span>
        ) : (
          <Money amount={row.monthlyCost} currency={revenue.currency} />
        ),
      nowrap: true,
    },
  ];

  return (
    <div className="grid gap-4">
      <Panel title="Capacity and revenue" description="What the platform sells, what it holds, and what it earns.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          <StatTile
            label="Revenue per month"
            value={<Money amount={revenue.mrr} currency={revenue.currency} />}
            hint={`${revenue.instances} running instance${revenue.instances === 1 ? '' : 's'}`}
          />
          <StatTile
            label="Revenue per year"
            value={<Money amount={revenue.yearly} currency={revenue.currency} />}
            hint="Twelve months of the card"
          />
          <StatTile
            label="Memory sold"
            value={gb(revenue.ramMb)}
            hint={`${used(totals.memoryAllocatedMb, totals.memoryTotalMb)} of the nodes`}
          />
          <StatTile
            label="Processors sold"
            value={revenue.cpu}
            hint={`${used(totals.allocatedVcpu, totals.sellableVcpu)} of what the nodes sell`}
          />
        </div>

        {costs.declared && margin.monthly !== null ? (
          <div className="mt-3 grid gap-3 sm:grid-cols-2">
            <StatTile
              label="Cost of the nodes per month"
              value={<Money amount={costs.monthly ?? 0} currency={revenue.currency} />}
              hint="The cost the operator declared"
            />
            <StatTile
              label="Margin per month"
              value={<Money amount={margin.monthly} currency={revenue.currency} />}
              hint={margin.percent === null ? undefined : `${margin.percent}% of the revenue`}
            />
          </div>
        ) : (
          <p className="mt-3 rounded-2xl bg-s2 px-3.5 py-3 text-[12.5px] leading-relaxed text-ink3">
            {costs.note ?? 'The cost of the nodes is not declared, so the margin of the platform is unknown.'} The cost of a node is
            written in the setting <span className="font-mono">capacity.node_costs</span>, in the same currency as the revenue.
          </p>
        )}

        <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
          A node sells the cores the operator declared, multiplied by a factor of {policy.oversubscription}. A node that was never
          declared sells {policy.defaultNodeCores} cores, so it cannot be filled to the brim by accident. {policy.declaredNodes} node
          {policy.declaredNodes === 1 ? ' has' : 's have'} a declared number of cores.
        </p>
      </Panel>

      <Panel title="Nodes" description="What every node holds and what it sells.">
        <DataTable
          columns={columns}
          rows={report.nodes}
          rowKey={(row) => String(row.id)}
          minWidth="860px"
          empty={<EmptyState title="No node yet." description="The panel publishes no node." />}
        />
        <CardList rows={report.nodes} rowKey={(row) => String(row.id)}>
          {(row) => (
            <dl className="grid gap-1.5 text-[13px]">
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">Memory</dt>
                <dd className="font-mono">
                  {gb(row.memoryAllocatedMb)} / {gb(row.memoryTotalMb)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">Disk</dt>
                <dd className="font-mono">
                  {gb(row.diskAllocatedMb)} / {gb(row.diskTotalMb)}
                </dd>
              </div>
              <div className="flex justify-between gap-3">
                <dt className="text-ink3">vCPU sold</dt>
                <dd className="font-mono">
                  {row.allocatedVcpu} / {row.sellableVcpu}
                </dd>
              </div>
            </dl>
          )}
        </CardList>
      </Panel>

      {revenue.byProduct.length > 0 && (
        <Panel title="Revenue by product" description="The price of the running instances, per product.">
          <DataTable
            columns={[
              { key: 'product', header: 'Product', render: (row) => row.name },
              { key: 'count', header: 'Instances', align: 'right', render: (row) => row.count, nowrap: true },
              {
                key: 'amount',
                header: 'Per month',
                align: 'right',
                render: (row) => <Money amount={row.amount} currency={revenue.currency} />,
                nowrap: true,
              },
            ]}
            rows={revenue.byProduct}
            rowKey={(row) => row.productId}
            minWidth="420px"
          />
        </Panel>
      )}
    </div>
  );
}

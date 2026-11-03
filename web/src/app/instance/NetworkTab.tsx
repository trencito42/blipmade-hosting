import { useAsync } from '../../lib/useAsync';
import { listAllocations } from '../../lib/instance-api';
import {
  CardList,
  ButtonLink,
  DataTable,
  EmptyState,
  ListRow,
  LoadingBlock,
  Panel,
  StatusPill,
} from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';
import type { TableColumn } from '../../lib/table';

/**
 * The addresses of the instance.
 *
 * The port the service listens on is the one the panel assigned. It is read
 * from the panel and never written by hand, so the address here is the
 * address the customer really uses.
 */

export default function NetworkTab({ instance }: TabProps) {
  const allocations = useAsync((signal) => listAllocations(instance.id, signal), [instance.id]);

  const rows = allocations.data?.allocations ?? [];


  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'address',
      header: 'Address',
      nowrap: true,
      render: (row: (typeof rows)[number]) => (
        <span className="font-mono">
          {row.ip}:{row.port}
        </span>
      ),
    },
    {
      key: 'alias',
      header: 'Name',
      truncate: true,
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.alias || '—'}</span>,
    },
    {
      key: 'state',
      header: 'State',
      nowrap: true,
      render: (row: (typeof rows)[number]) =>
        row.is_default ? <StatusPill status="primary" label="Primary" /> : <StatusPill status="extra" label="Extra" />,
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row: (typeof rows)[number]) => (
        <div className="flex flex-wrap justify-end gap-2">
          <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/network/${row.id}/edit`} variant="soft">Edit</ButtonLink>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Addresses"
        description="The addresses the panel assigned to this instance. The primary one is the address the service is reached at."
        action={
          // Extra addresses are part of the plan. Without room for one the button is not offered.
          (allocations.data?.limit ?? 0) > rows.length ? (
            <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/network/new`}>Add an address</ButtonLink>
          ) : undefined
        }
      >
        {allocations.loading ? (
          <LoadingBlock rows={2} label="Loading the addresses" />
        ) : allocations.error ? (
          <ApiErrorState error={allocations.error} onRetry={allocations.reload} title="We could not load the addresses" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No addresses yet."
            description="The panel assigns an address to every server. It shows up here as soon as it is assigned."
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => String(row.id)} />
            <CardList rows={rows} rowKey={(row) => String(row.id)}>
              {(row) => (
                <ListRow
                  title={
                    <span className="font-mono">
                      {row.ip}:{row.port}
                    </span>
                  }
                  meta={row.alias ? <span className="font-mono">{row.alias}</span> : undefined}
                  right={
                    <div className="flex flex-wrap justify-end gap-2">
                      <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/network/${row.id}/edit`} variant="soft">Edit</ButtonLink>
                    </div>
                  }
                />
              )}
            </CardList>
          </>
        )}
      </Panel>

    </div>
  );
}

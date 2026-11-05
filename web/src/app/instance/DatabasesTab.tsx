import { useMenuKit } from '../../lib/menu-actions';
import type { MenuItem } from '../../context-menu';
import { ButtonGroup } from '../components/premium';
import { useAsync } from '../../lib/useAsync';
import { listDatabases } from '../../lib/instance-api';
import {
  CardList,
  Pager,
  usePaged,
  ButtonLink,
  DataTable,
  EmptyState,
  ListRow,
  LoadingBlock,
  Panel,
} from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';
import type { TableColumn } from '../../lib/table';

/**
 * The databases of the instance.
 *
 * Everything here goes through the API of Blipmade, which uses the key of the
 * customer on the panel. The password of a database is only shown when it is
 * asked for, and that call is written to the audit log.
 */

export default function DatabasesTab({ instance }: TabProps) {
  const databases = useAsync((signal) => listDatabases(instance.id, signal), [instance.id]);

  const rows = databases.data?.databases ?? [];
  const paged = usePaged(rows, 20);
  // The panel says how many databases this server may have. 0 means none, so the page says that.
  const noDatabases = databases.data !== undefined && databases.data.limit === 0 && rows.length === 0;
  const limit = databases.data?.limit;
  const full = limit !== undefined && limit > 0 && rows.length >= limit;


  const menuKit = useMenuKit();
  /** The actions of a database. Nothing secret is copied: the password is shown, or rotated, only on the security page. */
  const databaseActions = (row: (typeof rows)[number]): MenuItem[] => [
    menuKit.go('security', 'Credentials and security…', 'shield', `/app/instances/${encodeURIComponent(instance.id)}/databases/${encodeURIComponent(row.id)}/security`),
    menuKit.copy('copy-name', 'database name', row.database, { separated: true }),
    menuKit.copy('copy-user', 'user name', row.username),
    menuKit.copy('copy-address', 'address', `${row.host}:${row.port}`),
  ];

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Database',
      nowrap: true,
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.database}</span>,
    },
    {
      key: 'user',
      header: 'User',
      nowrap: true,
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.username}</span>,
    },
    {
      key: 'host',
      header: 'Address',
      truncate: true,
      render: (row: (typeof rows)[number]) => (
        <span className="font-mono text-[13px]">
          {row.host}:{row.port}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row: (typeof rows)[number]) => (
        <ButtonGroup label="Actions" className="justify-end">
          <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/databases/${encodeURIComponent(row.id)}/security`} variant="soft" title="Show the credentials, rotate the password or delete this database">Security</ButtonLink>
        </ButtonGroup>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Databases"
        description={limit ? `The databases of this instance: ${rows.length} of ${limit} used. The panel keeps them on the node of the instance.` : 'The databases that belong to this instance. The panel keeps them on the node of the instance.'}
        action={
          noDatabases || full ? undefined : (
            <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/databases/new`}>
              New database
            </ButtonLink>
          )
        }
      >
        {databases.loading ? (
          <LoadingBlock rows={2} label="Loading the databases" />
        ) : databases.error ? (
          <ApiErrorState error={databases.error} onRetry={databases.reload} title="We could not load the databases" />
        ) : noDatabases ? (
          <EmptyState
            title="This instance has no database."
            description="Its plan does not include a database. If you need one, deploy a database from the catalog and connect to it from this instance."
          />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No databases yet."
            description="A database is created on the node of the instance and belongs to this instance alone."
          />
        ) : (
          <>
            <DataTable columns={columns} rows={paged.rows} rowKey={(row) => String(row.id)} rowActions={databaseActions} rowLabel={(row) => `database ${row.database}`} />
            <CardList rows={paged.rows} rowKey={(row) => String(row.id)} rowActions={databaseActions} rowLabel={(row) => `database ${row.database}`}>
              {(row) => (
                <ListRow
                  title={<span className="font-mono">{row.database}</span>}
                  meta={
                    <span className="font-mono">
                      {row.username} · {row.host}:{row.port}
                    </span>
                  }
                  right={
                    <div className="flex flex-wrap justify-end gap-2">
                      <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/databases/${encodeURIComponent(row.id)}/security`} variant="soft" title="Show the credentials, rotate the password or delete this database">Security</ButtonLink>
                    </div>
                  }
                />
              )}
            </CardList>
            <Pager paged={paged} label="Pages" />
          </>
        )}
      </Panel>

    </div>
  );
}

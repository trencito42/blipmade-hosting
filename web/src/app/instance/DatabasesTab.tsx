import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import {
  deleteDatabase,
  getDatabaseCredentials,
  listDatabases,
  updateDatabase,
} from '../../lib/instance-api';
import {
  CardList,
  ButtonLink,
  ConfirmDialog,
  DataTable,
  DangerButton,
  EmptyState,
  ListRow,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  useToast,
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
  const { push } = useToast();
  const databases = useAsync((signal) => listDatabases(instance.id, signal), [instance.id]);
  const [credentials, setCredentials] = useState<{ id: string; label: string; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [editingPasswordId, setEditingPasswordId] = useState<string | null>(null);
  const [passwordBusy, setPasswordBusy] = useState(false);

  const rows = databases.data?.databases ?? [];
  // The panel says how many databases this server may have. 0 means none, so the page says that.
  const noDatabases = databases.data !== undefined && databases.data.limit === 0 && rows.length === 0;
  const limit = databases.data?.limit;
  const full = limit !== undefined && limit > 0 && rows.length >= limit;


  const showCredentials = async (id: string, name: string) => {
    try {
      const answer = await getDatabaseCredentials(instance.id, id);
      const c = answer.credentials;
      setCredentials({
        id,
        label: name,
        text: `host=${c.host}\nport=${c.port}\ndatabase=${c.database}\nuser=${c.username}\npassword=${c.password}`,
      });
    } catch (error) {
      push(error instanceof Error ? error.message : 'The credentials could not be read.', 'error');
    }
  };

  const changePassword = (id: string) => {
    setEditingPasswordId(id);
  };

  const savePassword = async () => {
    if (!editingPasswordId) return;
    setPasswordBusy(true);
    try {
      await updateDatabase(instance.id, editingPasswordId, {});
      push('A new password was made.', 'ok');
      const id = editingPasswordId;
      const name = rows.find((row) => String(row.id) === id)?.database ?? '';
      setEditingPasswordId(null);
      databases.reload();
      await showCredentials(id, name);
    } catch (error) {
      push(error instanceof Error ? error.message : 'The password was not changed.', 'error');
    } finally { setPasswordBusy(false); }
  };

  const remove = async (id: string) => {
    try {
      await deleteDatabase(instance.id, id);
      push('The database was deleted.', 'ok');
      databases.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The database was not deleted.', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

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
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton onClick={() => showCredentials(row.id, row.database)}>Credentials</SoftButton>
          <SoftButton onClick={() => changePassword(row.id)}>New password</SoftButton>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.database })}>Delete</DangerButton>
        </div>
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
            <DataTable columns={columns} rows={rows} rowKey={(row) => String(row.id)} />
            <CardList rows={rows} rowKey={(row) => String(row.id)}>
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
                      <SoftButton onClick={() => showCredentials(row.id, row.database)}>Credentials</SoftButton>
                      <SoftButton onClick={() => changePassword(row.id)}>Password</SoftButton>
                      <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.database })}>Delete</DangerButton>
                    </div>
                  }
                />
              )}
            </CardList>
          </>
        )}
      </Panel>

      {credentials && (
        <Panel
          title="The credentials"
          description="Copy them now. The password can be asked for again, but every ask is written to the log."
          action={
            <SoftButton
              onClick={async () => {
                try {
                  await navigator.clipboard.writeText(credentials.text);
                  push('The credentials were copied.', 'ok');
                } catch {
                  push('The copy did not work. Select the text and copy it by hand.', 'error');
                }
              }}
            >
              Copy
            </SoftButton>
          }
        >
          <pre className="overflow-x-auto rounded-2xl bg-s2 p-3.5 font-mono text-[13px] text-ink">{credentials.text}</pre>
        </Panel>
      )}

      {editingPasswordId && (
        <Panel title="Make a new password" description="The panel makes the password. Anything that uses the old one stops working until you give it the new one.">
          <div className="grid max-w-md gap-3">
            <div className="flex gap-2">
              <PrimaryButton onClick={() => void savePassword()} disabled={passwordBusy}>{passwordBusy ? 'Working…' : 'Make a new password'}</PrimaryButton>
              <SoftButton onClick={() => { setEditingPasswordId(null); }} disabled={passwordBusy}>Cancel</SoftButton>
            </div>
          </div>
        </Panel>
      )}

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this database?"
        description={
          pendingDelete
            ? `The database "${pendingDelete.name}" and everything in it are removed. This cannot be undone.`
            : undefined
        }
        confirmLabel="Delete the database"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
      />
    </div>
  );
}

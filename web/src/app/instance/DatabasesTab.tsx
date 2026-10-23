import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import {
  createDatabase,
  deleteDatabase,
  getDatabaseCredentials,
  listDatabases,
  updateDatabase,
} from '../../lib/instance-api';
import {
  CardList,
  ConfirmDialog,
  DataTable,
  DangerButton,
  EmptyState,
  ListRow,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  TextInput,
  useToast,
} from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

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
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState({ database: '', username: '', password: '', remote: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [credentials, setCredentials] = useState<{ id: string; label: string; text: string } | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const rows = databases.data?.databases ?? [];

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createDatabase(instance.id, {
        database: form.database.trim(),
        username: form.username.trim(),
        password: form.password,
        remote: form.remote.trim(),
      });
      push('The database was created.', 'ok');
      setForm({ database: '', username: '', password: '', remote: '' });
      setCreating(false);
      databases.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The database could not be created.');
    } finally {
      setBusy(false);
    }
  };

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

  const changePassword = async (id: string) => {
    const password = window.prompt('The new password of the database.');
    if (!password) return;
    try {
      await updateDatabase(instance.id, id, { password });
      push('The password was changed.', 'ok');
      databases.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The password was not changed.', 'error');
    }
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

  const columns = [
    {
      key: 'name',
      header: 'Database',
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.database}</span>,
    },
    {
      key: 'user',
      header: 'User',
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.username}</span>,
    },
    {
      key: 'host',
      header: 'Address',
      render: (row: (typeof rows)[number]) => (
        <span className="font-mono text-[13px]">
          {row.host}:{row.port}
        </span>
      ),
    },
    {
      key: 'actions',
      header: '',
      render: (row: (typeof rows)[number]) => (
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton onClick={() => showCredentials(row.id, row.database)}>Credentials</SoftButton>
          <SoftButton onClick={() => changePassword(row.id)}>Change password</SoftButton>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.database })}>Delete</DangerButton>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Databases"
        description="The databases that belong to this instance. The panel keeps them on the node of the instance."
        action={
          <PrimaryButton onClick={() => setCreating((value) => !value)} disabled={busy}>
            {creating ? 'Close' : 'New database'}
          </PrimaryButton>
        }
      >
        {creating && (
          <div className="mb-4 grid gap-3 rounded-2xl bg-s2 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Name of the database"
                value={form.database}
                onChange={(event) => setForm({ ...form, database: event.target.value })}
                placeholder="shop"
                autoComplete="off"
              />
              <TextInput
                label="User of the database"
                value={form.username}
                onChange={(event) => setForm({ ...form, username: event.target.value })}
                placeholder="shop_user"
                autoComplete="off"
              />
              <TextInput
                label="Password"
                type="password"
                value={form.password}
                onChange={(event) => setForm({ ...form, password: event.target.value })}
                autoComplete="new-password"
              />
              <TextInput
                label="Allowed address"
                value={form.remote}
                onChange={(event) => setForm({ ...form, remote: event.target.value })}
                placeholder="10.0.0.0/8"
                hint="Only this address may reach the database."
                autoComplete="off"
              />
            </div>
            {formError && (
              <p role="alert" className="px-1 text-[12.5px] font-medium text-bad">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton
                onClick={create}
                disabled={busy || !form.database.trim() || !form.username.trim() || !form.password}
              >
                {busy ? 'Creating…' : 'Create the database'}
              </PrimaryButton>
              <SoftButton onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </SoftButton>
            </div>
          </div>
        )}

        {databases.loading ? (
          <LoadingBlock rows={2} label="Loading the databases" />
        ) : databases.error ? (
          <ApiErrorState error={databases.error} onRetry={databases.reload} title="We could not load the databases" />
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

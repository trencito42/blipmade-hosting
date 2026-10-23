import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import {
  createAllocation,
  deleteAllocation,
  listAllocations,
  setPrimaryAllocation,
  updateAllocation,
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
  StatusPill,
  TextInput,
  useToast,
} from '../../ui-app';
import { ApiErrorState, type TabProps } from './common';

/**
 * The addresses of the instance.
 *
 * The port the service listens on is the one the panel assigned. It is read
 * from the panel and never written by hand, so the address here is the
 * address the customer really uses.
 */

export default function NetworkTab({ instance }: TabProps) {
  const { push } = useToast();
  const allocations = useAsync((signal) => listAllocations(instance.id, signal), [instance.id]);
  const [adding, setAdding] = useState(false);
  const [form, setForm] = useState({ ip: '', port: '', alias: '' });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; address: string } | null>(null);

  const rows = allocations.data?.allocations ?? [];

  const add = async () => {
    setBusy(true);
    setFormError(null);
    try {
      await createAllocation(instance.id, {
        ip: form.ip.trim(),
        port: Number(form.port),
        alias: form.alias.trim() || undefined,
      });
      push('The address was added.', 'ok');
      setForm({ ip: '', port: '', alias: '' });
      setAdding(false);
      allocations.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The address could not be added.');
    } finally {
      setBusy(false);
    }
  };

  const makePrimary = async (id: number) => {
    try {
      await setPrimaryAllocation(instance.id, id);
      push('The address is now the primary one.', 'ok');
      allocations.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The address was not changed.', 'error');
    }
  };

  const rename = async (id: number, current: string | null) => {
    const alias = window.prompt('The name of this address.', current ?? '');
    if (alias === null) return;
    try {
      await updateAllocation(instance.id, id, { alias: alias || null });
      allocations.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The address was not changed.', 'error');
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteAllocation(instance.id, id);
      push('The address was removed.', 'ok');
      allocations.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The address was not removed.', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const columns = [
    {
      key: 'address',
      header: 'Address',
      render: (row: (typeof rows)[number]) => (
        <span className="font-mono">
          {row.ip}:{row.port}
        </span>
      ),
    },
    {
      key: 'alias',
      header: 'Name',
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.alias || '—'}</span>,
    },
    {
      key: 'state',
      header: 'State',
      render: (row: (typeof rows)[number]) =>
        row.is_default ? <StatusPill status="primary" label="Primary" /> : <StatusPill status="extra" label="Extra" />,
    },
    {
      key: 'actions',
      header: '',
      render: (row: (typeof rows)[number]) => (
        <div className="flex flex-wrap justify-end gap-2">
          {!row.is_default && <SoftButton onClick={() => makePrimary(row.id)}>Make primary</SoftButton>}
          <SoftButton onClick={() => rename(row.id, row.alias)}>Rename</SoftButton>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, address: `${row.ip}:${row.port}` })}>
            Remove
          </DangerButton>
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
          <PrimaryButton onClick={() => setAdding((value) => !value)} disabled={busy}>
            {adding ? 'Close' : 'Add an address'}
          </PrimaryButton>
        }
      >
        {adding && (
          <div className="mb-4 grid gap-3 rounded-2xl bg-s2 p-3.5">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput
                label="Address"
                value={form.ip}
                onChange={(event) => setForm({ ...form, ip: event.target.value })}
                placeholder="10.77.0.11"
                autoComplete="off"
              />
              <TextInput
                label="Port"
                type="number"
                value={form.port}
                onChange={(event) => setForm({ ...form, port: event.target.value })}
                placeholder="30000"
                inputMode="numeric"
                autoComplete="off"
              />
              <TextInput
                label="Name"
                value={form.alias}
                onChange={(event) => setForm({ ...form, alias: event.target.value })}
                placeholder="bot"
                autoComplete="off"
              />
            </div>
            {formError && (
              <p role="alert" className="px-1 text-[12.5px] font-medium text-bad">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={add} disabled={busy || !form.ip.trim() || !form.port.trim()}>
                {busy ? 'Adding…' : 'Add the address'}
              </PrimaryButton>
              <SoftButton onClick={() => setAdding(false)} disabled={busy}>
                Cancel
              </SoftButton>
            </div>
          </div>
        )}

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
                      {!row.is_default && <SoftButton onClick={() => makePrimary(row.id)}>Make primary</SoftButton>}
                      <SoftButton onClick={() => rename(row.id, row.alias)}>Rename</SoftButton>
                      <DangerButton onClick={() => setPendingDelete({ id: row.id, address: `${row.ip}:${row.port}` })}>
                        Remove
                      </DangerButton>
                    </div>
                  }
                />
              )}
            </CardList>
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Remove this address?"
        description={
          pendingDelete
            ? `The address ${pendingDelete.address} is released. Nothing listens on it any more.`
            : undefined
        }
        confirmLabel="Remove the address"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
      />
    </div>
  );
}

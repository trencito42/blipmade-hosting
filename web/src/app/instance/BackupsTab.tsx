import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { createBackup, deleteBackup, downloadBackup, listBackups, restoreBackup } from '../../lib/instance-api';
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
import { ApiErrorState, fmtBytes, fmtDateTime, type TabProps } from './common';
import type { TableColumn } from '../../lib/table';

/**
 * The backups of the instance.
 *
 * A backup is an archive of the files of the container. Creating one, restoring
 * one and removing one all go through the API of Blipmade and are written to
 * the log of the instance.
 */

export default function BackupsTab({ instance }: TabProps) {
  const { push } = useToast();
  const backups = useAsync((signal) => listBackups(instance.id, signal), [instance.id]);
  const [name, setName] = useState('');
  const [locked, setLocked] = useState(false);
  const [busy, setBusy] = useState(false);
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);
  const [pendingRestore, setPendingRestore] = useState<{ id: string; name: string } | null>(null);

  const rows = backups.data?.backups ?? [];

  const create = async () => {
    setBusy(true);
    try {
      await createBackup(instance.id, { name: name.trim(), locked });
      push('The backup was asked for. The panel writes it in the background.', 'ok');
      setName('');
      setLocked(false);
      backups.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The backup could not be created.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const download = async (id: string, label: string) => {
    try {
      const blob = await downloadBackup(instance.id, id);
      const url = URL.createObjectURL(blob);
      const anchor = document.createElement('a');
      anchor.href = url;
      anchor.download = `${label}.tar.gz`;
      document.body.appendChild(anchor);
      anchor.click();
      anchor.remove();
      URL.revokeObjectURL(url);
    } catch (error) {
      push(error instanceof Error ? error.message : 'The backup could not be downloaded.', 'error');
    }
  };

  const restore = async (id: string) => {
    try {
      await restoreBackup(instance.id, id);
      push('The backup is being restored. The files of the container are replaced by the archive.', 'ok');
      setPendingRestore(null);
    } catch (error) {
      push(error instanceof Error ? error.message : 'The backup was not restored.', 'error');
    }
  };

  const remove = async (id: string) => {
    try {
      await deleteBackup(instance.id, id);
      push('The backup was deleted.', 'ok');
      backups.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The backup was not deleted.', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Backup',
      truncate: true,
      render: (row: (typeof rows)[number]) => <span className="break-words">{row.name}</span>,
    },
    {
      key: 'size',
      header: 'Size',
      align: 'right',
      nowrap: true,
      render: (row: (typeof rows)[number]) => <span className="font-mono">{fmtBytes(row.size)}</span>,
    },
    {
      key: 'created',
      header: 'Created',
      nowrap: true,
      render: (row: (typeof rows)[number]) => (
        <span className="whitespace-nowrap font-mono text-[13px]">{fmtDateTime(row.created_at)}</span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      nowrap: true,
      render: (row: (typeof rows)[number]) => (
        <StatusPill status={row.is_locked ? 'locked' : 'available'} label={row.is_locked ? 'Locked' : 'Available'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row: (typeof rows)[number]) => (
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton onClick={() => download(row.id, row.name)}>Download</SoftButton>
          <SoftButton onClick={() => setPendingRestore({ id: row.id, name: row.name })}>Restore</SoftButton>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.name })}>Delete</DangerButton>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Backups"
        description="Archives of the files of the container. The panel writes them on the node of the instance."
        action={
          <PrimaryButton onClick={create} disabled={busy || name.trim().length === 0}>
            {busy ? 'Asking…' : 'New backup'}
          </PrimaryButton>
        }
      >
        <div className="mb-4 grid gap-3 sm:grid-cols-[1fr_auto] sm:items-end">
          <TextInput
            label="Name of the backup"
            value={name}
            onChange={(event) => setName(event.target.value)}
            placeholder="Nightly"
            autoComplete="off"
          />
          <label className="flex h-14 items-center gap-2 rounded-full bg-s2 px-5 text-[14px] text-ink">
            <input
              type="checkbox"
              checked={locked}
              onChange={(event) => setLocked(event.target.checked)}
              className="h-4 w-4 accent-[var(--color-acc)]"
            />
            Lock it
          </label>
        </div>

        {backups.loading ? (
          <LoadingBlock rows={2} label="Loading the backups" />
        ) : backups.error ? (
          <ApiErrorState error={backups.error} onRetry={backups.reload} title="We could not load the backups" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No backups yet."
            description="A backup is an archive of the files of the container. It is written by the panel on the node."
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => row.id} />
            <CardList rows={rows} rowKey={(row) => row.id}>
              {(row) => (
                <ListRow
                  title={row.name}
                  meta={
                    <span className="font-mono">
                      {fmtBytes(row.size)} · {fmtDateTime(row.created_at)}
                    </span>
                  }
                  right={
                    <div className="flex flex-wrap justify-end gap-2">
                      <SoftButton onClick={() => download(row.id, row.name)}>Download</SoftButton>
                      <SoftButton onClick={() => setPendingRestore({ id: row.id, name: row.name })}>Restore</SoftButton>
                      <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.name })}>Delete</DangerButton>
                    </div>
                  }
                />
              )}
            </CardList>
          </>
        )}
      </Panel>

      <ConfirmDialog
        open={pendingRestore !== null}
        title="Restore this backup?"
        description={
          pendingRestore
            ? `The files of the container are replaced by the archive "${pendingRestore.name}". What is in the container now and is not in the backup is lost.`
            : undefined
        }
        confirmLabel="Restore the backup"
        onCancel={() => setPendingRestore(null)}
        onConfirm={() => pendingRestore && restore(pendingRestore.id)}
      />

      <ConfirmDialog
        open={pendingDelete !== null}
        title="Delete this backup?"
        description={
          pendingDelete ? `The backup "${pendingDelete.name}" is removed from the node. This cannot be undone.` : undefined
        }
        confirmLabel="Delete the backup"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
      />
    </div>
  );
}

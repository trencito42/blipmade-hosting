import { ButtonGroup } from '../components/premium';
import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { deleteBackup, downloadBackup, listBackups } from '../../lib/instance-api';
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
  SoftButton,
  StatusPill,
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
  const [pendingDelete, setPendingDelete] = useState<{ id: string; name: string } | null>(null);

  const rows = backups.data?.backups ?? [];
  const limit = backups.data?.limit;
  const preset = backups.data?.preset ?? 'off';


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
        <div className="flex flex-wrap gap-1.5">
          <StatusPill status={row.is_locked ? 'locked' : 'available'} label={row.is_locked ? 'Locked' : 'Available'} />
          <StatusPill status="available" label={row.kind === 'scheduled' ? 'Automatic' : 'Manual'} />
        </div>
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row: (typeof rows)[number]) => (
        <ButtonGroup label="Actions" className="justify-end">
          <SoftButton onClick={() => download(row.id, row.name)} title="Download this backup">Download</SoftButton>
          <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/backups/${encodeURIComponent(row.id)}/restore`} variant="soft" title="Restore this backup. The current files are replaced.">Restore</ButtonLink>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.name })} title="Delete this backup for good">Delete</DangerButton>
        </ButtonGroup>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Automatic backups"
        description="A backup of the files at 03:30 UTC, made for you. Backups that are not locked are rotated: the oldest goes when a new one needs room. Lock one to keep it."
        action={<ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/backup-schedule/edit`}>Edit schedule</ButtonLink>}
      >
        <StatusPill status={preset === 'off' ? 'stopped' : 'available'} label={preset === 'off' ? 'Off' : preset === 'daily' ? 'Every day · 03:30 UTC' : 'Every Sunday · 03:30 UTC'} />
        <p className="mt-3 text-[13px] text-ink3">
          {backups.data?.nextRun && preset !== 'off' ? `Next one: ${fmtDateTime(backups.data.nextRun)}. ` : ''}
          {backups.data?.lastRun ? `Last one: ${fmtDateTime(backups.data.lastRun)}. ` : ''}
          Backups are kept on the node of this server, not in another place. If the node is lost, they are lost with it: download the ones that matter.
        </p>
      </Panel>

      <Panel
        title="Backups"
        description={`Archives of the files of the container, written by the panel on the node of the instance.${limit ? ` ${rows.length} of ${limit} kept.` : ''}`}
        action={
          <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/backups/new`}>New backup</ButtonLink>
        }
      >
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
                      <SoftButton onClick={() => download(row.id, row.name)} title="Download this backup">Download</SoftButton>
                      <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/backups/${encodeURIComponent(row.id)}/restore`} variant="soft" title="Restore this backup. The current files are replaced.">Restore</ButtonLink>
                      <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.name })} title="Delete this backup for good">Delete</DangerButton>
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

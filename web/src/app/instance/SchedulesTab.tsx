import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import {
  deleteSchedule,
  listSchedules,
  runSchedule,
  updateSchedule,
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
  ButtonLink,
  SoftButton,
  StatusPill,
  useToast,
} from '../../ui-app';
import { ApiErrorState, fmtDateTime, type TabProps } from './common';
import type { TableColumn } from '../../lib/table';

/**
 * The scheduled tasks of the instance.
 *
 * A schedule runs an action on the server at a time that the customer picks.
 * The cron field is the one of the panel, so it is written the same way.
 */

export default function SchedulesTab({ instance }: TabProps) {
  const { push } = useToast();
  const schedules = useAsync((signal) => listSchedules(instance.id, signal), [instance.id]);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const rows = schedules.data?.schedules ?? [];

  const toggle = async (id: number, active: boolean) => {
    try {
      await updateSchedule(instance.id, id, { active: !active });
      schedules.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The schedule was not changed.', 'error');
    }
  };

  const run = async (id: number) => {
    try {
      await runSchedule(instance.id, id);
      push('The schedule is running now.', 'ok');
    } catch (error) {
      push(error instanceof Error ? error.message : 'The schedule did not run.', 'error');
    }
  };

  const remove = async (id: number) => {
    try {
      await deleteSchedule(instance.id, id);
      push('The schedule was deleted.', 'ok');
      schedules.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The schedule was not deleted.', 'error');
    } finally {
      setPendingDelete(null);
    }
  };

  const columns: TableColumn<(typeof rows)[number]>[] = [
    {
      key: 'name',
      header: 'Schedule',
      truncate: true,
      render: (row: (typeof rows)[number]) => <span className="break-words">{row.name}</span>,
    },
    {
      key: 'cron',
      header: 'When',
      nowrap: true,
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.cron}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      nowrap: true,
      render: (row: (typeof rows)[number]) => <span className="capitalize">{String(row.action)}</span>,
    },
    {
      key: 'next',
      header: 'Next run',
      nowrap: true,
      render: (row: (typeof rows)[number]) => (
        <span className="whitespace-nowrap font-mono text-[13px]">
          {row.next_run ? fmtDateTime(row.next_run) : '—'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      nowrap: true,
      render: (row: (typeof rows)[number]) => (
        <StatusPill status={row.active ? 'active' : 'paused'} label={row.active ? 'Active' : 'Paused'} />
      ),
    },
    {
      key: 'actions',
      header: '',
      align: 'right',
      render: (row: (typeof rows)[number]) => (
        <div className="flex flex-wrap justify-end gap-2">
          <SoftButton onClick={() => run(row.id)}>Run now</SoftButton>
          <SoftButton onClick={() => toggle(row.id, row.active)}>{row.active ? 'Pause' : 'Resume'}</SoftButton>
          <DangerButton onClick={() => setPendingDelete({ id: row.id, name: row.name })}>Delete</DangerButton>
        </div>
      ),
    },
  ];

  return (
    <div className="grid gap-3">
      <Panel
        title="Schedules"
        description="Tasks the panel runs on this instance at a time you pick."
        action={<ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/schedules/new`}>New schedule</ButtonLink>}
      >
        {schedules.loading ? (
          <LoadingBlock rows={2} label="Loading the schedules" />
        ) : schedules.error ? (
          <ApiErrorState error={schedules.error} onRetry={schedules.reload} title="We could not load the schedules" />
        ) : rows.length === 0 ? (
          <EmptyState
            title="No schedules."
            description="A schedule runs a power action, a command or a backup on this instance at a time you pick."
          />
        ) : (
          <>
            <DataTable columns={columns} rows={rows} rowKey={(row) => String(row.id)} />
            <CardList rows={rows} rowKey={(row) => String(row.id)}>
              {(row) => (
                <ListRow
                  title={row.name}
                  meta={
                    <span className="font-mono">
                      {row.cron} · {String(row.action)}
                    </span>
                  }
                  right={
                    <div className="flex flex-wrap justify-end gap-2">
                      <SoftButton onClick={() => run(row.id)}>Run now</SoftButton>
                      <SoftButton onClick={() => toggle(row.id, row.active)}>{row.active ? 'Pause' : 'Resume'}</SoftButton>
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
        open={pendingDelete !== null}
        title="Delete this schedule?"
        description={
          pendingDelete ? `The schedule "${pendingDelete.name}" is removed and does not run any more.` : undefined
        }
        confirmLabel="Delete the schedule"
        onCancel={() => setPendingDelete(null)}
        onConfirm={() => pendingDelete && remove(pendingDelete.id)}
      />
    </div>
  );
}

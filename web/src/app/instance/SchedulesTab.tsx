import { useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import {
  createSchedule,
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
  PrimaryButton,
  Select,
  SoftButton,
  StatusPill,
  TextInput,
  useToast,
} from '../../ui-app';
import { ApiErrorState, fmtDateTime, type TabProps } from './common';
import type { ScheduleAction } from '../../lib/instance-api';

/**
 * The scheduled tasks of the instance.
 *
 * A schedule runs an action on the server at a time that the customer picks.
 * The cron field is the one of the panel, so it is written the same way.
 */

const ACTIONS = [
  { value: 'power', label: 'Power' },
  { value: 'command', label: 'Command' },
  { value: 'backup', label: 'Backup' },
];

export default function SchedulesTab({ instance }: TabProps) {
  const { push } = useToast();
  const schedules = useAsync((signal) => listSchedules(instance.id, signal), [instance.id]);
  const [creating, setCreating] = useState(false);
  const [form, setForm] = useState<{ name: string; cron: string; action: ScheduleAction; payload: string }>({
    name: '',
    cron: '0 0 * * *',
    action: 'power',
    payload: '',
  });
  const [busy, setBusy] = useState(false);
  const [formError, setFormError] = useState<string | null>(null);
  const [pendingDelete, setPendingDelete] = useState<{ id: number; name: string } | null>(null);

  const rows = schedules.data?.schedules ?? [];

  const create = async () => {
    setBusy(true);
    setFormError(null);
    try {
      const payload: Record<string, unknown> = {};
      if (form.action === 'power') payload.signal = 'restart';
      if (form.action === 'command') payload.command = form.payload.trim();
      await createSchedule(instance.id, {
        name: form.name.trim(),
        cron: form.cron.trim(),
        action: form.action,
        active: true,
        payload,
      });
      push('The schedule was created.', 'ok');
      setForm({ name: '', cron: '0 0 * * *', action: 'power', payload: '' });
      setCreating(false);
      schedules.reload();
    } catch (error) {
      setFormError(error instanceof Error ? error.message : 'The schedule could not be created.');
    } finally {
      setBusy(false);
    }
  };

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

  const columns = [
    {
      key: 'name',
      header: 'Schedule',
      render: (row: (typeof rows)[number]) => <span className="break-words">{row.name}</span>,
    },
    {
      key: 'cron',
      header: 'When',
      render: (row: (typeof rows)[number]) => <span className="font-mono">{row.cron}</span>,
    },
    {
      key: 'action',
      header: 'Action',
      render: (row: (typeof rows)[number]) => <span className="capitalize">{String(row.action)}</span>,
    },
    {
      key: 'next',
      header: 'Next run',
      render: (row: (typeof rows)[number]) => (
        <span className="whitespace-nowrap font-mono text-[13px]">
          {row.next_run ? fmtDateTime(row.next_run) : '—'}
        </span>
      ),
    },
    {
      key: 'state',
      header: 'State',
      render: (row: (typeof rows)[number]) => (
        <StatusPill status={row.active ? 'active' : 'paused'} label={row.active ? 'Active' : 'Paused'} />
      ),
    },
    {
      key: 'actions',
      header: '',
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
        action={
          <PrimaryButton onClick={() => setCreating((value) => !value)} disabled={busy}>
            {creating ? 'Close' : 'New schedule'}
          </PrimaryButton>
        }
      >
        {creating && (
          <div className="mb-4 grid gap-3 rounded-2xl bg-s2 p-3.5">
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput
                label="Name"
                value={form.name}
                onChange={(event) => setForm({ ...form, name: event.target.value })}
                placeholder="Every night"
                autoComplete="off"
              />
              <TextInput
                label="When"
                value={form.cron}
                onChange={(event) => setForm({ ...form, cron: event.target.value })}
                placeholder="0 0 * * *"
                hint="Five fields: minute, hour, day, month, weekday."
                autoComplete="off"
              />
              <Select
                label="Action"
                value={form.action}
                onChange={(event) => setForm({ ...form, action: event.target.value as ScheduleAction })}
              >
                {ACTIONS.map((action) => (
                  <option key={action.value} value={action.value}>
                    {action.label}
                  </option>
                ))}
              </Select>
              {form.action === 'command' && (
                <TextInput
                  label="Command"
                  value={form.payload}
                  onChange={(event) => setForm({ ...form, payload: event.target.value })}
                  placeholder="npm run start"
                  autoComplete="off"
                />
              )}
            </div>
            {formError && (
              <p role="alert" className="px-1 text-[12.5px] font-medium text-bad">
                {formError}
              </p>
            )}
            <div className="flex flex-wrap gap-2">
              <PrimaryButton onClick={create} disabled={busy || !form.name.trim() || !form.cron.trim()}>
                {busy ? 'Creating…' : 'Create the schedule'}
              </PrimaryButton>
              <SoftButton onClick={() => setCreating(false)} disabled={busy}>
                Cancel
              </SoftButton>
            </div>
          </div>
        )}

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

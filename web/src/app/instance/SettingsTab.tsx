import { useEffect, useState } from 'react';
import { useAsync } from '../../lib/useAsync';
import { getSettings, reinstallInstance, setSuspended, updateSettings } from '../../lib/instance-api';
import {
  ConfirmDialog,
  DangerButton,
  EmptyState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextInput,
  useToast,
} from '../../ui-app';
import { ApiErrorState, Detail, fmtDateTime, type TabProps } from './common';

/**
 * The settings of the instance and the operations that destroy something.
 *
 * The name and the description are changed on the panel as well, so both places
 * show the same thing. The reinstall and the suspension are the two operations
 * that cannot be undone, so they ask for a confirmation that names the cost.
 */

export default function SettingsTab({ instance, onGoTo }: TabProps) {
  const { push } = useToast();
  const settings = useAsync((signal) => getSettings(instance.id, signal), [instance.id]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [busy, setBusy] = useState(false);
  const [confirmReinstall, setConfirmReinstall] = useState(false);
  const [confirmSuspend, setConfirmSuspend] = useState(false);
  const [confirmResume, setConfirmResume] = useState(false);

  useEffect(() => {
    const current = settings.data;
    if (!current) return;
    setName(current.name ?? '');
    setDescription(current.description ?? '');
  }, [settings.data]);

  const save = async () => {
    setBusy(true);
    try {
      await updateSettings(instance.id, { name: name.trim(), description });
      push('The settings were saved.', 'ok');
      settings.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The settings were not saved.', 'error');
    } finally {
      setBusy(false);
    }
  };

  const reinstall = async () => {
    try {
      await reinstallInstance(instance.id);
      push('The server was reinstalled. The files of the container were erased.', 'ok');
      setConfirmReinstall(false);
    } catch (error) {
      push(error instanceof Error ? error.message : 'The server was not reinstalled.', 'error');
    }
  };

  const suspend = async () => {
    try {
      await setSuspended(instance.id, true);
      push('The instance was suspended. The container was stopped.', 'ok');
      setConfirmSuspend(false);
      settings.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The instance was not suspended.', 'error');
    }
  };

  const resume = async () => {
    try {
      await setSuspended(instance.id, false);
      push('The instance was restored. The container was started.', 'ok');
      setConfirmResume(false);
      settings.reload();
    } catch (error) {
      push(error instanceof Error ? error.message : 'The instance was not restored.', 'error');
    }
  };

  const current = settings.data;

  return (
    <div className="grid gap-3">
      {settings.loading ? (
        <Panel title="Settings">
          <LoadingBlock rows={3} label="Loading the settings" />
        </Panel>
      ) : settings.error ? (
        <Panel title="Settings">
          <ApiErrorState error={settings.error} onRetry={settings.reload} title="We could not load the settings" />
        </Panel>
      ) : (
        <>
          <Panel title="Name and description" description="What the server is called on the panel.">
            <div className="grid gap-3">
              <TextInput
                label="Name"
                value={name}
                onChange={(event) => setName(event.target.value)}
                autoComplete="off"
              />
              <TextInput
                label="Description"
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="What this instance is for"
                autoComplete="off"
              />
              <div className="flex flex-wrap gap-2">
                <PrimaryButton onClick={save} disabled={busy || name.trim().length === 0}>
                  {busy ? 'Saving…' : 'Save the settings'}
                </PrimaryButton>
              </div>
            </div>
          </Panel>

          <Panel title="What the panel knows" description="Read back from the panel, so it is the truth and not a copy.">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="State">
                <StatusPill status={current?.suspended ? 'suspended' : 'active'} label={current?.suspended ? 'Suspended' : 'Active'} />
              </Detail>
              <Detail label="Image" mono>
                {current?.docker_image || '—'}
              </Detail>
              <Detail label="Egg" mono>
                {current?.egg || '—'}
              </Detail>
              <Detail label="Memory limit" mono>
                {current?.limits?.memory ? `${current.limits.memory} MB` : '—'}
              </Detail>
              <Detail label="Disk limit" mono>
                {current?.limits?.disk ? `${current.limits.disk} MB` : '—'}
              </Detail>
              <Detail label="Reinstall">
                {current?.can_reinstall ? 'Allowed' : 'Not allowed'}
              </Detail>
            </dl>
          </Panel>

          <Panel
            title="Operations on the container"
            description="Reinstalling erases the files of the container. Suspending only stops it, and you can start it again at any time."
          >
            <div className="grid gap-3">
              <div className="grid gap-1.5 rounded-2xl bg-s2 p-3.5">
                <p className="text-[14.5px] font-medium text-ink">Reinstall the server</p>
                <p className="text-[13px] text-ink2">
                  The panel wipes the files of the container and installs it again. Everything the instance stores is lost.
                </p>
                <div className="pt-1">
                  <DangerButton onClick={() => setConfirmReinstall(true)}>Reinstall the server</DangerButton>
                </div>
              </div>

              <div className="grid gap-1.5 rounded-2xl bg-s2 p-3.5">
                <p className="text-[14.5px] font-medium text-ink">
                  {current?.suspended ? 'Restore the instance' : 'Suspend the instance'}
                </p>
                <p className="text-[13px] text-ink2">
                  {current?.suspended
                    ? 'The container is started again and the instance is marked as running.'
                    : 'The container is stopped and the instance is marked as suspended. It stays on the node.'}
                </p>
                <div className="pt-1">
                  {current?.suspended ? (
                    <SoftButton onClick={() => setConfirmResume(true)}>Restore the instance</SoftButton>
                  ) : (
                    /* Suspending stops the container and keeps every file, so
                       it is the same step as the restore next to it. */
                    <SoftButton onClick={() => setConfirmSuspend(true)}>Suspend the instance</SoftButton>
                  )}
                </div>
              </div>
            </div>
          </Panel>

          <Panel title="The instance" description="What Blipmade keeps for this instance.">
            <dl className="grid gap-3 sm:grid-cols-2">
              <Detail label="Created" mono>
                {fmtDateTime(instance.createdAt)}
              </Detail>
              <Detail label="Product">{instance.product?.name ?? '—'}</Detail>
              <Detail label="Status" mono>
                {instance.status}
              </Detail>
              <Detail label="Identifier" mono>
                {instance.id}
              </Detail>
            </dl>
            <div className="pt-3">
              <SoftButton onClick={() => onGoTo?.('activity')}>See the activity</SoftButton>
            </div>
          </Panel>
        </>
      )}

      <ConfirmDialog
        open={confirmReinstall}
        title="Reinstall this server?"
        description="The panel erases the files of the container and installs it again. Everything the instance stores is lost and cannot be recovered."
        confirmLabel="Reinstall the server"
        requireText={instance.name}
        onCancel={() => setConfirmReinstall(false)}
        onConfirm={reinstall}
      />

      <ConfirmDialog
        open={confirmSuspend}
        title="Suspend this instance?"
        description="The container is stopped and the instance is marked as suspended. The files stay on the node."
        confirmLabel="Suspend the instance"
        onCancel={() => setConfirmSuspend(false)}
        onConfirm={suspend}
      />

      <ConfirmDialog
        open={confirmResume}
        title="Restore this instance?"
        description="The container is started again and the instance is marked as running."
        confirmLabel="Restore the instance"
        onCancel={() => setConfirmResume(false)}
        onConfirm={resume}
      />
    </div>
  );
}

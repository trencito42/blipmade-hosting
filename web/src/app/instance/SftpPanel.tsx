import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ConfirmDialog, ErrorState, LoadingBlock, Panel, SoftButton, useToast } from '../../ui-app';
import type { TabProps } from './common';

interface Sftp { host: string | null; port: number; username: string }

/** The SFTP login of the service, for programs like FileZilla or WinSCP. The password is made here and shown once. */
export default function SftpPanel({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/sftp`;
  const state = useAsync<Sftp>((signal) => get<Sftp>(base, undefined, signal), [instance.id]);
  const [password, setPassword] = useState<string | null>(null);
  const [confirm, setConfirm] = useState(false);
  const make = useAction(async () => {
    const answer = await post<{ password: string }>(`${base}/password`);
    setPassword(answer.password);
    setConfirm(false);
  });
  const copy = async (text: string) => {
    try {
      await navigator.clipboard.writeText(text);
      push('Copied.', 'ok');
    } catch {
      push('Select the text and copy it by hand.', 'error');
    }
  };
  if (state.loading && !state.data) return <LoadingBlock rows={1} label="Loading the SFTP login" />;
  if (state.error) return <ErrorState title="The SFTP login could not be loaded" message={state.error.message} onRetry={state.reload} />;
  const data = state.data;
  if (!data) return null;
  return (
    <Panel title="SFTP" description="Upload and download files with a program like FileZilla or WinSCP. The password is for your whole account, so making a new one stops the old one on all your services.">
      <div className="grid gap-2 text-[14px]">
        <p>Host: <code className="font-mono">{data.host ?? 'the address of your node (ask support)'}</code> · Port: <code className="font-mono">{data.port}</code></p>
        <p>Username: <code className="break-all font-mono">{data.username}</code></p>
        {password ? (
          <div className="grid gap-2 rounded-2xl bg-s2 p-3.5">
            <p>Password (shown once): <code className="break-all font-mono">{password}</code></p>
            <div><SoftButton onClick={() => void copy(password)}>Copy the password</SoftButton></div>
          </div>
        ) : (
          <div><SoftButton onClick={() => setConfirm(true)}>Make a password</SoftButton></div>
        )}
        {make.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{make.error}</p>}
      </div>
      <ConfirmDialog
        open={confirm}
        title="Make a new SFTP password?"
        description="The old SFTP password, if you had one, stops working. The new one is shown once."
        confirmLabel="Make it"
        busy={make.pending}
        onConfirm={() => void make.run()}
        onCancel={() => setConfirm(false)}
      />
    </Panel>
  );
}

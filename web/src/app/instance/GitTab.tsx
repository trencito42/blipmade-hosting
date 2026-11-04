import { useEffect, useState } from 'react';
import { del, get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ButtonLink, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, StatusPill, useToast } from '../../ui-app';
import type { TabProps } from './common';

interface GitState {
  supported: boolean;
  configured: boolean;
  repoUrl?: string;
  branch?: string;
  buildCommand?: string;
  startCommand?: string;
  autoDeploy?: boolean;
  webhookUrl?: string;
  hasWebhookSecret?: boolean;
  envKeys?: string[];
  status?: { state: string; id: string; release: string; commit: string; at: string | null; message: string };
  releases?: string[];
  current?: string | null;
}

interface Deployment {
  id: string;
  state: string;
  action: string;
  by: string;
  release: string;
  commit: string;
  message: string;
  at: string;
}

const when = (value: string) => new Date(value).toLocaleString('en-GB', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });

/**
 * Deploy from a public Git repository. The code is fetched, built and started inside this server's own container, with
 * the memory, CPU and disk of the plan; nothing is built anywhere else.
 */
export default function GitTab({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/git`;
  const state = useAsync<GitState>((signal) => get<GitState>(base, undefined, signal), [instance.id]);
  const history = useAsync<{ deployments: Deployment[] }>((signal) => get(`${base}/deployments`, undefined, signal), [instance.id]);
  const [log, setLog] = useState<{ id: string; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const data = state.data;

  // While a build runs, the page looks again every few seconds.
  const building = data?.status?.state === 'building' || data?.status?.state === 'built' || history.data?.deployments.some((entry) => entry.state === 'started');
  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => { state.reload(); history.reload(); }, 5000);
    return () => window.clearInterval(timer);
  }, [building, state, history]);

  const deploy = useAction(async () => {
    await post(`${base}/deploy`);
    push('The deployment was queued.', 'ok');
    state.reload();
    history.reload();
  });
  const rotate = useAction(async () => {
    const answer = await post<{ webhookSecret: string }>(`${base}/webhook-secret`);
    setSecret(answer.webhookSecret);
  });
  const remove = useAction(async () => {
    await del(base);
    push('Git deployment is off. The server has its own startup command again.', 'ok');
    setConfirmRemove(false);
    state.reload();
    history.reload();
  });
  const installTemplate = useAction(async (template: 'moderation' | 'welcome' | 'tickets') => {
    const answer = await post<{ note: string }>(`/instances/${encodeURIComponent(instance.id)}/discord-template`, { template });
    push(answer.note, 'ok');
  });
  const uploadZip = useAction(async (file: File) => {
    if (file.size > 8 * 1024 * 1024) throw new Error('The zip is larger than 8 MB.');
    const bytes = new Uint8Array(await file.arrayBuffer());
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    const answer = await post<{ queued: boolean; note: string }>(`${base.replace(/\/git$/, '/archive')}`, { zipBase64: btoa(binary), buildCommand: 'npm install', startCommand: data?.startCommand || 'npm start' });
    push(answer.note, 'ok');
    state.reload();
  });
  const showLog = useAction(async (id: string) => {
    const answer = await get<{ log: string }>(`${base}/log`, { deploy: id });
    setLog({ id, text: answer.log });
  });

  if (state.loading && !data) return <LoadingBlock rows={2} label="Loading the deployment settings" />;
  if (state.error) return <ErrorState title="The deployment settings could not be loaded" message={state.error.message} onRetry={state.reload} />;
  if (data && !data.supported) {
    return <EmptyState title="Deploy from Git is not available for this product." description="It works for Node.js apps and bots. For other products, upload your files in the Files tab." />;
  }

  return (
    <div className="grid gap-4">
      <Panel
        title="Repository"
        description="A public repository on GitHub, GitLab, Bitbucket or Codeberg. It is cloned, built and started inside this server, with the memory, CPU and disk of your plan."
        action={<div className="flex flex-wrap gap-2"><ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/git/${data?.configured ? 'settings' : 'connect'}`} variant="soft">{data?.configured ? 'Edit settings' : 'Connect repository'}</ButtonLink>{data?.configured && <PrimaryButton onClick={() => void deploy.run()} disabled={deploy.pending || building}>{building ? 'Deploying…' : 'Deploy now'}</PrimaryButton>}</div>}
      >
        {data?.configured ? <div className="grid gap-3 text-[13.5px] sm:grid-cols-2"><div><p className="text-ink3">Repository</p><p className="mt-1 break-all font-mono text-ink">{data.repoUrl}</p></div><div><p className="text-ink3">Branch</p><p className="mt-1 font-mono text-ink">{data.branch}</p></div><div><p className="text-ink3">Build</p><p className="mt-1 font-mono text-[12.5px] text-ink">{data.buildCommand?.trim() ? data.buildCommand : 'None — only the clone runs.'}</p></div><div><p className="text-ink3">Start</p><p className="mt-1 font-mono text-[12.5px] text-ink">{data.startCommand}</p></div><div><p className="text-ink3">Automatic deploy</p><p className="mt-1 text-ink">{data.autoDeploy ? 'Enabled' : 'Off'}</p></div><div className="flex items-end"><SoftButton onClick={() => setConfirmRemove(true)}>Turn off Git deployment</SoftButton></div></div> : <EmptyState title="No repository connected." description="Connect a public Git repository to configure build and start commands." />}
      </Panel>

      {data?.configured && (
        <Panel title="Live application files" description="Deployments keep releases under .blipmade/releases. The running app is always .blipmade/current — the root folder may look empty on purpose.">
          <p className="text-[13.5px] text-ink2">
            {data.current ? (
              <>Active release <span className="font-mono text-ink">{data.current}</span>{data.status?.commit ? <> · commit <span className="font-mono">{data.status.commit}</span></> : null}</>
            ) : (
              'No successful release yet.'
            )}
          </p>
          {data.current && (
            <p className="mt-2 text-[13px] text-ink3">
              In Files, open <span className="font-mono text-ink">.blipmade/current</span> to browse the deployed source and build output.
            </p>
          )}
        </Panel>
      )}

      {(secret || (data?.configured && data.autoDeploy)) && (
        <Panel title="Webhook" description="In your repository: Settings → Webhooks → Add webhook. Content type application/json, event: just the push event.">
          <div className="grid gap-2 text-[13.5px]">
            <p>Payload URL: <code className="break-all font-mono">{data?.webhookUrl}</code></p>
            {secret ? (
              <p>Secret (shown once, copy it now): <code className="break-all font-mono">{secret}</code></p>
            ) : (
              <p className="text-ink3">The secret was shown when it was made. <button type="button" className="underline" onClick={() => void rotate.run()}>Make a new one</button></p>
            )}
          </div>
        </Panel>
      )}

      <Panel title="Deployments" description="What was deployed, when, and what came of it. The last 3 releases are kept, so you can go back.">
        {history.loading && !history.data ? (
          <LoadingBlock rows={1} label="Loading the history" />
        ) : (history.data?.deployments.length ?? 0) === 0 ? (
          <EmptyState title="Nothing deployed yet." description="Save the repository and press Deploy now." />
        ) : (
          <ul className="grid gap-2">
            {history.data!.deployments.map((entry) => (
              <li key={entry.id} className="grid gap-1.5 rounded-2xl bg-s2 p-4">
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <span className="flex items-center gap-2 text-[14px] font-semibold text-ink">
                    <StatusPill status={entry.state === 'succeeded' ? 'available' : entry.state === 'failed' ? 'failed' : 'pending'} label={entry.state === 'started' ? 'running' : entry.state} />
                    {entry.action === 'rollback' ? 'Rollback' : 'Deploy'} {entry.commit && <span className="font-mono text-[12.5px] font-normal text-ink2">{entry.commit}</span>}
                  </span>
                  <span className="text-[12.5px] text-ink3">{when(entry.at)} · {entry.by}</span>
                </div>
                {entry.message && <p className="text-[12.5px] text-ink2">{entry.message}</p>}
                <div className="flex flex-wrap gap-2">
                  <SoftButton onClick={() => void showLog.run(entry.id)}>Log</SoftButton>
                  {entry.state === 'succeeded' && entry.release && entry.release !== data?.current && (data?.releases ?? []).includes(entry.release) && (
                    <ButtonLink to={`/app/instances/${encodeURIComponent(instance.id)}/git/deployments/${encodeURIComponent(entry.id)}/rollback`} variant="soft">Go back to this</ButtonLink>
                  )}
                </div>
              </li>
            ))}
          </ul>
        )}
      </Panel>

      {log && (
        <Panel title={`Log of ${log.id.slice(0, 8)}`} action={<SoftButton onClick={() => setLog(null)}>Close</SoftButton>}>
          <pre className="max-h-96 overflow-auto rounded-2xl bg-s2 p-3.5 font-mono text-[12.5px] text-ink">{log.text || '(empty)'}</pre>
        </Panel>
      )}

      {instance.product.slug === 'discord-bot' && (
        <Panel title="Bot templates" description="Writes a starter into this bot and sets the start command, unless Git deployment already owns startup. Put DISCORD_TOKEN in the environment before restarting.">
          <div className="flex flex-wrap gap-2">
            {(['moderation', 'welcome', 'tickets'] as const).map((template) => (
              <SoftButton key={template} onClick={() => void installTemplate.run(template)} disabled={installTemplate.pending}>{template}</SoftButton>
            ))}
          </div>
          {installTemplate.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{installTemplate.error}</p>}
        </Panel>
      )}
      <Panel title="Project zip" description="Upload a zip of at most 8 MB. It is unpacked and built inside this server. Nothing from the zip runs on the platform.">
        <label className="inline-flex h-11 cursor-pointer items-center rounded-xl border border-line px-4 text-[14px] font-semibold text-ink">
          Upload zip
          <input type="file" accept=".zip,application/zip" className="sr-only" onChange={(event) => { const file = event.target.files?.[0]; if (file) void uploadZip.run(file); }} />
        </label>
        {uploadZip.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{uploadZip.error}</p>}
      </Panel>

      <ConfirmDialog
        open={confirmRemove}
        title="Turn off Git deployment?"
        description="The server gets its own startup command back. Your files and releases stay where they are."
        confirmLabel="Turn off"
        busy={remove.pending}
        onConfirm={() => void remove.run()}
        onCancel={() => setConfirmRemove(false)}
      />
    </div>
  );
}

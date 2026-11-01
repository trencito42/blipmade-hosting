import { useEffect, useState } from 'react';
import { del, get, post, put } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, StatusPill, TextInput, useToast } from '../../ui-app';
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
  const [form, setForm] = useState({ repoUrl: '', branch: 'main', buildCommand: '', startCommand: 'npm start', autoDeploy: false });
  const [envText, setEnvText] = useState('');
  const [log, setLog] = useState<{ id: string; text: string } | null>(null);
  const [secret, setSecret] = useState<string | null>(null);
  const [confirmRemove, setConfirmRemove] = useState(false);
  const data = state.data;

  useEffect(() => {
    if (data?.configured) {
      setForm({ repoUrl: data.repoUrl ?? '', branch: data.branch ?? 'main', buildCommand: data.buildCommand ?? '', startCommand: data.startCommand ?? 'npm start', autoDeploy: Boolean(data.autoDeploy) });
    }
  }, [data?.configured, data?.repoUrl, data?.branch, data?.buildCommand, data?.startCommand, data?.autoDeploy]);

  // While a build runs, the page looks again every few seconds.
  const building = data?.status?.state === 'building' || history.data?.deployments.some((entry) => entry.state === 'started');
  useEffect(() => {
    if (!building) return;
    const timer = window.setInterval(() => { state.reload(); history.reload(); }, 5000);
    return () => window.clearInterval(timer);
  }, [building, state, history]);

  const save = useAction(async () => {
    // One line per variable, NAME=value. A line with only NAME keeps the value that is already there.
    const env: Record<string, string | null> = {};
    for (const line of envText.split('\n')) {
      const trimmed = line.trim();
      if (!trimmed || trimmed.startsWith('#')) continue;
      const at = trimmed.indexOf('=');
      if (at === -1) env[trimmed] = null;
      else env[trimmed.slice(0, at).trim()] = trimmed.slice(at + 1);
    }
    const answer = await put<{ saved: boolean; webhookSecret: string | null }>(base, { ...form, ...(envText.trim() || data?.configured ? { env } : {}) });
    if (answer.webhookSecret) setSecret(answer.webhookSecret);
    push('Saved. Start a deploy to build it.', 'ok');
    setEnvText('');
    state.reload();
  });
  const deploy = useAction(async () => {
    await post(`${base}/deploy`);
    push('The deployment was queued.', 'ok');
    state.reload();
    history.reload();
  });
  const rollback = useAction(async (release: string) => {
    await post(`${base}/rollback`, { release });
    push('The rollback was queued.', 'ok');
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
        action={data?.configured ? <PrimaryButton onClick={() => void deploy.run()} disabled={deploy.pending || building}>{building ? 'Deploying…' : 'Deploy now'}</PrimaryButton> : undefined}
      >
        <div className="grid gap-3">
          <TextInput label="Repository address" value={form.repoUrl} onChange={(event) => setForm({ ...form, repoUrl: event.target.value })} placeholder="https://github.com/you/app" autoComplete="off" spellCheck={false} />
          <div className="grid gap-3 sm:grid-cols-2">
            <TextInput label="Branch" value={form.branch} onChange={(event) => setForm({ ...form, branch: event.target.value })} autoComplete="off" spellCheck={false} />
            <TextInput label="Build command" hint="Optional. Runs once per deploy, at most 15 minutes." value={form.buildCommand} onChange={(event) => setForm({ ...form, buildCommand: event.target.value })} placeholder="npm ci && npm run build" autoComplete="off" spellCheck={false} />
          </div>
          <TextInput label="Start command" hint="Your app must listen on the port in the SERVER_PORT variable." value={form.startCommand} onChange={(event) => setForm({ ...form, startCommand: event.target.value })} placeholder="npm start" autoComplete="off" spellCheck={false} />
          <label className="grid gap-1.5 text-[14px] text-ink">
            <span className="font-medium">Environment variables</span>
            <textarea
              value={envText}
              onChange={(event) => setEnvText(event.target.value)}
              rows={4}
              spellCheck={false}
              placeholder={data?.envKeys?.length ? `Already set: ${data.envKeys.join(', ')}. Write NAME=value to add or change one. The values are not shown again.` : 'NODE_ENV=production\nDATABASE_URL=...'}
              className="rounded-2xl border border-line bg-card p-3 font-mono text-[13px] text-ink outline-none focus:border-acc"
            />
            <span className="text-[12.5px] text-ink3">Kept in the container only, in a file only the container reads. A line with just NAME keeps the current value.</span>
          </label>
          <label className="flex items-center gap-2 text-[14px] text-ink">
            <input type="checkbox" checked={form.autoDeploy} onChange={(event) => setForm({ ...form, autoDeploy: event.target.checked })} className="h-4 w-4 accent-[var(--color-acc)]" />
            Deploy when I push to this branch (GitHub webhook)
          </label>
          {save.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
          <div className="flex flex-wrap gap-2">
            <PrimaryButton onClick={() => void save.run()} disabled={save.pending || !form.repoUrl.trim()}>{save.pending ? 'Saving…' : 'Save'}</PrimaryButton>
            {data?.configured && <SoftButton onClick={() => setConfirmRemove(true)}>Turn off</SoftButton>}
          </div>
        </div>
      </Panel>

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
                    <SoftButton onClick={() => void rollback.run(entry.release)} disabled={rollback.pending || building}>Go back to this</SoftButton>
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

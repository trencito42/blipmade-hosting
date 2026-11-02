import { useEffect, useState } from 'react';
import { get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { LoadingBlock, Panel, PrimaryButton, SoftButton, TextArea, TextInput, useToast } from '../ui-app';

/**
 * The optional assistant of the staff: its settings, and the drafts it writes inside a conversation.
 *
 * It is off until an operator turns it on, and the key of the provider lives on the server: this page only learns whether
 * there is one. A draft is a draft: it is marked as not verified, nothing is sent by it, and the staff member decides.
 */

interface Config {
  enabled: boolean;
  baseUrl: string;
  model: string;
  temperature: number;
  maxOutputTokens: number;
  timeoutMs: number;
  dailyTokenLimit: number;
  instructions: string;
  useDocs: boolean;
  useTeamNotes: boolean;
}

export function AiSettings({ mayEdit }: { mayEdit: boolean }) {
  const toast = useToast();
  const loaded = useAsync((signal) => get<{ config: Config; credentialConfigured: boolean; usage: { tokens: number; calls: number; failures: number } }>('/admin/support/ai', undefined, signal), []);
  const [config, setConfig] = useState<Config | null>(null);
  useEffect(() => setConfig(loaded.data?.config ?? null), [loaded.data]);
  const save = useAction(async () => {
    await put('/admin/support/ai', config);
    toast.push('Assistant settings saved.', 'ok');
    loaded.reload();
  });
  if (loaded.loading && !config) return <LoadingBlock rows={2} label="Loading the assistant" />;
  if (!config || !loaded.data) return null;
  const set = (patch: Partial<Config>) => setConfig({ ...config, ...patch });
  return (
    <Panel title="Assistant for the staff" description="Writes drafts of replies, summaries and suggestions for a person to check. It has no tools and changes nothing. It is off until you switch it on.">
      <div className="grid gap-3">
        <p className="text-[13.5px] text-ink2">
          The key of the provider is {loaded.data.credentialConfigured ? 'set on the server' : 'not set on the server'} (SUPPORT_AI_API_KEY). It is never stored here and never shown. Today: {loaded.data.usage.calls} calls, {loaded.data.usage.tokens} tokens, {loaded.data.usage.failures} failed.
        </p>
        <label className="flex items-center gap-2 text-[14px] text-ink">
          <input type="checkbox" checked={config.enabled} onChange={(event) => set({ enabled: event.target.checked })} disabled={!mayEdit} className="size-5" />
          Switched on
        </label>
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput label="Address of the provider (OpenAI compatible, https)" value={config.baseUrl} onChange={(event) => set({ baseUrl: event.target.value })} disabled={!mayEdit} />
          <TextInput label="Model" value={config.model} onChange={(event) => set({ model: event.target.value })} disabled={!mayEdit} />
          <TextInput label="Temperature" type="number" value={String(config.temperature)} onChange={(event) => set({ temperature: Number(event.target.value) })} disabled={!mayEdit} />
          <TextInput label="Longest answer (tokens)" type="number" value={String(config.maxOutputTokens)} onChange={(event) => set({ maxOutputTokens: Number(event.target.value) })} disabled={!mayEdit} />
          <TextInput label="Seconds to wait for the provider" type="number" value={String(config.timeoutMs / 1000)} onChange={(event) => set({ timeoutMs: Math.round(Number(event.target.value) * 1000) })} disabled={!mayEdit} />
          <TextInput label="Tokens a day, at most" type="number" value={String(config.dailyTokenLimit)} onChange={(event) => set({ dailyTokenLimit: Number(event.target.value) })} disabled={!mayEdit} />
        </div>
        <TextArea label="Extra instructions (tone, signature). The safety rules stay above them." value={config.instructions} onChange={(event) => set({ instructions: event.target.value })} rows={3} maxLength={2000} disabled={!mayEdit} />
        <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={config.useDocs} onChange={(event) => set({ useDocs: event.target.checked })} disabled={!mayEdit} className="size-5" />Use the public documentation</label>
        <label className="flex items-center gap-2 text-[14px] text-ink"><input type="checkbox" checked={config.useTeamNotes} onChange={(event) => set({ useTeamNotes: event.target.checked })} disabled={!mayEdit} className="size-5" />Use the notes of the team (they go to the provider)</label>
        {save.error && <p role="alert" className="text-[13px] text-bad">{save.error}</p>}
        {mayEdit && <PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save</PrimaryButton>}
      </div>
    </Panel>
  );
}

const ACTIONS = [
  { value: 'suggest_reply', label: 'Draft a reply' },
  { value: 'summarize', label: 'Summarize' },
  { value: 'classify', label: 'Suggest category and priority' },
  { value: 'translate', label: 'Translate the last message' },
];

export function AiAssistant({ ticketId, onUse }: { ticketId: string; onUse: (text: string) => void }) {
  const state = useAsync((signal) => get<{ config: { enabled: boolean }; credentialConfigured: boolean }>('/admin/support/ai', undefined, signal), []);
  const [result, setResult] = useState<{ action: string; text: string } | null>(null);
  const run = useAction(async (action: string) => {
    const res = await post<{ ok: boolean; text?: string; message?: string }>(`/admin/support/conversations/${ticketId}/ai`, { action });
    if (!res.ok) throw new Error(res.message ?? 'The assistant is not available.');
    setResult({ action, text: res.text ?? '' });
  });
  if (!state.data?.config.enabled || !state.data.credentialConfigured) return null;
  return (
    <Panel title="Assistant" description="A draft from an assistant, not checked. Read it before you use it: it does not know refunds, prices, the state of a service or the account.">
      <div className="grid gap-3">
        <div className="flex flex-wrap gap-2">
          {ACTIONS.map((action) => <SoftButton key={action.value} onClick={() => void run.run(action.value)} disabled={run.pending}>{action.label}</SoftButton>)}
        </div>
        {run.pending && <p role="status" className="text-[13px] text-ink3">Writing…</p>}
        {run.error && <p role="alert" className="text-[13px] text-bad">{run.error}</p>}
        {result && (
          <div className="grid gap-2">
            <p className="whitespace-pre-wrap break-words rounded-2xl bg-s2 px-4 py-3 text-[14px] text-ink">{result.text}</p>
            <p className="text-[12px] text-ink3">Not verified.</p>
            {result.action === 'suggest_reply' && <SoftButton onClick={() => onUse(result.text)}>Put it in the reply box</SoftButton>}
          </div>
        )}
      </div>
    </Panel>
  );
}

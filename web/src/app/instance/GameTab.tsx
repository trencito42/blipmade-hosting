import { useState } from 'react';
import { get } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { getStartup, readFile, updateStartup, writeFile } from '../../lib/instance-api';
import { Panel, PrimaryButton, TextInput, useToast } from '../../ui-app';
import type { TabProps } from './common';
import { gameWorkspace, mergeConfigLines, readConfigValue } from './game-settings';

/** Settings that belong to this game. Other panel tools stay on their own tabs. */
export default function GameTab({ instance }: TabProps) {
  const toast = useToast();
  const capabilities = useAsync<{ slug: string; profile: { title: string; configKeys: { key: string; label: string; source: 'env' | 'properties' }[]; configFile: string | null } | null }>(
    (signal) => get(`/instances/${encodeURIComponent(instance.id)}/game-capabilities`, undefined, signal),
    [instance.id],
  );
  const workspace = gameWorkspace(instance.product.slug);
  const file = capabilities.data?.profile?.configFile ?? workspace?.fields.find((field) => field.file)?.file ?? null;
  const startup = useAsync((signal) => (workspace && !file ? getStartup(instance.id, signal) : Promise.resolve(null)), [instance.id, file, workspace?.slug]);
  const config = useAsync((signal) => (file ? readFile(instance.id, file, signal) : Promise.resolve(null)), [instance.id, file]);
  const [draft, setDraft] = useState<Record<string, string>>({});

  const fields = capabilities.data?.profile?.configKeys.length
    ? capabilities.data.profile.configKeys
    : workspace?.fields ?? [];
  if (!workspace && !fields.length) return null;
  const current = (key: string, source: 'env' | 'properties') => {
    if (key in draft) return draft[key] ?? '';
    if (source === 'env') return startup.data?.variables.find((variable) => variable.key === key)?.value ?? '';
    return config.data ? readConfigValue(config.data.content, key) : '';
  };
  const save = useAction(async () => {
    if (file) {
      const next = mergeConfigLines(config.data?.content ?? '', draft);
      await writeFile(instance.id, file, next);
      return true;
    }
    await updateStartup(instance.id, { environment: draft });
    return true;
  });
  const submit = async () => {
    const result = await save.run();
    if (!result) return;
    toast.push(file ? 'Saved. Restart the server to use it.' : 'Saved. The new values apply on the next start.', 'ok');
    setDraft({});
    if (file) config.reload();
    else startup.reload();
  };

  return (
    <Panel title={capabilities.data?.profile?.title ?? workspace?.title ?? 'Game'} description={workspace?.summary ?? 'Only settings this game actually stores.'}>
      <div className="grid gap-3">
        {fields.map((field) => (
          <TextInput
            key={field.key}
            label={field.label}
            value={current(field.key, field.source)}
            onChange={(event) => setDraft((values) => ({ ...values, [field.key]: event.target.value }))}
          />
        ))}
        <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || Object.keys(draft).length === 0}>
          {save.pending ? 'Saving…' : 'Save'}
        </PrimaryButton>
        {save.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{save.error}</p>}
      </div>
    </Panel>
  );
}

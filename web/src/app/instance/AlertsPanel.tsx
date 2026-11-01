import { useEffect, useState } from 'react';
import { get, put } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Panel, PrimaryButton, TextInput, useToast } from '../../ui-app';
import type { TabProps } from './common';

/** Tell the owner by email when the memory or the disk use passes a percentage of the plan. Empty means no alert. */
export default function AlertsPanel({ instance }: TabProps) {
  const { push } = useToast();
  const base = `/instances/${encodeURIComponent(instance.id)}/resource-alerts`;
  const state = useAsync<{ memoryPercent: number | null; diskPercent: number | null }>((signal) => get(base, undefined, signal), [instance.id]);
  const [memory, setMemory] = useState('');
  const [disk, setDisk] = useState('');
  useEffect(() => {
    if (state.data) {
      setMemory(state.data.memoryPercent === null ? '' : String(state.data.memoryPercent));
      setDisk(state.data.diskPercent === null ? '' : String(state.data.diskPercent));
    }
  }, [state.data]);
  const save = useAction(async () => {
    const parse = (value: string) => (value.trim() === '' ? null : Number(value));
    await put(base, { memoryPercent: parse(memory), diskPercent: parse(disk) });
    push('Saved. We check every five minutes.', 'ok');
    state.reload();
  });
  return (
    <Panel title="Resource alerts" description="An email when the memory or the disk use passes a percentage of your plan, so you can act before the service slows down or stops. Leave a field empty for no alert. At most one email every 6 hours.">
      <div className="grid gap-3 sm:grid-cols-2">
        <TextInput label="Memory, percent of the plan" inputMode="numeric" value={memory} onChange={(event) => setMemory(event.target.value.replace(/[^0-9]/g, ''))} placeholder="90" hint="From 50 to 99." autoComplete="off" />
        <TextInput label="Disk, percent of the plan" inputMode="numeric" value={disk} onChange={(event) => setDisk(event.target.value.replace(/[^0-9]/g, ''))} placeholder="85" hint="From 50 to 99." autoComplete="off" />
      </div>
      {save.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{save.error}</p>}
      <div className="mt-3"><PrimaryButton onClick={() => void save.run()} disabled={save.pending}>Save</PrimaryButton></div>
    </Panel>
  );
}

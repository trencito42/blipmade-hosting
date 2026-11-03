import { InfoTip } from '../../tooltip';
import { useEffect, useState } from 'react';
import { listBackups, setBackupSchedule, type BackupPreset } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';
import { fmtDateTime } from './common';

const options: { value: BackupPreset; title: string; detail: string }[] = [
  { value: 'off', title: 'Off', detail: 'Do not create backups automatically.' },
  { value: 'daily', title: 'Every day', detail: 'Create one backup daily at 03:30 UTC.' },
  { value: 'weekly', title: 'Every Sunday', detail: 'Create one backup every Sunday at 03:30 UTC.' },
];

export default function EditBackupSchedule() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const backups = useAsync((signal) => listBackups(id, signal), [id]);
  const [preset, setPreset] = useState<BackupPreset | null>(null);
  const initial = backups.data?.preset ?? 'off';
  useEffect(() => { if (backups.data && preset === null) setPreset(initial); }, [backups.data, initial, preset]);
  const selected = preset ?? initial;
  const dirty = preset !== null && selected !== initial;
  const backTo = `/app/instances/${encodeURIComponent(id)}/backups`;
  useUnsavedChangesGuard(dirty, 'Discard the backup schedule change?');
  const save = useAction(async () => setBackupSchedule(id, selected));
  const submit = async () => {
    const result = await save.run(); if (!result) return;
    toast.push(selected === 'off' ? 'Automatic backups are off.' : 'Backup schedule updated.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => { if (!dirty || window.confirm('Discard the backup schedule change?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance backups" title="Automatic backup schedule" description="Choose one supported provider schedule. Times are fixed so execution and rotation stay predictable." backTo={backTo} backLabel="Back to backups" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="flex items-center gap-1.5 text-[16px] font-semibold text-ink">Rotation<InfoTip text="Automatic backups use the same provider limit as manual ones. The oldest unlocked archive is removed when room is needed." /></h2>{backups.data?.nextRun && selected !== 'off' && <p className="mt-3 text-[12.5px] text-ink3">Current next run: {fmtDateTime(backups.data.nextRun)}</p>}{backups.data?.lastRun && <p className="mt-2 text-[12.5px] text-ink3">Last run: {fmtDateTime(backups.data.lastRun)}</p>}<p className="mt-3 text-[12.5px] leading-relaxed text-warn">Archives remain on this instance’s node. Download important copies elsewhere.</p></aside>}
    actions={<><SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || backups.loading || !dirty}>{save.pending ? 'Saving…' : 'Save schedule'}</PrimaryButton></>}>
    {backups.loading ? <LoadingBlock rows={3} label="Loading backup schedule" /> : backups.error ? <ErrorState title="Could not load the backup schedule" message={backups.error.message} onRetry={backups.reload} /> : <fieldset className="grid gap-3"><legend className="mb-1 text-[13px] font-semibold text-ink">Frequency</legend>{options.map((option) => <label key={option.value} className={`flex min-h-16 cursor-pointer items-start gap-3 rounded-2xl border p-4 transition ${selected === option.value ? 'border-acc bg-acc/5' : 'border-line bg-card hover:border-ink3/40'}`}><input type="radio" name="backup-preset" value={option.value} checked={selected === option.value} onChange={() => setPreset(option.value)} className="mt-1 size-5 accent-[var(--color-acc)]"/><span><strong className="block text-[14px] text-ink">{option.title}</strong><span className="mt-0.5 block text-[13px] text-ink3">{option.detail}</span></span></label>)}{save.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{save.error}</p>}</fieldset>}
  </PageEditorShell>;
}

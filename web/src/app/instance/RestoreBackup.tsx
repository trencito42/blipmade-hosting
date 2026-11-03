import { useMemo, useState } from 'react';
import { listBackups, restoreBackup } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';
import { fmtBytes, fmtDateTime } from './common';

export default function RestoreBackup() {
  const { id = '', backupId = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const backups = useAsync((signal) => listBackups(id, signal), [id]);
  const backup = useMemo(() => backups.data?.backups.find((row) => row.id === backupId), [backups.data, backupId]);
  const [confirmation, setConfirmation] = useState('');
  const [acknowledged, setAcknowledged] = useState(false);
  const [touched, setTouched] = useState(false);
  const backTo = `/app/instances/${encodeURIComponent(id)}/backups`;
  const dirty = Boolean(confirmation || acknowledged);
  useUnsavedChangesGuard(dirty, 'Discard this restore confirmation?');
  const restore = useAction(async () => restoreBackup(id, backupId));
  const matches = Boolean(backup && confirmation === backup.name);
  const confirmationError = touched && !matches ? `Type “${backup?.name ?? ''}” exactly.` : undefined;
  const submit = async () => {
    setTouched(true); if (!backup || !matches || !acknowledged) return;
    const result = await restore.run(); if (!result) return;
    toast.push('Restore started. Current container files are being replaced.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => { if (!dirty || window.confirm('Discard this restore confirmation?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance backups" title="Restore backup" description="Review the archive and explicitly confirm replacement of the current container files." backTo={backTo} backLabel="Back to backups" dirty={dirty}
    aside={backup ? <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="break-words text-[16px] font-semibold text-ink">{backup.name}</h2><dl className="mt-4 grid gap-3 text-[13px]"><div><dt className="text-ink3">Created</dt><dd className="mt-0.5 font-mono text-ink">{fmtDateTime(backup.created_at)}</dd></div><div><dt className="text-ink3">Archive size</dt><dd className="mt-0.5 font-mono text-ink">{fmtBytes(backup.size)}</dd></div><div><dt className="text-ink3">Retention</dt><dd className="mt-0.5 text-ink">{backup.is_locked ? 'Locked' : 'Available for rotation'}</dd></div></dl></aside> : undefined}
    actions={<><SoftButton type="button" onClick={discard} disabled={restore.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={restore.pending || backups.loading || !backup || !matches || !acknowledged}>{restore.pending ? 'Starting restore…' : 'Restore backup'}</PrimaryButton></>}>
    {backups.loading ? <LoadingBlock rows={3} label="Loading backup details" /> : backups.error ? <ErrorState title="Could not load the backup" message={backups.error.message} onRetry={backups.reload} /> : !backup ? <ErrorState title="Backup not found" message="This archive is no longer available. It may have been deleted or rotated." /> : <div className="grid gap-5"><div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4"><h2 className="text-[14px] font-semibold text-bad">Current files will be replaced</h2><p className="mt-1 text-[13px] leading-relaxed text-ink2">Files currently in the container that are not present in this archive will be lost. Stop writes and create a fresh backup first if you may need the current state.</p></div><TextInput label={`Type “${backup.name}” to confirm`} value={confirmation} onChange={(event) => setConfirmation(event.target.value)} error={confirmationError ?? restore.fieldErrors.confirmation} autoComplete="off"/><label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2"><input type="checkbox" checked={acknowledged} onChange={(event) => setAcknowledged(event.target.checked)} className="mt-0.5 size-5 accent-[var(--color-acc)]"/><span><strong className="block text-ink">I understand this replaces current files</strong>This operation cannot reconstruct files absent from the selected backup.</span></label>{touched && !acknowledged && <p role="alert" className="text-[13px] font-medium text-bad">Acknowledge the replacement before restoring.</p>}{restore.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{restore.error}</p>}</div>}
  </PageEditorShell>;
}

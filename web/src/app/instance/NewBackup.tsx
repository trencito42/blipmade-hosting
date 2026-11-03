import { useMemo, useState } from 'react';
import { createBackup, listBackups } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

export default function NewBackup() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const backups = useAsync((signal) => listBackups(id, signal), [id]);
  const [name, setName] = useState('');
  const [locked, setLocked] = useState(false);
  const [touched, setTouched] = useState(false);
  const rows = backups.data?.backups ?? [];
  const limit = backups.data?.limit;
  const backTo = `/app/instances/${encodeURIComponent(id)}/backups`;
  const dirty = Boolean(name || locked);
  useUnsavedChangesGuard(dirty, 'Discard this backup request?');
  const duplicate = useMemo(() => rows.some((row) => row.name.toLocaleLowerCase() === name.trim().toLocaleLowerCase()), [rows, name]);
  const nameError = touched && !name.trim() ? 'Enter a name for this backup.' : touched && name.trim().length > 80 ? 'Use at most 80 characters.' : touched && duplicate ? 'A backup with this name already exists.' : undefined;
  const create = useAction(async () => createBackup(id, { name: name.trim(), locked }));
  const submit = async () => {
    setTouched(true); if (nameError || !name.trim()) return;
    const result = await create.run(); if (!result) return;
    toast.push('Backup requested. The provider writes it in the background.'); navigate(backTo, { replace: true });
  };
  const discard = () => { if (!dirty || window.confirm('Discard this backup request?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance backups" title="Create a backup" description="Request an archive of the current container files. Creation runs asynchronously on the provider node." backTo={backTo} backLabel="Back to backups" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="text-[16px] font-semibold text-ink">Retention impact</h2><p className="mt-2 text-[13px] text-ink2">{limit ? `${rows.length} of ${limit} backup slots currently used` : `${rows.length} backups currently listed`}</p><p className="mt-3 text-[12.5px] leading-relaxed text-ink3">Unlocked backups may be rotated when the provider needs room. A locked backup is retained and consumes a slot until you delete or unlock it.</p><p className="mt-3 text-[12.5px] leading-relaxed text-warn">Backups stay on this instance’s node. Download important archives separately.</p></aside>}
    actions={<><SoftButton type="button" onClick={discard} disabled={create.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={create.pending || backups.loading}>{create.pending ? 'Requesting backup…' : 'Create backup'}</PrimaryButton></>}>
    {backups.loading ? <LoadingBlock rows={3} label="Loading backup retention" /> : backups.error ? <ErrorState title="Could not load backups" message={backups.error.message} onRetry={backups.reload} /> : <div className="grid gap-5"><TextInput label="Backup name" value={name} onChange={(event) => setName(event.target.value)} error={nameError ?? create.fieldErrors.name} placeholder="Before upgrade" maxLength={80} autoComplete="off"/><label className="flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border border-line bg-card p-3.5 text-[13.5px] text-ink2"><input type="checkbox" checked={locked} onChange={(event) => setLocked(event.target.checked)} className="mt-0.5 size-5 accent-[var(--color-acc)]"/><span><strong className="block text-ink">Lock this backup</strong>Keep it out of automatic rotation until it is explicitly removed.</span></label>{create.error && <p role="alert" className="rounded-2xl bg-bad/10 p-4 text-[13.5px] font-medium text-bad">{create.error}</p>}</div>}
  </PageEditorShell>;
}

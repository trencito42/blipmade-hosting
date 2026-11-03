import { useEffect, useState } from 'react';
import { getSettings, updateSettings } from '../../lib/instance-api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

export default function EditInstanceSettings() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const settings = useAsync((signal) => getSettings(id, signal), [id]);
  const [name, setName] = useState('');
  const [description, setDescription] = useState('');
  const [loaded, setLoaded] = useState(false);
  const [touched, setTouched] = useState(false);
  useEffect(() => {
    if (!settings.data || loaded) return;
    setName(settings.data.name ?? ''); setDescription(settings.data.description ?? ''); setLoaded(true);
  }, [settings.data, loaded]);
  useEffect(() => setLoaded(false), [id]);
  const originalName = settings.data?.name ?? '';
  const originalDescription = settings.data?.description ?? '';
  const dirty = loaded && (name !== originalName || description !== originalDescription);
  useUnsavedChangesGuard(dirty, 'Discard these instance settings?');
  const save = useAction(async () => updateSettings(id, { name: name.trim(), description: description.trim() }));
  const nameError = touched && !name.trim() ? 'Give this instance a name.' : touched && name.trim().length > 80 ? 'Use at most 80 characters.' : undefined;
  const descriptionError = touched && description.length > 500 ? 'Use at most 500 characters.' : undefined;
  const backTo = `/app/instances/${encodeURIComponent(id)}/settings`;
  const submit = async () => {
    setTouched(true); if (nameError || descriptionError || !name.trim()) return;
    const result = await save.run(); if (!result) return;
    toast.push('Instance settings saved.'); navigate(backTo, { replace: true });
  };
  const discard = () => { if (!dirty || window.confirm('Discard these instance settings?')) navigate(backTo); };
  return <PageEditorShell eyebrow="Instance settings" title="Edit name and description" description="These customer-facing values are saved to the real instance settings API and reflected by the provider panel." backTo={backTo} backLabel="Back to instance settings" dirty={dirty}
    aside={<aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24"><h2 className="text-[16px] font-semibold text-ink">Current provider state</h2><dl className="mt-3 grid gap-2 text-[13px] text-ink2"><div>State: {settings.data?.suspended ? 'Suspended' : 'Active'}</div><div className="break-all">Image: {settings.data?.docker_image ?? 'Not reported'}</div><div>Memory: {settings.data?.limits.memory ? `${settings.data.limits.memory} MB` : 'Not reported'}</div><div>Disk: {settings.data?.limits.disk ? `${settings.data.limits.disk} MB` : 'Not reported'}</div></dl><p className="mt-4 text-[12.5px] leading-relaxed text-ink3">Changing these labels does not restart, reinstall or resize the instance.</p></aside>}
    actions={<><SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || !dirty}>{save.pending ? 'Saving…' : 'Save settings'}</PrimaryButton></>}>
    {settings.loading && !loaded ? <LoadingBlock rows={3} label="Loading instance settings" /> : settings.error ? <ErrorState title="Could not load instance settings" message={settings.error.message} onRetry={settings.reload} /> : <div className="grid gap-5"><TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} error={nameError ?? save.fieldErrors.name} autoComplete="off" maxLength={80}/><TextArea label="Description" value={description} onChange={(event) => setDescription(event.target.value)} error={descriptionError ?? save.fieldErrors.description} rows={7} maxLength={500} hint={`${description.length}/500 characters`}/>{save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}</div>}
  </PageEditorShell>;
}

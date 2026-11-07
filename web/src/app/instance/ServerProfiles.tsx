import { useState } from 'react';
import { del, get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Link } from '../../router';
import { ConfirmDialog, Panel, PrimaryButton, SoftButton, TextInput, useToast } from '../../ui-app';

interface Profile { id: string; name: string; productSlug: string; ram: number; cpu: number; disk: number; manifest: unknown; snapshotSha256: string | null; createdAt: string }
interface Preview { eligible: boolean; blockers: string[]; changes: { install: { slug: string; version: string }[]; remove: { slug: string; version: string }[] } }
interface ActivationJob { id: string; profileId: string; status: string; progress: number; step: string; error: string | null }

/** Remembers the size of this server. Applying a different size goes through the existing resource change. */
export function ServerProfiles({ instance }: { instance: { id: string; ram: number; cpu: number; disk: number; product: { slug: string } } }) {
  const toast = useToast();
  const [name, setName] = useState('');
  const [selected, setSelected] = useState<Profile | null>(null);
  const [preview, setPreview] = useState<Preview | null>(null);
  const [recoveryJob, setRecoveryJob] = useState<string | null>(null);
  const state = useAsync<{ profiles: Profile[] }>((signal) => get(`/instances/${encodeURIComponent(instance.id)}/profiles`, undefined, signal), [instance.id]);
  const activations = useAsync<{ jobs: ActivationJob[] }>((signal) => get(`/instances/${encodeURIComponent(instance.id)}/profile-activations`, undefined, signal), [instance.id]);
  const save = useAction(async () => {
    await post(`/instances/${encodeURIComponent(instance.id)}/profiles`, { name: name.trim() });
    setName('');
    state.reload();
  });
  const remove = useAction(async (id: string) => {
    await del(`/instances/${encodeURIComponent(instance.id)}/profiles/${encodeURIComponent(id)}`);
    state.reload();
  });
  const inspect = useAction(async (profile: Profile) => {
    setSelected(profile);
    setPreview(await get(`/instances/${encodeURIComponent(instance.id)}/profiles/${encodeURIComponent(profile.id)}/activation-preview`));
  });
  const activate = useAction(async () => {
    if (!selected) return;
    await post(`/instances/${encodeURIComponent(instance.id)}/profiles/${encodeURIComponent(selected.id)}/activate`, { idempotencyKey: crypto.randomUUID() });
    toast.push('Activation queued. The locked backup runs before any file changes.', 'ok');
    setSelected(null); setPreview(null); activations.reload();
  });
  const recover = useAction(async (jobId: string) => {
    await post(`/instances/${encodeURIComponent(instance.id)}/profile-activations/${encodeURIComponent(jobId)}/recover`, {});
    toast.push('The panel accepted the restore request. Check the job before starting the server.', 'ok');
    activations.reload();
  });
  const profiles = state.data?.profiles ?? [];

  return (
    <Panel title="Saved profiles" description="A profile pins the catalogue variant and exact verified artifact releases. Activation makes and verifies a locked backup before changing files.">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <TextInput label="Profile name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Before the event" autoComplete="off" />
        </div>
        <PrimaryButton type="button" onClick={() => void save.run()} disabled={save.pending || !name.trim()}>Save current profile</PrimaryButton>
      </div>
      {save.error && <p role="alert" className="mt-2 text-[13.5px] text-bad">{save.error}</p>}
      <ul className="mt-3 grid gap-2">
        {profiles.map((profile) => {
          const same = profile.productSlug === instance.product.slug && profile.ram === instance.ram && profile.cpu === instance.cpu && profile.disk === instance.disk;
          return (
            <li key={profile.id} className="flex flex-wrap items-center gap-2 rounded-2xl bg-s2 px-3 py-2 text-[13.5px] text-ink2">
              <span className="font-semibold text-ink">{profile.name}</span>
              <span>{profile.ram} MB · {profile.cpu} vCPU · {profile.disk} GB{profile.manifest ? ' · manifest saved' : ''}</span>
              {same ? <span className="text-acc">Current</span> : <Link to={`/app/instances/${encodeURIComponent(instance.id)}/resources/edit?ram=${profile.ram}&cpu=${profile.cpu}&disk=${profile.disk}`} className="font-semibold text-acc">Apply this size</Link>}
              <SoftButton type="button" onClick={() => void inspect.run(profile)} disabled={inspect.pending || !profile.snapshotSha256}>Preview activation</SoftButton>
              <SoftButton type="button" onClick={() => void remove.run(profile.id)} disabled={remove.pending}>Delete</SoftButton>
            </li>
          );
        })}
        {!state.loading && profiles.length === 0 && <li className="text-[13px] text-ink3">No saved profiles yet.</li>}
      </ul>
      <div className="mt-4 flex items-center justify-between gap-2">
        <p className="text-[13px] font-semibold text-ink">Activation history</p>
        <SoftButton type="button" onClick={() => activations.reload()}>Refresh</SoftButton>
      </div>
      <ul className="mt-2 grid gap-2">
        {(activations.data?.jobs ?? []).map((job) => (
          <li key={job.id} className="rounded-xl bg-s2 px-3 py-2 text-[13px] text-ink2">
            <div className="flex flex-wrap items-center justify-between gap-2"><span>{job.step} · {job.progress}%</span><span className="font-semibold text-ink">{job.status.replaceAll('_', ' ')}</span></div>
            {job.error && <p className="mt-1 text-bad">{job.error}</p>}
            {job.status === 'recovery_required' && <SoftButton type="button" onClick={() => setRecoveryJob(job.id)} disabled={recover.pending}>Request restore</SoftButton>}
          </li>
        ))}
        {!activations.loading && !(activations.data?.jobs.length) && <li className="text-[13px] text-ink3">No activations yet.</li>}
      </ul>
      {(inspect.error || activate.error || recover.error) && <p role="alert" className="mt-2 text-[13.5px] text-bad">{inspect.error || activate.error || recover.error}</p>}
      <ConfirmDialog
        open={Boolean(selected && preview)}
        title={preview?.eligible ? `Activate ${selected?.name}?` : `${selected?.name ?? 'Profile'} cannot be activated`}
        description={preview?.eligible
          ? `Install ${preview.changes.install.length} and remove ${preview.changes.remove.length} pinned artifact(s). A verified locked backup is created first; original files remain staged until verification succeeds.`
          : preview?.blockers.join(' ') ?? ''}
        confirmLabel={preview?.eligible ? 'Queue activation' : 'Close'}
        busy={activate.pending}
        onCancel={() => { setSelected(null); setPreview(null); }}
        onConfirm={() => { if (preview?.eligible) void activate.run(); else { setSelected(null); setPreview(null); } }}
      />
      <ConfirmDialog
        open={recoveryJob !== null}
        title="Restore the verified backup?"
        description="This asks the panel to replace the current server files with the locked backup made before activation. Blipmade records the request, but does not call restoration complete until the panel proves it."
        confirmLabel="Request restore"
        busy={recover.pending}
        onCancel={() => setRecoveryJob(null)}
        onConfirm={() => { if (recoveryJob) void recover.run(recoveryJob).then(() => setRecoveryJob(null)); }}
      />
    </Panel>
  );
}

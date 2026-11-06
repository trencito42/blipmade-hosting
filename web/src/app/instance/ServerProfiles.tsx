import { useState } from 'react';
import { del, get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Link } from '../../router';
import { Panel, PrimaryButton, SoftButton, TextInput } from '../../ui-app';

interface Profile { id: string; name: string; productSlug: string; ram: number; cpu: number; disk: number; manifest: unknown; createdAt: string }

/** Remembers the size of this server. Applying a different size goes through the existing resource change. */
export function ServerProfiles({ instance }: { instance: { id: string; ram: number; cpu: number; disk: number; product: { slug: string } } }) {
  const [name, setName] = useState('');
  const state = useAsync<{ profiles: Profile[] }>((signal) => get(`/instances/${encodeURIComponent(instance.id)}/profiles`, undefined, signal), [instance.id]);
  const save = useAction(async () => {
    await post(`/instances/${encodeURIComponent(instance.id)}/profiles`, { name: name.trim() });
    setName('');
    state.reload();
  });
  const remove = useAction(async (id: string) => {
    await del(`/instances/${encodeURIComponent(instance.id)}/profiles/${encodeURIComponent(id)}`);
    state.reload();
  });
  const profiles = state.data?.profiles ?? [];

  return (
    <Panel title="Saved profiles" description="A profile remembers size, product and the install manifest. Applying size still goes through resource change. Replaying files needs a backup and the add-on center.">
      <div className="flex flex-wrap items-end gap-2">
        <div className="min-w-[180px] flex-1">
          <TextInput label="Profile name" value={name} onChange={(event) => setName(event.target.value)} placeholder="Before the event" autoComplete="off" />
        </div>
        <PrimaryButton type="button" onClick={() => void save.run()} disabled={save.pending || !name.trim()}>Save current size</PrimaryButton>
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
              <SoftButton type="button" onClick={() => void remove.run(profile.id)} disabled={remove.pending}>Delete</SoftButton>
            </li>
          );
        })}
        {!state.loading && profiles.length === 0 && <li className="text-[13px] text-ink3">No saved profiles yet.</li>}
      </ul>
    </Panel>
  );
}

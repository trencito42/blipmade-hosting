import { get, post } from '../../lib/api';
import { useState } from 'react';
import { useAction, useAsync } from '../../lib/useAsync';
import { ErrorState, LoadingBlock, Panel, PrimaryButton, Segmented, SoftButton } from '../../ui-app';

interface Addon {
  slug: string;
  name: string;
  summary: string;
  kind: string;
  installed: boolean;
  installedVersion: string | null;
  installedAt: string | null;
}

interface Job {
  id: string;
  addonSlug: string;
  action: string;
  status: string;
  error: string | null;
  writes: boolean;
}

/** Catalogue add-ons for this server. SOFTWARE writes need a locked backup and a verified adapter. */
export function AddonCenter({ instanceId }: { instanceId: string }) {
  const [section, setSection] = useState<'discover' | 'installed' | 'history'>('discover');
  const state = useAsync<{ addons: Addon[]; jobs: Job[]; note: string }>(
    (signal) => get(`/instances/${encodeURIComponent(instanceId)}/addons`, undefined, signal),
    [instanceId],
  );
  const run = useAction(async (slug: string, action: 'install' | 'update' | 'remove') => {
    await post(`/instances/${encodeURIComponent(instanceId)}/addons/${encodeURIComponent(slug)}`, {
      action,
      confirmBackup: true,
      idempotencyKey: `${action}-${slug}-${Date.now()}`.slice(0, 80),
    });
    state.reload();
  });
  const addons = state.data?.addons ?? [];
  if (state.loading && !state.data) return <LoadingBlock rows={3} label="Loading add-ons" />;
  if (state.error) return <ErrorState title="Add-ons could not be loaded" message={state.error.message} onRetry={state.reload} />;
  const visible = section === 'discover' ? addons.filter((addon) => !addon.installed) : addons.filter((addon) => addon.installed);
  return (
    <Panel title="Add-ons" description={state.data?.note ?? 'Compatible catalogue add-ons for this product.'}>
      <Segmented
        ariaLabel="Add-on sections"
        value={section}
        onChange={setSection}
        options={[
          { value: 'discover', label: `Discover (${addons.filter((addon) => !addon.installed).length})` },
          { value: 'installed', label: `Installed (${addons.filter((addon) => addon.installed).length})` },
          { value: 'history', label: 'History' },
        ]}
      />
      {run.error && <p role="alert" className="mb-2 text-[13.5px] text-bad">{run.error}</p>}
      {section !== 'history' && <ul className="mt-3 grid gap-2">
        {visible.map((addon) => (
          <li key={addon.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <div>
              <p className="text-[14px] font-medium text-ink">{addon.name}</p>
              <p className="text-[12.5px] text-ink3">{addon.summary} · {addon.kind.toLowerCase()}</p>
              {addon.installedVersion && <p className="text-[12px] text-ink3">Installed version {addon.installedVersion}</p>}
            </div>
            {addon.kind === 'SOFTWARE' ? (
              addon.installed
                ? <span className="flex gap-2">
                    <PrimaryButton type="button" disabled={run.pending} onClick={() => void run.run(addon.slug, 'update')}>Check & update</PrimaryButton>
                    <SoftButton type="button" disabled={run.pending} onClick={() => void run.run(addon.slug, 'remove')}>Remove</SoftButton>
                  </span>
                : <PrimaryButton type="button" disabled={run.pending} onClick={() => void run.run(addon.slug, 'install')}>Install</PrimaryButton>
            ) : (
              <span className="text-[12.5px] text-ink3">{addon.installed ? 'On the order' : 'Billed on checkout'}</span>
            )}
          </li>
        ))}
        {visible.length === 0 && <li className="text-[13px] text-ink3">{section === 'installed' ? 'No managed add-ons are installed.' : 'No more compatible add-ons are available.'}</li>}
      </ul>}
      {section === 'history' && ((state.data?.jobs ?? []).length > 0 ? (
        <ul className="mt-3 grid gap-1 font-mono text-[12px] text-ink3">
          {state.data!.jobs.slice(0, 5).map((job) => (
            <li key={job.id}>{job.action} {job.addonSlug} · {job.status}{job.error ? ` · ${job.error}` : ''}</li>
          ))}
        </ul>
      ) : <p className="mt-3 text-[13px] text-ink3">No add-on changes yet.</p>)}
    </Panel>
  );
}

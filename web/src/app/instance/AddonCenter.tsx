import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { Panel, PrimaryButton, SoftButton } from '../../ui-app';

interface Addon {
  slug: string;
  name: string;
  summary: string;
  kind: string;
  installed: boolean;
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
  const state = useAsync<{ addons: Addon[]; jobs: Job[]; note: string }>(
    (signal) => get(`/instances/${encodeURIComponent(instanceId)}/addons`, undefined, signal),
    [instanceId],
  );
  const run = useAction(async (slug: string, action: 'install' | 'remove') => {
    await post(`/instances/${encodeURIComponent(instanceId)}/addons/${encodeURIComponent(slug)}`, {
      action,
      confirmBackup: true,
      idempotencyKey: `${action}-${slug}-${Date.now()}`.slice(0, 80),
    });
    state.reload();
  });
  const addons = state.data?.addons ?? [];
  return (
    <Panel title="Add-ons" description={state.data?.note ?? 'Compatible catalogue add-ons for this product.'}>
      {run.error && <p role="alert" className="mb-2 text-[13.5px] text-bad">{run.error}</p>}
      <ul className="grid gap-2">
        {addons.map((addon) => (
          <li key={addon.slug} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-3 py-2">
            <div>
              <p className="text-[14px] font-medium text-ink">{addon.name}</p>
              <p className="text-[12.5px] text-ink3">{addon.summary} · {addon.kind.toLowerCase()}</p>
            </div>
            {addon.kind === 'SOFTWARE' ? (
              addon.installed
                ? <SoftButton type="button" disabled={run.pending} onClick={() => void run.run(addon.slug, 'remove')}>Remove</SoftButton>
                : <PrimaryButton type="button" disabled={run.pending} onClick={() => void run.run(addon.slug, 'install')}>Install</PrimaryButton>
            ) : (
              <span className="text-[12.5px] text-ink3">{addon.installed ? 'On the order' : 'Billed on checkout'}</span>
            )}
          </li>
        ))}
        {!state.loading && addons.length === 0 && <li className="text-[13px] text-ink3">No catalogue add-ons for this variant.</li>}
      </ul>
      {(state.data?.jobs ?? []).slice(0, 5).length > 0 && (
        <ul className="mt-3 grid gap-1 font-mono text-[12px] text-ink3">
          {state.data!.jobs.slice(0, 5).map((job) => (
            <li key={job.id}>{job.action} {job.addonSlug} · {job.status}{job.error ? ` · ${job.error}` : ''}</li>
          ))}
        </ul>
      )}
    </Panel>
  );
}

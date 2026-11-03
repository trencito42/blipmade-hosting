import { useMemo } from 'react';
import { get, getAll, type Instance, type VpsServerView } from '../lib/api';
import { listEvents, type InstanceEvent } from '../lib/instance-api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Pager, Panel, usePaged } from '../ui-app';

interface Entry {
  key: string;
  at: string;
  text: string;
  source: string;
  to: string;
}

const SOURCES = 8;

/** What happened to the services of the account, newest first: apps and servers together, each line links to its service. */
export default function Activity() {
  const state = useAsync<{ entries: Entry[]; partial: boolean }>(async (signal) => {
    const [instances, servers] = await Promise.all([
      getAll<Instance>('/instances', 'instances', {}, signal),
      get<{ servers: VpsServerView[] }>('/vps', undefined, signal).then((answer) => answer.servers).catch(() => [] as VpsServerView[]),
    ]);
    // The most recent services are read; a customer with many services sees the latest ones.
    const apps = [...instances].sort((a, b) => Date.parse(b.createdAt) - Date.parse(a.createdAt)).slice(0, SOURCES);
    const boxes = servers.slice(0, SOURCES);
    const failed: boolean[] = [];
    const fromApps = await Promise.all(
      apps.map((instance) =>
        listEvents(instance.id, signal)
          .then((answer) => answer.events.map((event: InstanceEvent): Entry => ({ key: `i-${instance.id}-${event.id}`, at: event.createdAt, text: event.message, source: instance.name, to: `/app/instances/${instance.id}/activity` })))
          .catch(() => { failed.push(true); return [] as Entry[]; }),
      ),
    );
    const fromServers = await Promise.all(
      boxes.map((server) =>
        get<{ activity: { id: string; text: string; createdAt: string }[] }>(`/vps/${encodeURIComponent(server.id)}/activity`, { limit: 20 }, signal)
          .then((answer) => answer.activity.map((row): Entry => ({ key: `v-${server.id}-${row.id}`, at: row.createdAt, text: row.text, source: server.name, to: `/app/vps/${server.id}?tab=activity` })))
          .catch(() => { failed.push(true); return [] as Entry[]; }),
      ),
    );
    const entries = [...fromApps.flat(), ...fromServers.flat()].sort((a, b) => Date.parse(b.at) - Date.parse(a.at));
    return { entries, partial: failed.length > 0 };
  }, []);
  const entries = useMemo(() => state.data?.entries ?? [], [state.data]);
  const paged = usePaged(entries, 20);

  return (
    <Panel>
      {state.loading ? (
        <LoadingBlock rows={4} label="Loading the activity" />
      ) : state.error ? (
        <ErrorState title="The activity could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : entries.length === 0 ? (
        <EmptyState title="Nothing yet" description="Events appear here when something changes on a service." />
      ) : (
        <>
          {state.data?.partial && <p role="status" className="mb-3 text-[13px] text-ink3">Some services could not be read, so the list may be incomplete.</p>}
          <ul className="grid">
            {paged.rows.map((entry) => (
              <li key={entry.key} className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-0.5 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="break-words text-[14px] text-ink">{entry.text}</p>
                  <Link to={entry.to} className="text-[12.5px] font-medium text-acc hover:underline">{entry.source}</Link>
                </div>
                <time dateTime={entry.at} className="whitespace-nowrap text-[12.5px] text-ink3">{new Date(entry.at).toLocaleString()}</time>
              </li>
            ))}
          </ul>
          <Pager paged={paged} label="Activity pages" />
        </>
      )}
    </Panel>
  );
}

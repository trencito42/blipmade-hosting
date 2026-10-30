import { useMemo, useState } from 'react';
import { useInfiniteList } from '../../lib/useInfinite';
import { listActivityPage, listEventsPage, type InstanceEvent, type PanelActivity } from '../../lib/instance-api';
import { describeEvent } from '../../lib/activity';
import { describePanelAction, eventTypeLabel } from '../../lib/event-labels';
import { EmptyState, ListRow, LoadingBlock, Panel, Select, SoftButton } from '../../ui-app';
import { ApiErrorState, fmtDateTime, type TabProps } from './common';

/**
 * The activity of the instance.
 *
 * Two lists are shown side by side: what Blipmade did with the instance and what the panel
 * recorded on the server. Both load more as the reader scrolls, both can be narrowed to one
 * kind of action, and neither shows the raw names the platform uses inside.
 */

const when = (value: string) => <span className="whitespace-nowrap font-mono text-[12px] text-ink3">{fmtDateTime(value)}</span>;

function LoadMore({ sentinel, hasMore, loadingMore, onClick }: { sentinel: React.RefObject<HTMLDivElement | null>; hasMore: boolean; loadingMore: boolean; onClick: () => void }) {
  if (!hasMore) return <p className="pt-2 text-center text-[12.5px] text-ink3">That is everything.</p>;
  return (
    <div ref={sentinel} className="grid justify-items-center gap-2 pt-2">
      {loadingMore ? <p role="status" className="text-[12.5px] text-ink3">Loading more…</p> : <SoftButton onClick={onClick}>Load more</SoftButton>}
    </div>
  );
}

function BlipmadeEvents({ instance }: TabProps) {
  const [type, setType] = useState('');
  const [kinds, setKinds] = useState<{ type: string; count: number }[]>([]);
  const list = useInfiniteList<InstanceEvent, string>(
    async (cursor, signal) => {
      const page = await listEventsPage(instance.id, { cursor, type }, signal);
      if (!cursor) setKinds(page.types);
      return { items: page.events, next: page.pagination.hasMore ? page.pagination.nextCursor : null };
    },
    [instance.id, type],
  );
  return (
    <Panel title="The instance in Blipmade" description="What the platform did with this instance.">
      <div className="grid gap-3">
        {kinds.length > 1 && (
          <Select label="Show" value={type} onChange={(event) => setType(event.target.value)}>
            <option value="">Everything</option>
            {kinds.map((kind) => (
              <option key={kind.type} value={kind.type}>{eventTypeLabel(kind.type)} ({kind.count})</option>
            ))}
          </Select>
        )}
        {list.loading ? (
          <LoadingBlock rows={3} label="Loading the events" />
        ) : list.error && list.items.length === 0 ? (
          <ApiErrorState error={list.error} onRetry={list.reload} title="We could not load the events" />
        ) : list.items.length === 0 ? (
          <EmptyState title="Nothing here." description={type ? 'No event of this kind.' : 'Every step of the instance is written here.'} />
        ) : (
          <div className="grid gap-1.5">
            {list.items.map((event) => {
              const text = describeEvent(event, instance.name);
              return (
                <ListRow
                  key={event.id}
                  title={<span className="break-words">{text.title}</span>}
                  meta={<span className="break-words">{eventTypeLabel(event.type)}{text.detail ? ` · ${text.detail}` : ''}</span>}
                  right={when(event.createdAt)}
                />
              );
            })}
            <LoadMore sentinel={list.sentinel} hasMore={list.hasMore} loadingMore={list.loadingMore} onClick={list.loadMore} />
            {list.error && <p role="alert" className="text-[12.5px] text-bad">{list.error.message}</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

function PanelActivityList({ instance }: TabProps) {
  const [kind, setKind] = useState('');
  const list = useInfiniteList<PanelActivity, number>(
    async (cursor, signal) => {
      const page = await listActivityPage(instance.id, cursor ?? 1, signal);
      return { items: page.activity, next: page.hasMore ? (cursor ?? 1) + 1 : null };
    },
    [instance.id],
  );
  const described = useMemo(() => list.items.map((row) => ({ row, ...describePanelAction(row.action) })), [list.items]);
  const kinds = useMemo(() => [...new Set(described.map((entry) => entry.kind))].sort(), [described]);
  const shown = kind ? described.filter((entry) => entry.kind === kind) : described;
  return (
    <Panel title="The server on the panel" description="What the panel recorded on the server of the instance.">
      <div className="grid gap-3">
        {kinds.length > 1 && (
          <Select label="Show" value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">Everything</option>
            {kinds.map((entry) => (
              <option key={entry} value={entry}>{entry}</option>
            ))}
          </Select>
        )}
        {list.loading ? (
          <LoadingBlock rows={3} label="Loading the activity" />
        ) : list.error && list.items.length === 0 ? (
          <ApiErrorState error={list.error} onRetry={list.reload} title="We could not load the activity" />
        ) : shown.length === 0 && !list.hasMore ? (
          <EmptyState
            title={kind ? 'Nothing of this kind.' : 'No activity recorded.'}
            description="The panel writes here every time somebody changes the server or the files of it."
          />
        ) : (
          <div className="grid gap-1.5">
            {shown.map(({ row, text, kind: group }, index) => (
              <ListRow
                key={`${row.action}-${row.createdAt}-${index}`}
                title={<span className="break-words">{text}</span>}
                meta={<span className="break-words">{group} · {row.user || 'the panel'}</span>}
                right={when(row.createdAt)}
              />
            ))}
            <LoadMore sentinel={list.sentinel} hasMore={list.hasMore} loadingMore={list.loadingMore} onClick={list.loadMore} />
            {list.error && <p role="alert" className="text-[12.5px] text-bad">{list.error.message}</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

export default function ActivityTab({ instance }: TabProps) {
  return (
    <div className="grid gap-3 lg:grid-cols-2">
      <BlipmadeEvents instance={instance} />
      <PanelActivityList instance={instance} />
    </div>
  );
}

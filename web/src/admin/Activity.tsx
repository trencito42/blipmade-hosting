import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useInfiniteList } from '../lib/useInfinite';
import { Link } from '../router';
import { EmptyState, ErrorState, LoadingBlock, Panel, SoftButton, TextInput } from '../ui-app';
import { DASH, LiveRegion, fmtDateTime, maskEmail } from './Overview';

interface Entry { id: string; actorId: string | null; actorEmail: string | null; action: string; targetType: string | null; targetId: string | null; meta: unknown; ip: string | null; createdAt: string }
type Filters = { actor: string; action: string; targetType: string; targetId: string; from: string; to: string };
const EMPTY: Filters = { actor: '', action: '', targetType: '', targetId: '', from: '', to: '' };

const day = (iso: string) => new Date(iso).toLocaleDateString(undefined, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });

/**
 * The Activity Explorer: what happened, newest first, grouped by day. Follow one actor or one target (an order, a customer, a service)
 * through every action written to the audit log, inside a period. Every entry opens on its own page.
 */
export default function Activity() {
  const [filters, setFilters] = useState<Filters>(EMPTY);
  const [applied, setApplied] = useState<Filters>(EMPTY);
  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);
  const list = useInfiniteList<Entry, string>(
    async (cursor, signal) => {
      const result = await get<{ logs: Entry[]; pagination?: { hasMore: boolean; nextCursor: string | null } }>('/admin/audit', {
        actor: applied.actor || undefined,
        action: applied.action || undefined,
        targetType: applied.targetType || undefined,
        targetId: applied.targetId || undefined,
        from: applied.from ? new Date(applied.from).toISOString() : undefined,
        to: applied.to ? new Date(applied.to).toISOString() : undefined,
        cursor: cursor ?? undefined,
        limit: 100,
      }, signal);
      return { items: result.logs, next: result.pagination?.hasMore ? result.pagination.nextCursor : null };
    },
    [applied.actor, applied.action, applied.targetType, applied.targetId, applied.from, applied.to],
  );
  const groups: { day: string; rows: Entry[] }[] = [];
  for (const row of list.items) {
    const label = day(row.createdAt);
    const last = groups[groups.length - 1];
    if (last && last.day === label) last.rows.push(row);
    else groups.push({ day: label, rows: [{ ...row }] });
  }
  const set = (key: keyof Filters) => (event: React.ChangeEvent<HTMLInputElement>) => setFilters({ ...filters, [key]: event.target.value });
  const filtered = Object.values(applied).some(Boolean);
  return (
    <div className="grid gap-4">
      <LiveRegion message={`${list.items.length} entr${list.items.length === 1 ? 'y' : 'ies'} shown`} />
      <Panel title="Activity" description="Everything staff and the platform did, from the audit log. Follow one actor or one target through time.">
        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          <TextInput label="Actor" value={filters.actor} onChange={set('actor')} placeholder="staff@example.com" autoComplete="off" />
          <TextInput label="Action" value={filters.action} onChange={set('action')} placeholder="order.refunded" autoComplete="off" />
          <TextInput label="Target type" value={filters.targetType} onChange={set('targetType')} placeholder="order" autoComplete="off" />
          <TextInput label="Target id" value={filters.targetId} onChange={set('targetId')} autoComplete="off" />
          <TextInput label="From" type="datetime-local" value={filters.from} onChange={set('from')} />
          <TextInput label="To" type="datetime-local" value={filters.to} onChange={set('to')} />
        </div>
        {filtered && <div className="mt-3"><SoftButton onClick={() => setFilters(EMPTY)}>Clear the filters</SoftButton></div>}
      </Panel>
      {list.loading && list.items.length === 0 ? <LoadingBlock rows={4} label="Loading the activity" />
        : list.error && list.items.length === 0 ? <ErrorState title="The activity could not be loaded" message={list.error.message} onRetry={list.reload} />
        : groups.length === 0 ? <EmptyState title="Nothing matches." description={filtered ? 'Widen the period or clear a filter.' : 'No action has been written yet.'} />
        : (
          <div className="grid gap-4">
            {groups.map((group) => (
              <Panel key={group.day} title={group.day}>
                <ol className="divide-y divide-line">
                  {group.rows.map((row) => (
                    <li key={row.id} className="flex flex-wrap items-center justify-between gap-x-4 gap-y-1 py-2.5 text-[13.5px]">
                      <Link to={`/admin/audit/${encodeURIComponent(row.id)}`} className="font-mono text-acc hover:underline">{row.action}</Link>
                      <span className="min-w-0 truncate text-ink2">{row.actorEmail ? maskEmail(row.actorEmail) : 'the platform'} · {row.targetType ?? DASH}{row.targetId ? ` ${row.targetId}` : ''}</span>
                      <span className="font-mono text-[12px] text-ink3">{fmtDateTime(row.createdAt)}</span>
                    </li>
                  ))}
                </ol>
              </Panel>
            ))}
            {list.hasMore && <div className="text-center">{list.loadingMore ? <p role="status" className="text-[13px] text-ink3">Loading more…</p> : <SoftButton onClick={list.loadMore}>Load more</SoftButton>}</div>}
          </div>
        )}
    </div>
  );
}

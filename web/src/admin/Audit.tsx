import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useInfiniteList } from '../lib/useInfinite';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Panel, SoftButton } from '../ui-app';
import { DASH, LiveRegion, denseGhost, denseInput, fmtDateTime, maskEmail } from './Overview';

/**
 * Staff audit log — GET /api/admin/audit?actor=&action=&targetType=
 *
 * Only the columns the API returns are shown. The API does not return a
 * request id, so there is no request id column.
 *
 * Every entry shows the address the action came from and the payload the
 * action carried — the reason of a suspension or of a retry lives there.
 */

interface AuditLog {
  id: string;
  actorId: string | null;
  actorEmail: string | null;
  action: string;
  targetType: string | null;
  targetId: string | null;
  meta: unknown;
  ip: string | null;
  createdAt: string;
}

const FILTERS = [
  { key: 'actor', label: 'Actor' },
  { key: 'action', label: 'Action' },
  { key: 'targetType', label: 'Target type' },
] as const;

type FilterKey = (typeof FILTERS)[number]['key'];

/** The payload of an entry, as the pairs the API stored. */
function metaEntries(meta: unknown): { key: string; value: string }[] {
  if (!meta || typeof meta !== 'object' || Array.isArray(meta)) return [];
  return Object.entries(meta as Record<string, unknown>).map(([key, value]) => ({
    key,
    value:
      typeof value === 'string'
        ? value
        : Array.isArray(value)
          ? value.map((entry) => String(entry)).join(', ')
          : value && typeof value === 'object'
            ? JSON.stringify(value)
            : String(value),
  }));
}

/**
 * The payload of an entry, one line per value. The reason the staff gave is
 * the part an operator reads, so it is never hidden behind a summary.
 */
function MetaList({ meta }: { meta: unknown }) {
  const entries = metaEntries(meta);
  if (!entries.length) return <span className="text-ink3">{DASH}</span>;
  return (
    <span className="block min-w-0">
      {entries.map((entry) => (
        <span key={entry.key} className="block truncate text-[12.5px] text-ink2" title={`${entry.key}: ${entry.value}`}>
          <span className="text-ink3">{entry.key}: </span>
          {entry.value}
        </span>
      ))}
    </span>
  );
}

export default function Audit() {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ actor: '', action: '', targetType: '' });
  const [applied, setApplied] = useState<Record<FilterKey, string>>({ actor: '', action: '', targetType: '' });
  const [showEmails, setShowEmails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const [total, setTotal] = useState<number | undefined>(undefined);
  const list = useInfiniteList<AuditLog, string>(
    async (cursor, signal) => {
      const result = await get<{ logs: AuditLog[]; total?: number; pagination?: { hasMore: boolean; nextCursor: string | null } }>(
        '/admin/audit',
        {
          actor: applied.actor || undefined,
          action: applied.action || undefined,
          targetType: applied.targetType || undefined,
          cursor: cursor ?? undefined,
          limit: 100,
        },
        signal,
      );
      if (!cursor) setTotal(result.total);
      return { items: result.logs, next: result.pagination?.hasMore ? result.pagination.nextCursor : null };
    },
    [applied.actor, applied.action, applied.targetType],
  );
  const state = { loading: list.loading, error: list.items.length === 0 ? list.error : null, reload: list.reload };
  const logs = list.items;
  const actor = (value: string | null) => (value === null ? DASH : showEmails ? value : maskEmail(value));

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${logs.length} audit entr${logs.length === 1 ? 'y' : 'ies'}`} />
      <Panel
        title="Audit log"
        description="Every staff action the API recorded, newest first. Actor and action match on part of the text."
        actionBelow
        action={
          <button
            type="button"
            aria-pressed={showEmails}
            onClick={() => setShowEmails((value) => !value)}
            title="Revealing addresses is a local view change. The API has no endpoint that records a reveal."
            className={showEmails ? `${denseGhost} bg-ink text-bg hover:bg-ink` : denseGhost}
          >
            <Icon name={showEmails ? 'eyeOff' : 'eye'} size={16} />
            {showEmails ? 'Mask e-mails' : 'Show e-mails'}
          </button>
        }
      >
        <div className="grid gap-3">
          <div className="grid gap-3 sm:grid-cols-3">
            {FILTERS.map((filter) => (
              <Field
                key={filter.key}
                label={filter.label}
                htmlFor={`audit-${filter.key}`}
                hint={filter.key === 'targetType' ? 'Exact match, for example user or product.' : undefined}
              >
                <input
                  id={`audit-${filter.key}`}
                  type="search"
                  inputMode="search"
                  autoComplete="off"
                  value={filters[filter.key]}
                  onChange={(event) => {
                    const value = event.target.value;
                    setFilters((current) => {
                      const next = { ...current };
                      next[filter.key] = value;
                      return next;
                    });
                  }}
                  placeholder={filter.key === 'targetType' ? 'user' : 'anything'}
                  className={denseInput}
                />
              </Field>
            ))}
          </div>

          {state.loading ? (
            <LoadingBlock rows={5} label="Loading the audit log" />
          ) : state.error ? (
            <ErrorState title="The audit log could not be loaded" message={state.error.message} onRetry={state.reload} />
          ) : !logs.length ? (
            <EmptyState
              title="No entry matches these filters."
              description="Clear a filter to see more of the log."
            />
          ) : (
            <div className="grid gap-3">
              <DataTable<AuditLog>
                rows={logs}
                rowKey={(log) => log.id}
                columns={[
                  {
                    key: 'createdAt',
                    header: 'Time',
                    nowrap: true,
                    render: (log: AuditLog) => <span className="text-ink2">{fmtDateTime(log.createdAt)}</span>,
                  },
                  {
                    key: 'actor',
                    header: 'Actor',
                    truncate: true,
                    render: (log: AuditLog) => <span className="font-mono text-[12.5px] text-ink">{actor(log.actorEmail)}</span>,
                  },
                  {
                    key: 'action',
                    header: 'Action',
                    nowrap: true,
                    render: (log: AuditLog) => <span className="font-mono text-[12.5px] text-ink">{log.action}</span>,
                  },
                  {
                    key: 'target',
                    header: 'Target',
                    truncate: true,
                    render: (log: AuditLog) => (
                      <span className="font-mono text-[12.5px] text-ink2">
                        {log.targetType ?? DASH}
                        {log.targetId ? ` · ${log.targetId}` : ''}
                      </span>
                    ),
                  },
                  {
                    key: 'source',
                    header: 'Source',
                    nowrap: true,
                    render: (log: AuditLog) => <span className="font-mono text-[12.5px] text-ink2">{log.ip ?? DASH}</span>,
                  },
                  {
                    key: 'detail',
                    header: 'Detail',
                    className: 'max-w-[280px]',
                    render: (log: AuditLog) => <MetaList meta={log.meta} />,
                  },
                ]}
              />
              <CardList<AuditLog> rows={logs} rowKey={(log) => log.id}>
                {(log) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-mono text-[13.5px] font-medium text-ink" title={log.action}>
                        {log.action}
                      </p>
                      <span className="shrink-0 text-[12.5px] text-ink3">{fmtDateTime(log.createdAt)}</span>
                    </div>
                    <dl className="mt-2 grid grid-cols-2 gap-2 text-[13px]">
                      <div className="min-w-0">
                        <dt className="text-ink3">Actor</dt>
                        <dd className="truncate font-mono text-ink" title={actor(log.actorEmail)}>
                          {actor(log.actorEmail)}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Target</dt>
                        <dd
                          className="truncate font-mono text-ink"
                          title={`${log.targetType ?? DASH}${log.targetId ? ` · ${log.targetId}` : ''}`}
                        >
                          {log.targetType ?? DASH}
                          {log.targetId ? ` · ${log.targetId}` : ''}
                        </dd>
                      </div>
                      <div className="min-w-0">
                        <dt className="text-ink3">Source</dt>
                        <dd className="truncate font-mono text-ink">{log.ip ?? DASH}</dd>
                      </div>
                      <div className="col-span-2 min-w-0">
                        <dt className="text-ink3">Detail</dt>
                        <dd>
                          <MetaList meta={log.meta} />
                        </dd>
                      </div>
                    </dl>
                  </div>
                )}
              </CardList>
              {list.hasMore ? (
                <div ref={list.sentinel} className="grid justify-items-center gap-2">
                  {list.loadingMore ? <p role="status" className="text-[13px] text-ink3">Loading more…</p> : <SoftButton onClick={list.loadMore}>Load more</SoftButton>}
                </div>
              ) : (
                <p className="text-center text-[13px] text-ink3">{total !== undefined ? `All ${total} entries are shown.` : 'That is everything.'}</p>
              )}
              {list.error && <p role="alert" className="text-[13px] text-bad">{list.error.message}</p>}
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

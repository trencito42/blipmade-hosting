import { useEffect, useState } from 'react';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { CardList, DataTable, EmptyState, ErrorState, Field, LoadingBlock, Panel } from '../ui-app';
import { DASH, LiveRegion, denseGhost, denseInput, fmtDateTime, maskEmail } from './Overview';

/**
 * Staff audit log — GET /api/admin/audit?actor=&action=&targetType=
 *
 * Only the columns the API returns are shown. The API does not return a
 * request id, so there is no request id column.
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

export default function Audit() {
  const [filters, setFilters] = useState<Record<FilterKey, string>>({ actor: '', action: '', targetType: '' });
  const [applied, setApplied] = useState<Record<FilterKey, string>>({ actor: '', action: '', targetType: '' });
  const [showEmails, setShowEmails] = useState(false);

  useEffect(() => {
    const timer = setTimeout(() => setApplied(filters), 300);
    return () => clearTimeout(timer);
  }, [filters]);

  const state = useAsync(
    (signal) =>
      get<{ logs: AuditLog[] }>(
        '/admin/audit',
        {
          actor: applied.actor || undefined,
          action: applied.action || undefined,
          targetType: applied.targetType || undefined,
        },
        signal,
      ),
    [applied.actor, applied.action, applied.targetType],
  );

  const logs = state.data?.logs ?? [];
  const actor = (value: string | null) => (value === null ? DASH : showEmails ? value : maskEmail(value));

  return (
    <div className="grid gap-4">
      <LiveRegion message={`${logs.length} audit entr${logs.length === 1 ? 'y' : 'ies'}`} />
      <Panel
        title="Audit log"
        description="Every staff action the API recorded, newest first. Actor and action match on part of the text."
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
                    render: (log: AuditLog) => <span className="text-ink2">{fmtDateTime(log.createdAt)}</span>,
                  },
                  {
                    key: 'actor',
                    header: 'Actor',
                    render: (log: AuditLog) => <span className="font-mono text-[12.5px] text-ink">{actor(log.actorEmail)}</span>,
                  },
                  {
                    key: 'action',
                    header: 'Action',
                    render: (log: AuditLog) => <span className="font-mono text-[12.5px] text-ink">{log.action}</span>,
                  },
                  {
                    key: 'target',
                    header: 'Target',
                    render: (log: AuditLog) => (
                      <span className="font-mono text-[12.5px] text-ink2">
                        {log.targetType ?? DASH}
                        {log.targetId ? ` · ${log.targetId}` : ''}
                      </span>
                    ),
                  },
                ]}
              />
              <CardList<AuditLog> rows={logs} rowKey={(log) => log.id}>
                {(log) => (
                  <div>
                    <div className="flex items-start justify-between gap-3">
                      <p className="min-w-0 truncate font-mono text-[13.5px] font-bold text-ink" title={log.action}>
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
                    </dl>
                  </div>
                )}
              </CardList>
            </div>
          )}
        </div>
      </Panel>
    </div>
  );
}

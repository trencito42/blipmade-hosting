import { useMemo, useState } from 'react';
import { Link } from '../router';
import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { DataTable, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill } from '../ui-app';
import { DASH, denseInput, fmtDateTime } from './Overview';
import { OpsNav } from './Ops';

interface BackupRow {
  id: string;
  kind: string;
  source: string;
  instanceId: string | null;
  node: string | null;
  destinationPath: string;
  sizeBytes: number;
  encrypted: boolean;
  transfer: string;
  integrity: boolean;
  restoreVerified: boolean;
  takenAt: string | null;
  uploadedAt: string | null;
  verifiedAt: string | null;
  restoreVerifiedAt: string | null;
  error: string | null;
  updatedAt: string;
}

function transferTone(row: BackupRow): { status: string; label: string } {
  if (row.restoreVerified) return { status: 'active', label: 'Restore verified' };
  if (row.integrity) return { status: 'verified', label: 'Remote copy verified' };
  if (row.transfer === 'OFFSITE_PENDING') return { status: 'pending', label: 'Uploaded' };
  if (row.transfer === 'FAILED') return { status: 'failed', label: 'Failed' };
  return { status: 'unavailable', label: row.transfer };
}

export default function OpsBackups() {
  const [q, setQ] = useState('');
  const [kind, setKind] = useState('');
  const [failedOnly, setFailedOnly] = useState(false);
  const query = useMemo(
    () => ({ q: q.trim() || undefined, kind: kind || undefined, state: failedOnly ? 'FAILED' : undefined, take: 80 }),
    [q, kind, failedOnly],
  );
  const state = useAsync<{ backups: BackupRow[] }>((signal) => get('/admin/ops/backups', query, signal), [query]);
  const rows = state.data?.backups ?? [];

  return (
    <div className="grid gap-4">
      <OpsNav />
      <Panel
        title="Backup history"
        description="Each row is an agent receipt. A verified row is a remote read-back. A restore column is a drill that opened the archive. Paths are relative; credentials never appear here."
      >
        <div className="mb-3 grid gap-2 sm:grid-cols-3">
          <input className={denseInput} placeholder="Search source, node, or error" value={q} onChange={(event) => setQ(event.target.value)} />
          <select className={denseInput} value={kind} onChange={(event) => setKind(event.target.value)}>
            <option value="">Every kind</option>
            {['CUSTOMER', 'DATABASE', 'VPS', 'PLATFORM', 'INFRA', 'PVE'].map((value) => (
              <option key={value} value={value}>{value}</option>
            ))}
          </select>
          <label className="flex items-center gap-2 text-[13.5px] text-ink2">
            <input type="checkbox" checked={failedOnly} onChange={(event) => setFailedOnly(event.target.checked)} />
            Failures only
          </label>
        </div>
        {state.loading && !state.data ? (
          <LoadingBlock rows={4} label="Loading backup receipts" />
        ) : state.error ? (
          <ErrorState title="Backup receipts could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : rows.length === 0 ? (
          <EmptyState title="No receipts match." description="A missing list is not a successful backup." />
        ) : (
          <DataTable
            rows={rows}
            rowKey={(row) => row.id}
            minWidth="960px"
            columns={[
              { key: 'source', header: 'Workload', truncate: true, render: (row) => (
                <span className="block min-w-0">
                  <span className="block truncate font-bold text-ink">{row.kind} · {row.source}</span>
                  <span className="block truncate font-mono text-[12px] text-ink3">{row.node ?? DASH} · {row.destinationPath}</span>
                </span>
              ) },
              { key: 'size', header: 'Size', nowrap: true, render: (row) => <span className="font-mono text-[12.5px]">{(row.sizeBytes / 1024 ** 2).toFixed(1)} MB</span> },
              { key: 'taken', header: 'Archive', nowrap: true, render: (row) => <span className="font-mono text-[12.5px]">{row.takenAt ? fmtDateTime(row.takenAt) : DASH}</span> },
              { key: 'state', header: 'Evidence', render: (row) => {
                const tone = transferTone(row);
                return (
                  <span className="block min-w-0">
                    <StatusPill status={tone.status} label={tone.label} />
                    {row.error && <span className="mt-1 block break-words font-mono text-[12px] text-bad">{row.error}</span>}
                  </span>
                );
              } },
              { key: 'link', header: 'Resource', render: (row) => row.instanceId
                ? <Link to={`/admin/services/${encodeURIComponent(row.instanceId)}`} className="text-acc hover:underline">Service</Link>
                : <span className="text-[12.5px] text-ink3">{DASH}</span> },
            ]}
          />
        )}
      </Panel>
    </div>
  );
}

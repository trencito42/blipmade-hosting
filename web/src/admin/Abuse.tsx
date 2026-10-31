import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Link } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, Select, SoftButton, TextInput, useToast } from '../ui-app';
import { can, denseDanger, fmtDateTime, useAdminSession } from './Overview';

interface Report {
  id: string;
  reporterName: string;
  reporterEmail: string;
  category: string;
  target: string;
  details: string;
  evidenceUrl: string | null;
  status: string;
  resolution: string | null;
  createdAt: string;
  resolvedAt: string | null;
  instance: { id: string; name: string; status: string; user: { id: string; email: string } } | null;
}

const STATUS = { open: 'Open', investigating: 'Investigating', action_taken: 'Action taken', dismissed: 'Dismissed' } as Record<string, string>;

/** Reports of abuse from the public form: read them, suspend the service they are about, mark them investigated or dismiss them. */
export default function Abuse() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'services.write');
  const toast = useToast();
  const [status, setStatus] = useState('');
  const state = useAsync<{ reports: Report[] }>((signal) => get<{ reports: Report[] }>('/admin/abuse', { status: status || undefined }, signal), [status]);
  const [note, setNote] = useState<Record<string, string>>({});
  const [suspending, setSuspending] = useState<Report | null>(null);
  const run = async (report: Report, action: string) => {
    try {
      await post(`/admin/abuse/${report.id}/action`, { action, note: note[report.id] || undefined });
      toast.push('Done.', 'ok');
      state.reload();
    } catch (failure) {
      toast.push(failure instanceof Error ? failure.message : 'That did not work.', 'error');
    }
  };
  return (
    <Panel title="Abuse reports" description="From the public form at /abuse. The reporter's address is never shown to the customer.">
      <div className="grid gap-3">
        <Select label="Show" value={status} onChange={(event) => setStatus(event.target.value)}>
          <option value="">Everything</option>
          {Object.entries(STATUS).map(([value, label]) => <option key={value} value={value}>{label}</option>)}
        </Select>
        {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the reports" />
          : state.error ? <ErrorState title="The reports could not be loaded" message={state.error.message} onRetry={state.reload} />
          : (state.data?.reports.length ?? 0) === 0 ? <EmptyState title="No report" description="Reports made on the public form appear here." />
          : (
            <ul className="grid gap-3">
              {state.data!.reports.map((report) => (
                <li key={report.id} className="grid gap-2 rounded-2xl bg-s2 p-4">
                  <div className="flex flex-wrap items-start justify-between gap-2">
                    <p className="text-[15px] font-semibold text-ink"><span className="uppercase">{report.category}</span> · {report.target}</p>
                    <span className={`rounded-full px-2.5 py-1 text-[12px] font-bold ${report.status === 'open' ? 'bg-warn/15 text-warn' : 'bg-s3 text-ink2'}`}>{STATUS[report.status] ?? report.status}</span>
                  </div>
                  <p className="whitespace-pre-line text-[13.5px] text-ink2">{report.details}</p>
                  <p className="text-[12.5px] text-ink3">{report.reporterName} · {report.reporterEmail} · {fmtDateTime(report.createdAt)}{report.evidenceUrl ? <> · <a href={report.evidenceUrl} target="_blank" rel="noreferrer noopener" className="text-acc underline">evidence</a></> : null}</p>
                  {report.instance ? (
                    <p className="text-[13px] text-ink2">Linked service: <strong>{report.instance.name}</strong> ({report.instance.status}) · <Link to={`/admin/customers/${report.instance.user.id}`} className="text-acc underline">{report.instance.user.email}</Link></p>
                  ) : (
                    <p className="text-[13px] text-ink3">Not linked to a service on this platform.</p>
                  )}
                  {report.resolution && <p className="rounded-xl bg-card px-3 py-2 text-[13px] text-ink2">Note: {report.resolution}</p>}
                  {mayWrite && (
                    <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
                      <TextInput label="Note (kept in the report)" value={note[report.id] ?? ''} onChange={(event) => setNote({ ...note, [report.id]: event.target.value })} />
                      <div className="flex flex-wrap gap-2">
                        <SoftButton onClick={() => void run(report, 'investigating')}>Investigating</SoftButton>
                        <SoftButton onClick={() => void run(report, 'resolve')}>Resolved</SoftButton>
                        <SoftButton onClick={() => void run(report, 'dismiss')}>Dismiss</SoftButton>
                        {report.instance && <button type="button" className={denseDanger} onClick={() => setSuspending(report)}>Suspend the service</button>}
                      </div>
                    </div>
                  )}
                </li>
              ))}
            </ul>
          )}
      </div>
      <ConfirmDialog open={suspending !== null} title={`Suspend ${suspending?.instance?.name ?? 'the service'}?`} description="The server is stopped and the customer cannot start it. The report is marked as action taken." confirmLabel="Suspend"
        onCancel={() => setSuspending(null)} onConfirm={() => { const target = suspending; setSuspending(null); if (target) void run(target, 'suspend'); }} />
    </Panel>
  );
}

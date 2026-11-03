import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../../app/components/premium';
import { can, useAdminSession } from '../Overview';
import type { AbuseDetail } from './types';

/** Reopen a closed case. It comes back into the queue as an investigation, and the reason goes to the journal of the case. */
export default function AbuseReopen() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'services.write');
  const backTo = `/admin/abuse/${encodeURIComponent(id)}`;
  const state = useAsync((signal) => get<AbuseDetail>(`/admin/abuse/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const report = state.data?.report;
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && reason !== '';
  useUnsavedChangesGuard(dirty, 'Discard this reopening?');
  const allowed = Boolean(report?.allowedActions?.includes('reopen'));
  const send = useAction(async () => post(`/admin/abuse/${encodeURIComponent(id)}/action`, { action: 'reopen', reason: reason.trim() }));
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('The investigation is open again.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this reopening?')) navigate(backTo);
  };
  return (
    <PageEditorShell eyebrow="Abuse" title="Reopen the investigation" description="A closed case is read-only until it is reopened with a reason. The case comes back into the queue as an investigation." backTo={backTo} backLabel="Back to the report" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || !allowed || reason.trim().length < 5 || send.pending}>{send.pending ? 'Working…' : 'Reopen the investigation'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={2} label="Loading the report" />
        : state.error || !report ? <ErrorState title="The report could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : (
          <div className="grid gap-3">
            <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2"><span className="font-mono text-ink">{report.target}</span> · {report.statusLabel}{report.resolution ? ` · ${report.resolution}` : ''}</p>
            {!allowed && <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink">This case is not closed, so there is nothing to reopen.</p>}
            <TextArea label="Why?" hint="At least 5 characters. It is written into the journal of the case." value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={!mayWrite || !allowed} />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;services.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

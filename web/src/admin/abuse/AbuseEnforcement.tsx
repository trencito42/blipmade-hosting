import { useState } from 'react';
import { get, post } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextArea, TextInput, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../../app/components/premium';
import { can, useAdminSession } from '../Overview';
import type { AbuseDetail } from './types';

/**
 * Suspend the service of a report. The heaviest thing the staff desk does from a case, so the page says what happens,
 * asks for the reason and asks for the name of the service, which is the name the server is given.
 */
export default function AbuseEnforcement() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'services.write');
  const backTo = `/admin/abuse/${encodeURIComponent(id)}`;
  const state = useAsync((signal) => get<AbuseDetail>(`/admin/abuse/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const detail = state.data;
  const service = detail ? detail.service ?? detail.report.service : null;
  const [reason, setReason] = useState('');
  const [confirmName, setConfirmName] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && (reason !== '' || confirmName !== '');
  useUnsavedChangesGuard(dirty, 'Discard this suspension?');
  const allowed = Boolean(detail?.report.allowedActions?.includes('suspend'));
  const send = useAction(async () => post(`/admin/abuse/${encodeURIComponent(id)}/action`, { action: 'suspend', reason: reason.trim(), confirmService: confirmName.trim() }));
  const ready = mayWrite && allowed && Boolean(service) && reason.trim().length >= 5 && confirmName.trim() === service?.name && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('Service suspended.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this suspension?')) navigate(backTo);
  };
  return (
    <PageEditorShell eyebrow="Abuse" title={service ? `Suspend ${service.name}` : 'Suspend the service'}
      description="The server is stopped and the customer cannot start it. The case stays open: the enforcement and the state of the case are two facts. The service is suspended once, never twice through the same report."
      backTo={backTo} backLabel="Back to the report" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Working…' : 'Suspend the service'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the report" />
        : state.error || !detail ? <ErrorState title="The report could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : !service ? <p className="text-[13.5px] text-ink3">This report has no service to suspend.</p>
        : (
          <div className="grid gap-3">
            {!allowed && <p role="alert" className="rounded-2xl bg-warn/10 px-4 py-3 text-[13.5px] text-ink">This case cannot be suspended now: the service is already suspended, or the case is closed.</p>}
            <TextArea label="Why is the service suspended?" hint="Recorded in the audit log of the case. At least 5 characters." value={reason} onChange={(event) => setReason(event.target.value)} rows={3} disabled={!mayWrite || !allowed} />
            <TextInput label={`Type ${service.name} to confirm`} value={confirmName} onChange={(event) => setConfirmName(event.target.value)} autoComplete="off" disabled={!mayWrite || !allowed} />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;services.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

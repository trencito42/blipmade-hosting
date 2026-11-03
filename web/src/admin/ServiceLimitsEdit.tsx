import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, useAdminSession } from './Overview';

interface Service { id: string; name: string; panel: { databases: number; backups: number; allocations: number } | null }

/** The panel limits of one service: databases, backups and allocations, with the reason for the audit log. */
export default function ServiceLimitsEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'services.write');
  const backTo = `/admin/services/${encodeURIComponent(id)}`;
  const state = useAsync<{ service: Service }>((signal) => get(`/admin/services/${encodeURIComponent(id)}`, undefined, signal), [id]);
  const service = state.data?.service;
  const panel = service?.panel ?? null;
  const [databases, setDatabases] = useState<string | null>(null);
  const [backups, setBackups] = useState<string | null>(null);
  const [allocations, setAllocations] = useState<string | null>(null);
  const [reason, setReason] = useState('');
  const [done, setDone] = useState(false);
  const values = { databases: databases ?? String(panel?.databases ?? ''), backups: backups ?? String(panel?.backups ?? ''), allocations: allocations ?? String(panel?.allocations ?? '') };
  const whole = (value: string) => /^\d+$/.test(value);
  const changed = Boolean(panel) && (Number(values.databases) !== panel!.databases || Number(values.backups) !== panel!.backups || Number(values.allocations) !== panel!.allocations);
  const dirty = !done && (changed || reason !== '');
  useUnsavedChangesGuard(dirty, 'Discard these limits?');
  const send = useAction(async () =>
    post(`/admin/instances/${encodeURIComponent(id)}/feature-limits`, { databases: Number(values.databases), backups: Number(values.backups), allocations: Number(values.allocations), reason: reason.trim() }),
  );
  const ready = mayWrite && changed && whole(values.databases) && whole(values.backups) && whole(values.allocations) && reason.trim().length >= 3 && !send.pending;
  const submit = async () => {
    if (!(await send.run())) return;
    setDone(true);
    toast.push('Feature limits updated.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard these limits?')) navigate(backTo);
  };
  return (
    <PageEditorShell eyebrow="Services" title={service ? `Limits: ${service.name}` : 'Service limits'} description="How many databases, backups and allocations the game panel allows for this service." backTo={backTo} backLabel="Back to the service" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={send.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!ready}>{send.pending ? 'Saving…' : 'Save limits'}</PrimaryButton></>}>
      {state.loading && !state.data ? <LoadingBlock rows={3} label="Loading the service" />
        : state.error || !service ? <ErrorState title="The service could not be loaded" message={state.error?.message ?? 'Not found.'} onRetry={state.reload} />
        : !panel ? <p className="text-[13.5px] text-ink3">This service has no panel server, so it has no panel limits.</p>
        : (
          <div className="grid gap-3">
            <div className="grid gap-3 sm:grid-cols-3">
              <TextInput label="Databases" inputMode="numeric" value={values.databases} onChange={(event) => setDatabases(event.target.value)} disabled={!mayWrite} />
              <TextInput label="Backups" inputMode="numeric" value={values.backups} onChange={(event) => setBackups(event.target.value)} disabled={!mayWrite} />
              <TextInput label="Allocations" inputMode="numeric" value={values.allocations} onChange={(event) => setAllocations(event.target.value)} disabled={!mayWrite} />
            </div>
            <TextInput label="Reason" value={reason} onChange={(event) => setReason(event.target.value)} placeholder="Customer plan change" hint="At least 3 characters. It goes to the audit log." disabled={!mayWrite} />
            {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;services.write&quot;.</p>}
            {send.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{send.error}</p>}
          </div>
        )}
    </PageEditorShell>
  );
}

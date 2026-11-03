import { useState } from 'react';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { Field, PrimaryButton, SoftButton, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { can, denseInput, useAdminSession } from './Overview';
import { declareOpsIncident, toIso } from './Ops';

const BACK_TO = '/admin/ops';
const AREA =
  'min-h-[88px] w-full rounded-xl border border-line bg-card px-3 py-2 text-[16px] text-ink outline-none focus:border-acc sm:text-[14px]';

/** Declare an incident of the platform, in the words of the operator. It is written down so that everybody reads the same words. */
export default function OpsDeclare() {
  const { navigate } = useRouter();
  const toast = useToast();
  const mayWrite = can(useAdminSession().staff, 'infrastructure.write');
  const [message, setMessage] = useState('');
  const [until, setUntil] = useState('');
  const [done, setDone] = useState(false);
  const dirty = !done && (message !== '' || until !== '');
  useUnsavedChangesGuard(dirty, 'Discard this incident?');
  const declare = useAction(async () => declareOpsIncident(message.trim(), toIso(until)));
  const submit = async () => {
    if (!(await declare.run())) return;
    setDone(true);
    toast.push('The incident is declared', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this incident?')) navigate(BACK_TO);
  };
  return (
    <PageEditorShell eyebrow="Operations" title="Declare an incident" description="An incident says that the platform is not in its normal state." backTo={BACK_TO} backLabel="Back to operations" dirty={dirty}
      actions={<><SoftButton type="button" onClick={discard} disabled={declare.pending}>Discard</SoftButton><PrimaryButton type="button" onClick={() => void submit()} disabled={!mayWrite || message.trim() === '' || declare.pending}>{declare.pending ? 'Declaring…' : 'Declare an incident'}</PrimaryButton></>}>
      <div className="grid gap-3">
        <Field label="What is happening" htmlFor="ops-incident-message" hint="Written in the words of the operator.">
          <textarea id="ops-incident-message" rows={4} value={message} onChange={(event) => setMessage(event.target.value)} disabled={!mayWrite} placeholder="The mail server does not answer and the customers of the hosted mail cannot receive." className={AREA} />
        </Field>
        <Field label="Until" htmlFor="ops-incident-until" hint="Optional. Local time, sent as UTC. Empty means it has no end yet.">
          <input id="ops-incident-until" type="datetime-local" value={until} onChange={(event) => setUntil(event.target.value)} disabled={!mayWrite} className={denseInput} />
        </Field>
        {!mayWrite && <p className="text-[13px] text-ink3">Your role does not hold &quot;infrastructure.write&quot;.</p>}
        {declare.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{declare.error}</p>}
      </div>
    </PageEditorShell>
  );
}

import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useParams, useRouter } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, PrimaryButton, Segmented, SoftButton, TextInput } from '../ui-app';
import { PageEditorShell } from '../app/components/premium';
import { denseSelect, maskEmail, useAdminSession } from './Overview';

const BACK_TO = '/admin/staff';
const ROLES = [{ value: 'STAFF', label: 'Staff' }, { value: 'ADMIN', label: 'Administrator' }];

interface Candidate { userId: string; email: string; name: string; emailVerified: boolean }

function useStepUp() {
  const [method, setMethod] = useState<'password' | 'code'>('password');
  const [credential, setCredential] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const stepUp = useAction(async () => post('/admin/staff/step-up', { [method]: credential }));
  const confirm = async () => {
    if (!credential.trim()) {
      setCredentialError(method === 'password' ? 'Enter your current password.' : 'Enter your authenticator code.');
      return false;
    }
    return Boolean(await stepUp.run());
  };
  const reset = () => {
    setCredential('');
    setCredentialError('');
    stepUp.clearError();
  };
  return { method, setMethod, credential, setCredential, credentialError, setCredentialError, stepUp, confirm, reset };
}

function StepUpFields({ step }: { step: ReturnType<typeof useStepUp> }) {
  return (
    <div className="mt-5 grid gap-4 border-t border-line pt-5">
      <Segmented
        role="group"
        ariaLabel="Confirmation method"
        options={[{ value: 'password', label: 'Password' }, { value: 'code', label: 'Authenticator code' }]}
        value={step.method}
        onChange={(value) => {
          step.setMethod(value);
          step.reset();
        }}
      />
      <TextInput
        label={step.method === 'password' ? 'Current password' : 'Authenticator code'}
        type={step.method === 'password' ? 'password' : 'text'}
        inputMode={step.method === 'code' ? 'numeric' : undefined}
        autoComplete={step.method === 'password' ? 'current-password' : 'one-time-code'}
        value={step.credential}
        onChange={(event) => {
          step.setCredential(event.target.value);
          step.setCredentialError('');
          step.stepUp.clearError();
        }}
        error={step.credentialError || step.stepUp.fieldErrors[step.method] || undefined}
      />
      {step.stepUp.error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2.5 text-[13px] font-medium text-bad">{step.stepUp.error}</p>}
    </div>
  );
}

function AccessDenied() {
  return <EmptyState title="Only an administrator can do this." description="Staff access is granted, invited and removed by an administrator." />;
}

export function StaffAdd() {
  const session = useAdminSession();
  const { navigate } = useRouter();
  const mayEdit = session.staff?.role === 'ADMIN';
  const [query, setQuery] = useState('');
  const [candidates, setCandidates] = useState<Candidate[] | null>(null);
  const [chosen, setChosen] = useState<Candidate | null>(null);
  const [role, setRole] = useState('STAFF');
  const [confirming, setConfirming] = useState(false);
  const step = useStepUp();
  const search = useAction(async () => {
    const result = await get<{ candidates: Candidate[] }>('/admin/staff/candidates', { q: query.trim() });
    setCandidates(result.candidates);
    setChosen(null);
    return result;
  });
  const grant = useAction(async () => {
    if (!chosen) return null;
    return post('/admin/staff/members', { userId: chosen.userId, role });
  });
  const submit = async () => {
    if (!(await step.confirm())) return;
    const result = await grant.run();
    if (!result) return;
    navigate(BACK_TO, { replace: true });
  };
  return (
    <PageEditorShell
      eyebrow="Staff"
      title="Add a staff member"
      description="Search for an existing customer account. The customer, their orders and their services stay. This only adds staff access."
      backTo={BACK_TO}
      backLabel="Back to staff"
      actions={<SoftButton type="button" onClick={() => navigate(BACK_TO)}>Discard</SoftButton>}
    >
      {session.loading ? <LoadingBlock rows={3} label="Checking your permissions" />
        : session.error ? <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
        : !mayEdit ? <AccessDenied />
        : (
          <div className="grid max-w-[640px] gap-4">
            <form className="grid gap-3" onSubmit={(event) => { event.preventDefault(); void search.run(); }}>
              <TextInput label="Find a customer" value={query} onChange={(event) => setQuery(event.target.value)} placeholder="Name or email" />
              <div><PrimaryButton type="submit" disabled={query.trim().length < 2 || search.pending}>{search.pending ? 'Searching…' : 'Search accounts'}</PrimaryButton></div>
            </form>
            {search.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{search.error}</p>}
            {candidates && !candidates.length && <EmptyState title="No customer accounts match." description="Invite a new person if they do not have an account yet." />}
            {candidates && candidates.length > 0 && (
              <fieldset className="grid gap-2">
                <legend className="text-[13px] font-semibold text-ink">Choose the account</legend>
                {candidates.map((candidate) => (
                  <label key={candidate.userId} className="flex min-h-11 items-center gap-3 rounded-xl bg-s3 px-3 py-2 text-[13.5px] text-ink">
                    <input type="radio" name="candidate" checked={chosen?.userId === candidate.userId} onChange={() => setChosen(candidate)} className="size-4 accent-acc" />
                    <span className="min-w-0">
                      <span className="block truncate font-semibold">{candidate.name || 'No name'}</span>
                      <span className="block truncate font-mono text-[12px] text-ink3">{candidate.email}</span>
                    </span>
                  </label>
                ))}
              </fieldset>
            )}
            <Field label="Role" htmlFor="grant-role">
              <select id="grant-role" value={role} onChange={(event) => setRole(event.target.value)} className={denseSelect}>
                {ROLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            {grant.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{grant.error}</p>}
            <div><PrimaryButton type="button" disabled={!chosen} onClick={() => setConfirming(true)}>Review and add</PrimaryButton></div>
            <ConfirmDialog
              open={confirming}
              title={chosen ? `Give ${chosen.name || maskEmail(chosen.email)} staff access` : 'Add a staff member'}
              description={chosen ? `${chosen.email} becomes ${role === 'ADMIN' ? 'an administrator' : 'a member of staff'}. Their customer account is kept.` : ''}
              confirmLabel="Confirm and add"
              onConfirm={submit}
              onCancel={() => { if (!step.stepUp.pending && !grant.pending) { setConfirming(false); step.reset(); } }}
              busy={step.stepUp.pending || grant.pending}
            >
              <StepUpFields step={step} />
            </ConfirmDialog>
          </div>
        )}
    </PageEditorShell>
  );
}

export function StaffInvite() {
  const session = useAdminSession();
  const { navigate } = useRouter();
  const mayEdit = session.staff?.role === 'ADMIN';
  const [email, setEmail] = useState('');
  const [role, setRole] = useState('STAFF');
  const [confirming, setConfirming] = useState(false);
  const step = useStepUp();
  const invite = useAction(async () => post('/admin/staff/invitations', { email: email.trim(), role }));
  const submit = async () => {
    if (!(await step.confirm())) return;
    const result = await invite.run();
    if (!result) return;
    navigate(BACK_TO, { replace: true });
  };
  return (
    <PageEditorShell
      eyebrow="Staff"
      title="Invite a staff member"
      description="The invitation is emailed once, expires in 72 hours and can be used one time. It creates one account. It does not attach to an account that already exists."
      backTo={BACK_TO}
      backLabel="Back to staff"
      actions={<SoftButton type="button" onClick={() => navigate(BACK_TO)}>Discard</SoftButton>}
    >
      {session.loading ? <LoadingBlock rows={3} label="Checking your permissions" />
        : session.error ? <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
        : !mayEdit ? <AccessDenied />
        : (
          <div className="grid max-w-[480px] gap-4">
            <TextInput label="Email address" type="email" autoComplete="off" value={email} onChange={(event) => setEmail(event.target.value)} />
            <Field label="Role" htmlFor="invite-role">
              <select id="invite-role" value={role} onChange={(event) => setRole(event.target.value)} className={denseSelect}>
                {ROLES.map((option) => <option key={option.value} value={option.value}>{option.label}</option>)}
              </select>
            </Field>
            {invite.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{invite.error}</p>}
            <div><PrimaryButton type="button" disabled={!email.includes('@')} onClick={() => setConfirming(true)}>Review invitation</PrimaryButton></div>
            <ConfirmDialog
              open={confirming}
              title={`Invite ${email.trim() || 'this address'}`}
              description={`A single-use link is sent to this address. The role is ${role === 'ADMIN' ? 'administrator' : 'staff'}.`}
              confirmLabel="Confirm and send"
              onConfirm={submit}
              onCancel={() => { if (!step.stepUp.pending && !invite.pending) { setConfirming(false); step.reset(); } }}
              busy={step.stepUp.pending || invite.pending}
            >
              <StepUpFields step={step} />
            </ConfirmDialog>
          </div>
        )}
    </PageEditorShell>
  );
}

export function StaffRemove() {
  const { id = '' } = useParams();
  const session = useAdminSession();
  const { navigate } = useRouter();
  const mayEdit = session.staff?.role === 'ADMIN';
  const [confirming, setConfirming] = useState(false);
  const step = useStepUp();
  const state = useAsync((signal) => get<{ staff: { userId: string; email: string; name: string | null; role: string; removable?: boolean }[] }>('/admin/staff', undefined, signal), [id]);
  const member = state.data?.staff.find((entry) => entry.userId === id);
  const remove = useAction(async () => post(`/admin/staff/${encodeURIComponent(id)}/remove`, {}));
  const submit = async () => {
    if (!(await step.confirm())) return;
    const result = await remove.run();
    if (!result) return;
    navigate(BACK_TO, { replace: true });
  };
  const name = member ? member.name ?? maskEmail(member.email) : 'this account';
  return (
    <PageEditorShell
      eyebrow="Staff"
      title="Remove staff access"
      description="The person keeps their customer account, orders and services. Staff sessions and API keys end immediately."
      backTo={BACK_TO}
      backLabel="Back to staff"
      actions={<SoftButton type="button" onClick={() => navigate(BACK_TO)}>Back</SoftButton>}
    >
      {session.loading || state.loading ? <LoadingBlock rows={3} label="Loading the account" />
        : session.error ? <ErrorState title="The session could not be read" message={session.error} onRetry={session.reload} />
        : !mayEdit ? <AccessDenied />
        : state.error ? <ErrorState title="The staff list could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !member ? <EmptyState title="Staff member not found." description="The account may already be a customer account." />
        : member.removable === false ? <EmptyState title="This is the last active administrator." description="Add another administrator before removing this one." />
        : (
          <div className="grid max-w-[560px] gap-4">
            <p className="text-[14.5px] text-ink2">{name} ({member.email}) loses the {member.role} role. Nothing the customer owns is deleted.</p>
            {remove.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{remove.error}</p>}
            <div><PrimaryButton type="button" onClick={() => setConfirming(true)}>Review removal</PrimaryButton></div>
            <ConfirmDialog
              open={confirming}
              title={`Remove staff access from ${name}`}
              description="Their customer sign-in stays. Open staff sessions and API keys stop working now."
              confirmLabel="Confirm and remove"
              onConfirm={submit}
              onCancel={() => { if (!step.stepUp.pending && !remove.pending) { setConfirming(false); step.reset(); } }}
              busy={step.stepUp.pending || remove.pending}
            >
              <StepUpFields step={step} />
            </ConfirmDialog>
          </div>
        )}
    </PageEditorShell>
  );
}


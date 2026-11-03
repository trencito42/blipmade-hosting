import { useEffect, useState } from 'react';
import { get, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import { ConfirmDialog, EmptyState, ErrorState, Field, LoadingBlock, PrimaryButton, Segmented, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../app/components/premium';
import { denseSelect, maskEmail, useAdminSession } from './Overview';

interface StaffMember { userId: string; email: string; name: string | null; role: string; title: string | null; permissions: string[]; removable?: boolean }

const BACK_TO = '/admin/staff';
const ROLES = [{ value: 'STAFF', label: 'Staff' }, { value: 'ADMIN', label: 'Administrator' }];

/** The role and permissions of one staff member, on their own page. The server asks for an administrator and writes the audit log. */
export default function StaffEdit() {
  const { id = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const session = useAdminSession();
  const mayEdit = session.staff?.role === 'ADMIN';
  const state = useAsync((signal) => get<{ staff: StaffMember[]; available: string[] }>('/admin/staff', undefined, signal), []);
  const member = state.data?.staff.find((entry) => entry.userId === id);
  const available = state.data?.available ?? [];
  const [permissions, setPermissions] = useState<string[]>([]);
  const [role, setRole] = useState('STAFF');
  const [confirming, setConfirming] = useState(false);
  const [stepMethod, setStepMethod] = useState<'password' | 'code'>('password');
  const [credential, setCredential] = useState('');
  const [credentialError, setCredentialError] = useState('');
  const [saved, setSaved] = useState(false);
  useEffect(() => {
    if (!member) return;
    setPermissions(member.permissions);
    setRole(member.role.toUpperCase());
  }, [member]);
  const name = member ? member.name ?? maskEmail(member.email) : '';
  const added = member ? permissions.filter((value) => !member.permissions.includes(value)) : [];
  const removed = member ? member.permissions.filter((value) => !permissions.includes(value)) : [];
  const roleChanged = Boolean(member) && role !== member!.role.toUpperCase();
  const dirty = !saved && (added.length > 0 || removed.length > 0 || roleChanged);
  useUnsavedChangesGuard(dirty, 'Discard the changes to these rights?');
  const lines = [
    added.length ? `${name} gains ${added.join(', ')}.` : '',
    removed.length ? `${name} loses ${removed.join(', ')}.` : '',
    roleChanged ? (role === 'ADMIN' ? `${name} becomes an administrator and holds every permission.` : `${name} is no longer an administrator.`) : '',
  ].filter(Boolean);
  const save = useAction(async () => put(`/admin/staff/${encodeURIComponent(id)}`, { permissions, ...(roleChanged ? { role } : {}) }));
  const stepUp = useAction(async () => post<{ stepUpUntil: string }>('/admin/staff/step-up', { [stepMethod]: credential }));
  const submit = async () => {
    if (!credential.trim()) {
      setCredentialError(stepMethod === 'password' ? 'Enter your current password.' : 'Enter your authenticator code.');
      return;
    }
    const confirmed = await stepUp.run();
    if (!confirmed) return;
    setCredential('');
    const result = await save.run();
    if (!result) return;
    setConfirming(false);
    setCredential('');
    setSaved(true);
    toast.push(`${name} updated`, 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the changes to these rights?')) navigate(BACK_TO);
  };
  const closeConfirmation = () => {
    if (stepUp.pending || save.pending) return;
    setConfirming(false);
    setCredential('');
    setCredentialError('');
    stepUp.clearError();
  };
  return (
    <PageEditorShell
      eyebrow="Staff"
      title={member ? `Rights of ${name}` : 'Staff rights'}
      description="Changes are written to the audit log. Only an administrator can give or take away the administrator role or change the permissions of an administrator."
      backTo={BACK_TO}
      backLabel="Back to staff"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => setConfirming(true)} disabled={!mayEdit || !dirty || save.pending}>Review changes</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? <LoadingBlock rows={4} label="Loading the staff member" />
        : state.error ? <ErrorState title="The staff list could not be loaded" message={state.error.message} onRetry={state.reload} />
        : !member ? <EmptyState title="Staff member not found." description="The account may have lost its staff role." />
        : (
          <div className="grid gap-4">
            {!mayEdit && <p className="text-[13px] text-ink3">Only an administrator can change a role or permissions. You see them read-only.</p>}
            <div className="max-w-[280px]">
              <Field label="Role" htmlFor="staff-role">
                <select id="staff-role" value={role} disabled={!mayEdit} onChange={(event) => setRole(event.target.value)} className={denseSelect}>
                  {ROLES.map((option) => <option key={option.value} value={option.value} disabled={option.value === 'STAFF' && member.removable === false}>{option.label}</option>)}
                </select>
              </Field>
            </div>
            <div className="grid gap-1.5 sm:grid-cols-2 lg:grid-cols-3">
              {available.map((permission) => (
                <label key={permission} className="flex min-h-[38px] items-center gap-2 rounded-xl bg-s3 px-3 py-1.5 text-[13px] text-ink">
                  <input
                    type="checkbox"
                    checked={permissions.includes(permission)}
                    disabled={!mayEdit}
                    onChange={(event) => setPermissions((current) => (event.target.checked ? [...new Set([...current, permission])] : current.filter((value) => value !== permission)))}
                    className="size-4 shrink-0 accent-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  />
                  <span className="min-w-0 break-all font-mono text-[12px] text-ink2">{permission}</span>
                </label>
              ))}
            </div>
            {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
            {mayEdit && member.removable !== false && (
              <div><Link to={`/admin/staff/${encodeURIComponent(id)}/remove`} className="text-[13.5px] font-semibold text-bad">Remove access</Link></div>
            )}
            {mayEdit && member.removable === false && <p className="text-[13px] text-ink3">This is the last active administrator, so this access cannot be removed or reduced to staff until another administrator exists.</p>}
            <ConfirmDialog
              open={confirming}
              title={`Save the rights of ${name}`}
              description={lines.join(' ') || 'Nothing changes.'}
              confirmLabel="Confirm and save"
              onConfirm={submit}
              onCancel={closeConfirmation}
              busy={stepUp.pending || save.pending}
            >
              <div className="mt-5 grid gap-4 border-t border-line pt-5">
                <Segmented
                  role="group"
                  ariaLabel="Confirmation method"
                  options={[{ value: 'password', label: 'Password' }, { value: 'code', label: 'Authenticator code' }]}
                  value={stepMethod}
                  onChange={(value) => {
                    setStepMethod(value);
                    setCredential('');
                    setCredentialError('');
                    stepUp.clearError();
                  }}
                />
                <TextInput
                  label={stepMethod === 'password' ? 'Current password' : 'Authenticator code'}
                  type={stepMethod === 'password' ? 'password' : 'text'}
                  inputMode={stepMethod === 'code' ? 'numeric' : undefined}
                  autoComplete={stepMethod === 'password' ? 'current-password' : 'one-time-code'}
                  value={credential}
                  onChange={(event) => {
                    setCredential(event.target.value);
                    setCredentialError('');
                    stepUp.clearError();
                  }}
                  error={credentialError || stepUp.fieldErrors[stepMethod] || undefined}
                />
                {stepUp.error && <p role="alert" className="rounded-xl bg-bad/10 px-3 py-2.5 text-[13px] font-medium text-bad">{stepUp.error}</p>}
              </div>
            </ConfirmDialog>
          </div>
        )}
    </PageEditorShell>
  );
}

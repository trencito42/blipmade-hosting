import { useState } from 'react';
import { get, patch } from '../../lib/api';
import { useAction, useAsync } from '../../lib/useAsync';
import { useParams, useRouter } from '../../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, useToast } from '../../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from '../components/premium';

type Role = 'viewer' | 'manager';
interface Share { id: string; role: Role; email?: string | null; name?: string | null }
interface Access { members: Share[]; invites: Share[] }

const ROLES: { value: Role; title: string; text: string }[] = [
  { value: 'viewer', title: 'Viewer', text: 'Can look at the service. Cannot change it.' },
  { value: 'manager', title: 'Manager', text: 'Can also start, stop and run the service.' },
];

/** What a member or an open invite may do. Billing, renaming and cancelling stay with the owner whatever the role. */
export default function EditAccessRole() {
  const { id = '', shareId = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const backTo = `/app/instances/${encodeURIComponent(id)}/access`;
  const state = useAsync<Access>((signal) => get<Access>(`/instances/${encodeURIComponent(id)}/access`, undefined, signal), [id]);
  const share = [...(state.data?.members ?? []), ...(state.data?.invites ?? [])].find((entry) => entry.id === shareId);
  const [draft, setDraft] = useState<Role | null>(null);
  const role = draft ?? share?.role ?? 'viewer';
  const dirty = Boolean(share && draft && draft !== share.role);
  useUnsavedChangesGuard(dirty, 'Discard the new role?');
  const save = useAction(async () => patch(`/instances/${encodeURIComponent(id)}/access/${encodeURIComponent(shareId)}`, { role }));
  const submit = async () => {
    if (!share || !dirty) return;
    if (!(await save.run())) return;
    toast.push('The role was changed.', 'ok');
    navigate(backTo, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new role?')) navigate(backTo);
  };
  return (
    <PageEditorShell
      eyebrow="Instance access"
      title="Change role"
      description="What this account may do with the service. Billing, renaming and cancelling stay with you."
      backTo={backTo}
      backLabel="Back to access"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={save.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={save.pending || !dirty}>{save.pending ? 'Saving…' : 'Save role'}</PrimaryButton>
        </>
      }
    >
      {state.loading && !state.data ? (
        <LoadingBlock rows={2} label="Loading the access" />
      ) : state.error ? (
        <ErrorState title="The access could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : !share ? (
        <ErrorState title="Access not found" message="It was removed or the code was used up." />
      ) : (
        <div className="grid gap-4">
          <p className="break-all text-[14.5px] font-semibold text-ink">{share.email ?? share.name ?? 'Waiting for a code to be used'}</p>
          <fieldset className="grid gap-2">
            <legend className="sr-only">Role</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {ROLES.map((option) => (
                <label key={option.value} className={`flex min-h-12 cursor-pointer items-start gap-3 rounded-xl border p-3.5 text-[13.5px] text-ink2 ${role === option.value ? 'border-acc/50 bg-acc-bg' : 'border-line bg-card'}`}>
                  <input type="radio" name="role" value={option.value} checked={role === option.value} onChange={() => setDraft(option.value)} className="mt-0.5 size-5 accent-[var(--color-acc)]" />
                  <span><strong className="block text-ink">{option.title}</strong>{option.text}</span>
                </label>
              ))}
            </div>
          </fieldset>
          {save.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{save.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

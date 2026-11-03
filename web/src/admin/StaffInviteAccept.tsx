import { useState, type FormEvent } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { EmptyState, PrimaryButton, TextInput } from '../ui-app';

/** The public page that turns one emailed invitation into one staff account. */
export default function StaffInviteAccept() {
  const { query, navigate } = useRouter();
  const token = query.token ?? '';
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [password, setPassword] = useState('');
  const accept = useAction(async () => post('/auth/staff-invite/accept', { token, firstName, lastName, password }));
  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const result = await accept.run();
    if (result) navigate('/admin', { replace: true });
  };
  return (
    <div className="mx-auto w-full max-w-[480px] px-4 py-16 sm:px-6">
      <form onSubmit={submit} className="grid gap-4 rounded-2xl border border-line bg-card p-6">
        <h1 className="text-[22px] font-semibold tracking-[-0.03em] text-ink">Accept your staff invitation</h1>
        {!token ? <EmptyState title="This invitation link is incomplete." description="Open the link from the email again." /> : (
          <>
            <p className="text-[14.5px] text-ink2">The link works once. Choose a password of at least 14 characters. If this email already has an account, ask an administrator to add that account instead.</p>
            <div className="grid gap-3 sm:grid-cols-2">
              <TextInput label="First name" value={firstName} onChange={(event) => setFirstName(event.target.value)} autoComplete="given-name" />
              <TextInput label="Last name" value={lastName} onChange={(event) => setLastName(event.target.value)} autoComplete="family-name" />
            </div>
            <TextInput label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="new-password" error={accept.fieldErrors.password} />
            {accept.error && <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{accept.error}</p>}
            <PrimaryButton type="submit" disabled={accept.pending || firstName.trim().length < 1 || lastName.trim().length < 1 || password.length < 14}>
              {accept.pending ? 'Creating the account…' : 'Create staff sign-in'}
            </PrimaryButton>
          </>
        )}
      </form>
    </div>
  );
}

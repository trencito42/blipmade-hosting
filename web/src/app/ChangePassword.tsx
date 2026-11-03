import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

const BACK_TO = '/app/settings?tab=security';

/** The change of the password of the account, on a page of its own. The values are never kept after the request. */
export default function ChangePassword() {
  const { navigate } = useRouter();
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(currentPassword || newPassword || repeat);
  useUnsavedChangesGuard(dirty, 'Discard the new password?');

  const change = useAction(async () =>
    post<{ changed: boolean; closedSessions: number }>('/settings/password', { currentPassword, newPassword }),
  );

  const currentError = touched && !currentPassword ? 'Enter your current password.' : undefined;
  const newError =
    touched && newPassword.length < 10
      ? 'Use at least 10 characters, an uppercase letter, a lowercase letter and a number.'
      : undefined;
  const repeatError = touched && repeat !== newPassword ? 'The two passwords do not match.' : undefined;

  const submit = async () => {
    setTouched(true);
    if (!currentPassword || newPassword.length < 10 || repeat !== newPassword) return;
    const result = await change.run();
    if (!result) return;
    setCurrentPassword('');
    setNewPassword('');
    setRepeat('');
    toast.push(
      result.closedSessions > 0
        ? `Password changed. ${result.closedSessions} other session${result.closedSessions === 1 ? '' : 's'} closed.`
        : 'Password changed',
      'ok',
    );
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard the new password?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Security"
      title="Change password"
      description="Choose a new password for this account."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={dirty}
      aside={
        <aside className="rounded-2xl bg-s1 p-5 lg:sticky lg:top-24">
          <h2 className="text-[16px] font-semibold text-ink">What changes</h2>
          <p className="mt-2 text-[13px] leading-relaxed text-ink2">
            Changing the password closes the other sessions of the account. The device you are on stays signed in.
          </p>
        </aside>
      }
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={change.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={change.pending || !dirty}>
            {change.pending ? 'Saving…' : 'Change the password'}
          </PrimaryButton>
        </>
      }
    >
      <form
        noValidate
        onSubmit={(event) => {
          event.preventDefault();
          void submit();
        }}
        className="grid gap-4"
      >
        <TextInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={currentError ?? change.fieldErrors.currentPassword}
        />
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={newError ?? change.fieldErrors.newPassword}
          hint="At least 10 characters, an uppercase letter, a lowercase letter and a number."
        />
        <TextInput
          label="Repeat the new password"
          type="password"
          autoComplete="new-password"
          value={repeat}
          onChange={(event) => setRepeat(event.target.value)}
          error={repeatError}
        />
        {change.error && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
            {change.error}
          </p>
        )}
      </form>
    </PageEditorShell>
  );
}

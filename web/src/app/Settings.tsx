import { useState } from 'react';
import { post } from '../lib/api';
import { useAction } from '../lib/useAsync';
import { useRouter } from '../router';
import { useSession } from '../session';
import {
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  TextInput,
  useToast,
} from '../ui-app';

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  STAFF: 'Staff',
  ADMIN: 'Admin',
};

export default function Settings() {
  const { user, loading, error, logout, refresh } = useSession();
  const { navigate, query } = useRouter();
  const toast = useToast();

  const token = query.token || '';

  if (loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your account" />
      </div>
    );
  }

  if (error && !user) {
    return (
      <div className="grid gap-4">
        <ErrorState title="Your account could not be loaded" message={error} onRetry={() => void refresh()} />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="grid gap-4">
        <ErrorState title="You are not signed in" message="Sign in again to manage your account." />
      </div>
    );
  }

  const name = user.name?.trim() ? user.name : '—';

  return (
    <div className="grid gap-4">
      <Panel title="Profile" description="These are the details stored on your Blipmade account.">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Name</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">{name}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Email</dt>
            <dd className="mt-1 break-all text-[15px] font-bold text-ink">{user.email}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Role</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">{ROLE_LABEL[user.role] ?? user.role}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Email verification</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">
              {user.emailVerified ? 'Verified' : 'Not verified yet'}
            </dd>
          </div>
        </dl>
        <p className="mt-3 px-1 text-[12.5px] text-ink3">
          Editing your name or email address is not available yet. The values above are read-only.
        </p>
      </Panel>

      <PasswordPanel token={token} email={user.email} />

      <Panel title="Sessions" description="How this sign-in works.">
        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Signed in as</dt>
            <dd className="mt-1 break-all text-[15px] font-bold text-ink">{user.email}</dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Account role</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">{ROLE_LABEL[user.role] ?? user.role}</dd>
          </div>
        </dl>
        <p className="mt-3 px-1 text-[12.5px] text-ink3">
          Your session is held on the server in an HttpOnly cookie, so it cannot be read by scripts in the browser. A list
          of the devices signed in to this account is not available yet.
        </p>
        <div className="mt-4">
          <SoftButton
            onClick={async () => {
              await logout();
              toast.push('Signed out', 'ok');
              navigate('/');
            }}
          >
            Sign out of this device
          </SoftButton>
        </div>
      </Panel>

      <Panel title="API keys" description="Programmatic access to your account.">
        <p className="rounded-2xl bg-s2 px-4 py-4 text-[14px] text-ink2">
          Not available yet. The Blipmade API does not expose key management, so no keys can be created or revoked here.
        </p>
      </Panel>

      <Panel title="Notifications" description="Email and webhook preferences.">
        <p className="rounded-2xl bg-s2 px-4 py-4 text-[14px] text-ink2">
          Not available yet. There is no notification endpoint to read or change, so preferences cannot be edited here.
        </p>
      </Panel>

      <Panel title="Account">
        <p className="rounded-2xl bg-s2 px-4 py-4 text-[14px] text-ink2">
          Deleting your account and its instances is not available yet. Cancel individual instances from the billing page
          instead — they keep running until the end of the paid period.
        </p>
      </Panel>
    </div>
  );
}

function PasswordPanel({ token, email }: { token: string; email: string }) {
  const toast = useToast();
  const { navigate } = useRouter();
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [touched, setTouched] = useState(false);
  const [requested, setRequested] = useState(false);

  const reset = useAction(async () => {
    await post<void>('/auth/reset-password', { token, password });
    return true;
  });

  const request = useAction(async () => {
    await post<void>('/auth/forgot-password', { email });
    return true;
  });

  const passwordError = touched && password.length < 8 ? 'Use at least 8 characters.' : undefined;
  const confirmError = touched && confirm !== password ? 'The two passwords do not match.' : undefined;

  return (
    <Panel title="Password" description="Keep the password for this account private.">
      {token ? (
        <div className="grid gap-3">
          <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
            You opened a password reset link. Choose a new password to finish.
          </p>
          <TextInput
            label="New password"
            type="password"
            autoComplete="new-password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            error={passwordError}
            className="scroll-mt-16"
          />
          <TextInput
            label="Repeat new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            onChange={(e) => setConfirm(e.target.value)}
            error={confirmError}
            className="scroll-mt-16"
          />
          {reset.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
              {reset.error}
            </p>
          )}
          <div className="flex justify-end">
            <PrimaryButton
              onClick={async () => {
                setTouched(true);
                if (password.length < 8 || confirm !== password) return;
                const done = await reset.run();
                if (!done) return;
                toast.push('Password updated', 'ok');
                navigate('/app/settings');
              }}
              disabled={reset.pending}
            >
              {reset.pending ? 'Saving…' : 'Set new password'}
            </PrimaryButton>
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
            There is no password change endpoint for a signed-in account, so we cannot set a new password here. Request a
            reset link instead: we email a link to <span className="break-all">{email}</span>, and it opens this page
            with the token to set a new password.
          </p>
          {requested && (
            <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc" role="status">
              If <span className="break-all">{email}</span> has an account, a reset link is on its way. Check your inbox
              and your spam folder.
            </p>
          )}
          {request.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
              {request.error}
            </p>
          )}
          <div className="flex justify-end">
            <PrimaryButton
              onClick={async () => {
                const done = await request.run();
                if (!done) return;
                setRequested(true);
              }}
              disabled={request.pending}
              className="w-full justify-center sm:w-auto"
            >
              {request.pending ? 'Sending…' : 'Request a password reset link'}
            </PrimaryButton>
          </div>
        </div>
      )}
    </Panel>
  );
}

import { useEffect, useState, type FormEvent } from 'react';
import { ApiError, del, get, patch, post, put } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useRouter } from '../router';
import { useSession } from '../session';
import {
  DangerButton,
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  TextInput,
  useToast,
} from '../ui-app';

/**
 * The settings of the account of a customer.
 *
 * Everything on this page comes from GET /api/settings, so the page never
 * shows a value the server does not know. Every change is a request that the
 * server answers, and the answer is what the page shows afterwards.
 */

interface SettingsResponse {
  profile: {
    firstName: string;
    lastName: string;
    email: string;
    emailVerified: boolean;
    role: string;
    createdAt: string;
  };
  pendingEmail: string | null;
  pendingEmailExpiresAt: string | null;
  preferences: {
    productUpdates: boolean;
    billing: boolean;
    support: boolean;
    incidents: boolean;
    marketing: boolean;
    updatedAt: string;
  };
  sessions: {
    id: string;
    ip: string | null;
    userAgent: string | null;
    device: string;
    createdAt: string;
    expiresAt: string;
    current: boolean;
  }[];
  account: {
    deletionRequestedAt: string | null;
    services: number;
    subscriptions: number;
  };
}

const ROLE_LABEL: Record<string, string> = {
  CUSTOMER: 'Customer',
  STAFF: 'Staff',
  ADMIN: 'Admin',
};

function fmtDate(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return '—';
  return date.toLocaleDateString('en-IE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function messageOf(error: unknown, fallback: string): string {
  if (error instanceof ApiError) {
    const field = error.fields ? Object.values(error.fields)[0] : undefined;
    return field ?? error.message;
  }
  if (error instanceof Error) return error.message;
  return fallback;
}

export default function Settings() {
  const { user, loading: sessionLoading, logout, refresh } = useSession();
  const { query, navigate } = useRouter();
  const toast = useToast();

  const state = useAsync<SettingsResponse>((signal) => get<SettingsResponse>('/settings', undefined, signal), []);

  // A link for a change of the address opens this page with the token in the
  // query. The token is used once and is never shown again.
  const [confirmingEmail, setConfirmingEmail] = useState<string | null>(null);
  const [emailNotice, setEmailNotice] = useState<string | null>(null);

  useEffect(() => {
    const token = query.emailChange;
    if (!token || !user) return;
    setConfirmingEmail(token);
  }, [query.emailChange, user]);

  const confirmEmail = useAction(async (token: string) => {
    const result = await post<{ email: string }>('/settings/email/confirm', { token });
    return result.email;
  });

  useEffect(() => {
    if (!confirmingEmail || confirmEmail.pending) return;
    void (async () => {
      const email = await confirmEmail.run(confirmingEmail);
      setConfirmingEmail(null);
      if (email) {
        toast.push('Email address changed', 'ok');
        navigate('/app/settings', { replace: true });
        state.reload();
        void refresh();
      }
    })();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [confirmingEmail]);

  if (sessionLoading || state.loading) {
    return (
      <div className="grid gap-4">
        <LoadingBlock rows={3} label="Loading your account" />
      </div>
    );
  }

  if (state.error) {
    return (
      <div className="grid gap-4">
        <ErrorState
          title="Your account could not be loaded"
          message={state.error.message}
          onRetry={state.reload}
        />
      </div>
    );
  }

  const data = state.data;
  if (!data) {
    return (
      <div className="grid gap-4">
        <ErrorState title="Your account could not be loaded" message="Try again in a moment." onRetry={state.reload} />
      </div>
    );
  }

  return (
    <div className="grid gap-4 pb-16 lg:pb-0">
      <ProfilePanel
        data={data}
        emailNotice={emailNotice}
        setEmailNotice={setEmailNotice}
        onChanged={state.reload}
      />
      <PasswordPanel />
      <SessionsPanel sessions={data.sessions} onChanged={state.reload} />
      <NotificationsPanel preferences={data.preferences} />
      <AccountPanel account={data.account} />
    </div>
  );
}

/** The name and the address of the account. */
function ProfilePanel({
  data,
  emailNotice,
  setEmailNotice,
  onChanged,
}: {
  data: SettingsResponse;
  emailNotice: string | null;
  setEmailNotice: (value: string | null) => void;
  onChanged: () => void;
}) {
  const toast = useToast();
  const [firstName, setFirstName] = useState(data.profile.firstName);
  const [lastName, setLastName] = useState(data.profile.lastName);
  const [touched, setTouched] = useState(false);

  const [changingEmail, setChangingEmail] = useState(false);
  const [email, setEmail] = useState('');
  const [emailError, setEmailError] = useState<string | undefined>();

  const save = useAction(async () => {
    await patch('/settings/profile', { firstName: firstName.trim(), lastName: lastName.trim() });
    return true;
  });

  const requestEmail = useAction(async () => {
    const result = await post<{ message: string; delivered: boolean; pendingEmail: string }>('/settings/email', {
      email: email.trim(),
    });
    return result;
  });

  const nameError = touched && !firstName.trim() ? 'Enter your first name.' : undefined;
  const lastNameError = touched && !lastName.trim() ? 'Enter your last name.' : undefined;

  const onSave = async () => {
    setTouched(true);
    if (!firstName.trim() || !lastName.trim()) return;
    const done = await save.run();
    if (!done) return;
    toast.push('Name saved', 'ok');
    onChanged();
  };

  const onRequestEmail = async () => {
    setEmailError(undefined);
    try {
      const result = await requestEmail.run();
      if (!result) {
        setEmailError(requestEmail.error ?? 'We could not send the confirmation link.');
        return;
      }
      setChangingEmail(false);
      setEmail('');
      setEmailNotice(result.message);
      onChanged();
    } catch (error) {
      setEmailError(messageOf(error, 'We could not send the confirmation link.'));
    }
  };

  return (
    <Panel title="Profile" description="The details of your Blipmade account.">
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-2">
          <TextInput
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            onBlur={() => setTouched(true)}
            error={nameError}
            autoComplete="given-name"
            enterKeyHint="next"
          />
          <TextInput
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            onBlur={() => setTouched(true)}
            error={lastNameError}
            autoComplete="family-name"
            enterKeyHint="next"
          />
        </div>

        <div className="flex justify-end">
          <PrimaryButton onClick={onSave} disabled={save.pending}>
            {save.pending ? 'Saving…' : 'Save the name'}
          </PrimaryButton>
        </div>

        {save.error && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
            {save.error}
          </p>
        )}

        <div className="grid gap-3 rounded-2xl bg-s2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Email address</p>
              <p className="mt-0.5 break-all text-[15px] font-bold text-ink">{data.profile.email}</p>
            </div>
            <span
              className={`shrink-0 rounded-full px-3 py-1 text-[12px] font-bold ${
                data.profile.emailVerified ? 'bg-acc-bg text-acc' : 'bg-s3 text-ink2'
              }`}
            >
              {data.profile.emailVerified ? 'Verified' : 'Not verified'}
            </span>
          </div>

          {data.pendingEmail && (
            <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc" role="status">
              A confirmation link was sent to {data.pendingEmail}. The address of the account changes when that link is
              opened.
            </p>
          )}

          {emailNotice && (
            <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2" role="status">
              {emailNotice}
            </p>
          )}

          {changingEmail ? (
            <div className="grid gap-3">
              <TextInput
                label="New email address"
                type="email"
                inputMode="email"
                autoComplete="email"
                value={email}
                onChange={(event) => setEmail(event.target.value)}
                error={emailError}
                placeholder="name@example.com"
              />
              <p className="text-[12.5px] leading-relaxed text-ink3">
                The address of the account changes only after the new address has answered. Your current address keeps
                working until then.
              </p>
              <div className="flex flex-wrap justify-end gap-2">
                <SoftButton onClick={() => setChangingEmail(false)} disabled={requestEmail.pending}>
                  Cancel
                </SoftButton>
                <PrimaryButton onClick={onRequestEmail} disabled={requestEmail.pending || !email.trim()}>
                  {requestEmail.pending ? 'Sending…' : 'Send the confirmation link'}
                </PrimaryButton>
              </div>
            </div>
          ) : (
            <div className="flex justify-end">
              <SoftButton onClick={() => setChangingEmail(true)}>Change the email address</SoftButton>
            </div>
          )}
        </div>

        <dl className="grid gap-3 sm:grid-cols-2">
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Account role</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">
              {ROLE_LABEL[data.profile.role] ?? data.profile.role}
            </dd>
          </div>
          <div className="rounded-2xl bg-s2 p-3.5">
            <dt className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Member since</dt>
            <dd className="mt-1 text-[15px] font-bold text-ink">{fmtDate(data.profile.createdAt)}</dd>
          </div>
        </dl>
      </div>
    </Panel>
  );
}

/** The password of the account. */
function PasswordPanel() {
  const toast = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [repeat, setRepeat] = useState('');
  const [touched, setTouched] = useState(false);

  const change = useAction(async () => {
    const result = await post<{ changed: boolean; closedSessions: number }>('/settings/password', {
      currentPassword,
      newPassword,
    });
    return result;
  });

  const currentError = touched && !currentPassword ? 'Enter your current password.' : undefined;
  const newError =
    touched && newPassword.length < 10
      ? 'Use at least 10 characters, an uppercase letter, a lowercase letter and a number.'
      : undefined;
  const repeatError = touched && repeat !== newPassword ? 'The two passwords do not match.' : undefined;

  const onSubmit = async (event: FormEvent) => {
    event.preventDefault();
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
  };

  return (
    <Panel title="Password" description="The password of this account.">
      <form onSubmit={onSubmit} noValidate className="grid gap-3">
        <TextInput
          label="Current password"
          type="password"
          autoComplete="current-password"
          value={currentPassword}
          onChange={(event) => setCurrentPassword(event.target.value)}
          error={currentError}
        />
        <TextInput
          label="New password"
          type="password"
          autoComplete="new-password"
          value={newPassword}
          onChange={(event) => setNewPassword(event.target.value)}
          error={newError}
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
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
            {change.error}
          </p>
        )}

        <p className="text-[12.5px] leading-relaxed text-ink3">
          Changing the password closes the other sessions of the account. The device you are on stays signed in.
        </p>

        <div className="flex justify-end">
          <PrimaryButton type="submit" disabled={change.pending}>
            {change.pending ? 'Saving…' : 'Change the password'}
          </PrimaryButton>
        </div>
      </form>
    </Panel>
  );
}

/** The devices that are signed in. */
function SessionsPanel({
  sessions,
  onChanged,
}: {
  sessions: SettingsResponse['sessions'];
  onChanged: () => void;
}) {
  const { logout } = useSession();
  const toast = useToast();

  const revoke = useAction(async (id: string) => {
    const result = await del<{ revoked: boolean; current: boolean }>(`/settings/sessions/${encodeURIComponent(id)}`);
    return result;
  });

  const onRevoke = async (id: string, current: boolean) => {
    const result = await revoke.run(id);
    if (!result) return;
    onChanged();
    if (current) {
      await logout();
      toast.push('This session was closed', 'ok');
      return;
    }
    toast.push('Session closed', 'ok');
  };

  return (
    <Panel title="Sessions" description="The devices that are signed in to this account.">
      {sessions.length === 0 ? (
        <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
          No session is open for this account right now.
        </p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((session) => (
            <li key={session.id} className="grid gap-2 rounded-2xl bg-s2 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-bold text-ink">
                  {session.device}
                  {session.current && (
                    <span className="rounded-full bg-acc-bg px-2.5 py-0.5 text-[11px] font-bold text-acc">This device</span>
                  )}
                </p>
                <p className="mt-0.5 font-mono text-[12.5px] text-ink3">
                  {session.ip ?? 'Unknown address'} · signed in on {fmtDate(session.createdAt)}
                </p>
              </div>
              <SoftButton
                onClick={() => onRevoke(session.id, session.current)}
                disabled={revoke.pending}
                className="w-full sm:w-auto"
              >
                {session.current ? 'Sign out' : 'Close session'}
              </SoftButton>
            </li>
          ))}
        </ul>
      )}

      {revoke.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
          {revoke.error}
        </p>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
        The session is held on the server in an HttpOnly cookie, so a script in the browser cannot read it. Closing a
        session ends it at once, wherever it is used.
      </p>
    </Panel>
  );
}

/** The preferences that can be switched on and off. */
type PreferenceKey = 'productUpdates' | 'billing' | 'support' | 'incidents' | 'marketing';

/** What the customer wants to hear about. */
function NotificationsPanel({ preferences }: { preferences: SettingsResponse['preferences'] }) {
  const toast = useToast();
  const [values, setValues] = useState<Record<PreferenceKey, boolean>>({
    productUpdates: preferences.productUpdates,
    billing: preferences.billing,
    support: preferences.support,
    incidents: preferences.incidents,
    marketing: preferences.marketing,
  });

  const save = useAction(async () => {
    const result = await put<{ preferences: SettingsResponse['preferences'] }>('/settings/notifications', {
      productUpdates: values.productUpdates,
      billing: values.billing,
      support: values.support,
      incidents: values.incidents,
      marketing: values.marketing,
    });
    return result.preferences;
  });

  const onSave = async () => {
    const saved = await save.run();
    if (!saved) return;
    setValues(saved);
    toast.push('Preferences saved', 'ok');
  };

  const rows: { key: PreferenceKey; label: string; hint: string }[] = [
    { key: 'productUpdates', label: 'Product news', hint: 'New products and changes to the ones you use.' },
    { key: 'billing', label: 'Billing', hint: 'Invoices, payments and changes to your subscription.' },
    { key: 'support', label: 'Support', hint: 'Replies to your tickets and changes to them.' },
    { key: 'incidents', label: 'Service incidents', hint: 'Problems that affect your apps or databases.' },
    { key: 'marketing', label: 'Offers', hint: 'News about discounts and campaigns.' },
  ];

  return (
    <Panel title="Notifications" description="What you want to hear about.">
      <div className="grid gap-2">
        {rows.map((row) => (
          <label key={row.key} className="flex items-start gap-3 rounded-2xl bg-s2 p-3.5">
            <input
              type="checkbox"
              checked={values[row.key]}
              onChange={(event) => setValues((current) => ({ ...current, [row.key]: event.target.checked }))}
              className="mt-0.5 size-6 shrink-0 accent-acc"
            />
            <span className="min-w-0">
              <span className="block text-[15px] font-bold text-ink">{row.label}</span>
              <span className="mt-0.5 block text-[13px] leading-relaxed text-ink3">{row.hint}</span>
            </span>
          </label>
        ))}
      </div>

      {save.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
          {save.error}
        </p>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
        These are your preferences. They say what you want to hear about; they do not promise that a message has been
        sent. The messages themselves need a mail relay, and the address they come from has to be accepted by the
        provider.
      </p>

      <div className="mt-3 flex justify-end">
        <PrimaryButton onClick={onSave} disabled={save.pending}>
          {save.pending ? 'Saving…' : 'Save the preferences'}
        </PrimaryButton>
      </div>
    </Panel>
  );
}

/** The closing of the account. */
function AccountPanel({ account }: { account: SettingsResponse['account'] }) {
  const toast = useToast();
  const { logout } = useSession();
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [touched, setTouched] = useState(false);

  const request = useAction(async () => {
    const result = await post<{ requestedAt: string; message: string }>('/settings/account/closure', {
      password,
      confirmation: 'CLOSE MY ACCOUNT',
    });
    return result;
  });

  const cancel = useAction(async () => {
    await del('/settings/account/closure');
    return true;
  });

  const passwordError = touched && !password ? 'Enter your password.' : undefined;
  const confirmationError =
    touched && confirmation !== 'CLOSE MY ACCOUNT' ? 'Type CLOSE MY ACCOUNT to confirm.' : undefined;

  const onConfirm = async () => {
    setTouched(true);
    if (!password || confirmation !== 'CLOSE MY ACCOUNT') return;
    const result = await request.run();
    if (!result) return;
    setPassword('');
    setConfirmation('');
    toast.push('The request is recorded', 'ok');
  };

  const onCancelRequest = async () => {
    const done = await cancel.run();
    if (!done) return;
    toast.push('The request was taken back', 'ok');
  };

  if (account.deletionRequestedAt) {
    return (
      <Panel title="Account" description="The closing of this account.">
        <p className="rounded-2xl bg-acc-bg px-4 py-3 text-[13.5px] text-acc" role="status">
          The request to close this account was recorded on {fmtDate(account.deletionRequestedAt)}. Your services keep
          running until the end of the period you paid for, and the team will write to you before anything is closed.
        </p>
        {(request.error || cancel.error) && (
          <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
            {request.error ?? cancel.error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <SoftButton onClick={onCancelRequest} disabled={cancel.pending}>
            {cancel.pending ? 'Working…' : 'Take the request back'}
          </SoftButton>
          <DangerButton
            onClick={async () => {
              await logout();
              toast.push('Signed out', 'ok');
            }}
          >
            Sign out
          </DangerButton>
        </div>
      </Panel>
    );
  }

  return (
    <Panel title="Account" description="The closing of this account.">
      <p className="text-[14px] leading-relaxed text-ink2">
        You can ask for the account to be closed. The request is recorded and a person of the team looks at it before
        anything is removed. Your apps and databases keep running until the end of the period you paid for.
      </p>
      {account.services > 0 && (
        <p className="mt-2 text-[13px] text-ink3">
          This account has {account.services} active service{account.services === 1 ? '' : 's'} and{' '}
          {account.subscriptions} subscription{account.subscriptions === 1 ? '' : 's'}.
        </p>
      )}

      <div className="mt-3 grid gap-3">
        <TextInput
          label="Your password"
          type="password"
          autoComplete="current-password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          error={passwordError}
        />
        <TextInput
          label="Type CLOSE MY ACCOUNT to confirm"
          value={confirmation}
          onChange={(event) => setConfirmation(event.target.value)}
          error={confirmationError}
          autoComplete="off"
          spellCheck={false}
          className="font-mono"
        />
      </div>

      {request.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-bold text-bad">
          {request.error}
        </p>
      )}

      <div className="mt-3 flex justify-end">
        <DangerButton onClick={onConfirm} disabled={request.pending}>
          {request.pending ? 'Working…' : 'Ask for the account to be closed'}
        </DangerButton>
      </div>
    </Panel>
  );
}

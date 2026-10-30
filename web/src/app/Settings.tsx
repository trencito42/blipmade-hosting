import { useEffect, useState, type FormEvent } from 'react';
import { BillingAddressFields, emptyBillingAddress, validateBillingAddress, type BillingAddressValue } from './BillingAddressFields';
import {
  ApiError,
  del,
  get,
  patch,
  post,
  put,
  sessionSummary,
  type AccountSession,
  type NotificationCategoryView,
  type NotificationChannel,
  type NotificationGroupKey,
  type NotificationPreferences,
  type NotificationPreferencesResponse,
} from '../lib/api';
import { Icon } from '../icons';
import type { IconName } from '../icon-map';
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
  StatusPill,
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
  billingAddress: BillingAddressValue | null;
  pendingEmail: string | null;
  pendingEmailExpiresAt: string | null;
  sessions: AccountSession[];
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

/** The message of an error, in the words of the server. */
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

  const tab = SETTINGS_TABS.find((entry) => entry.id === query.tab) ?? SETTINGS_TABS[0]!;
  const choose = (id: string) => navigate(`/app/settings${id === SETTINGS_TABS[0]!.id ? '' : `?tab=${id}`}`, { replace: true });

  return (
    <div className="grid items-start gap-5 pb-16 lg:pb-0">
      <nav aria-label="Settings sections" className="-mx-1 overflow-x-auto px-1 no-scrollbar">
        <ul className="flex gap-1.5">
          {SETTINGS_TABS.map((entry) => {
            const active = entry.id === tab.id;
            return (
              <li key={entry.id} className="shrink-0">
                <button
                  type="button"
                  aria-current={active ? 'page' : undefined}
                  onClick={() => choose(entry.id)}
                  className={`flex min-h-11 w-full items-center gap-2.5 rounded-full border px-4 text-left text-[14.5px] font-semibold whitespace-nowrap transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-acc ${
                    active ? 'border-acc/40 bg-acc-bg text-ink' : 'border-line text-ink2 hover:bg-s3 hover:text-ink'
                  } ${entry.danger && !active ? 'text-bad' : ''}`}
                >
                  <Icon name={entry.icon} size={15} className="w-4 shrink-0" />
                  {entry.label}
                </button>
              </li>
            );
          })}
        </ul>
      </nav>
      <div className="grid gap-4 lg:grid-cols-2 lg:items-start">
        {tab.id === 'profile' && (
          <>
            <ProfilePanel data={data} emailNotice={emailNotice} setEmailNotice={setEmailNotice} onChanged={state.reload} />
            <BillingAddressPanel address={data.billingAddress} onChanged={state.reload} />
          </>
        )}
        {tab.id === 'security' && (
          <>
            <PasswordPanel />
            <SessionsPanel sessions={data.sessions} onChanged={state.reload} />
          </>
        )}
        {tab.id === 'notifications' && <NotificationsPanel />}
        {tab.id === 'account' && <AccountPanel account={data.account} />}
      </div>
    </div>
  );
}

/** The sections of the settings. The section is in the address, so a link can open it. */
const SETTINGS_TABS: { id: string; label: string; icon: IconName; danger?: boolean }[] = [
  { id: 'profile', label: 'Profile and billing', icon: 'user' },
  { id: 'security', label: 'Password and sessions', icon: 'lock' },
  { id: 'notifications', label: 'Notifications', icon: 'bell' },
  { id: 'account', label: 'Close account', icon: 'warn', danger: true },
];

function BillingAddressPanel({ address, onChanged }: { address: BillingAddressValue | null; onChanged: () => void }) {
  const { push } = useToast();
  const [value, setValue] = useState<BillingAddressValue>(address ?? emptyBillingAddress);
  const save = useAction(async () => { await put('/settings/billing-address', value); return true; });
  const [localErrors, setLocalErrors] = useState<Partial<Record<string, string>>>({});
  useEffect(() => { setValue(address ?? emptyBillingAddress); }, [address]);
  const submit = async () => {
    const problems = validateBillingAddress(value);
    setLocalErrors(problems);
    const names = Object.keys(problems);
    if (names.length > 0) return;
    const result = await save.run();
    if (result) { push('Billing address saved'); onChanged(); }
  };
  return (
    <Panel title="Billing address" description="These details are saved to your account and copied onto new invoices.">
      <div className="grid gap-4">
        <BillingAddressFields value={value} onChange={(next) => { setValue(next); setLocalErrors({}); }} errors={{ ...save.fieldErrors, ...localErrors }} />
        <div><PrimaryButton onClick={() => void submit()} disabled={save.pending}>{save.pending ? 'Saving…' : 'Save billing address'}</PrimaryButton></div>
        {(Object.keys(localErrors).length > 0 || save.error) && (
          <p role="alert" className="text-[13px] text-bad">
            {Object.keys(localErrors).length > 0 ? `Please fix ${Object.keys(localErrors).length === 1 ? 'the highlighted field' : `the ${Object.keys(localErrors).length} highlighted fields`} before saving.` : save.error}
          </p>
        )}
      </div>
    </Panel>
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
  const { logout } = useSession();
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
    <Panel title="Profile" description="The details of your Blipmade account." action={<SoftButton onClick={() => void logout()}>Sign out</SoftButton>}>
      <div className="grid gap-4">
        <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_auto] sm:items-end">
          <TextInput
            label="First name"
            value={firstName}
            onChange={(event) => setFirstName(event.target.value)}
            onBlur={() => setTouched(true)}
            error={nameError ?? save.fieldErrors.firstName}
            autoComplete="given-name"
            enterKeyHint="next"
          />
          <TextInput
            label="Last name"
            value={lastName}
            onChange={(event) => setLastName(event.target.value)}
            onBlur={() => setTouched(true)}
            error={lastNameError ?? save.fieldErrors.lastName}
            autoComplete="family-name"
            enterKeyHint="next"
          />
          <PrimaryButton onClick={onSave} disabled={save.pending}>
            {save.pending ? 'Saving…' : 'Save'}
          </PrimaryButton>
        </div>

        {save.error && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
            {save.error}
          </p>
        )}

        <div className="grid gap-3 rounded-2xl bg-s2 p-4">
          <div className="flex flex-wrap items-center justify-between gap-2">
            <div className="min-w-0">
              <p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Email address</p>
              <p className="mt-0.5 break-all text-[15px] font-semibold text-ink">{data.profile.email}</p>
            </div>
            <div className="flex shrink-0 items-center gap-2">
              <span
                className={`rounded-full px-3 py-1 text-[12px] font-bold ${
                  data.profile.emailVerified ? 'bg-acc-bg text-acc' : 'bg-s3 text-ink2'
                }`}
              >
                {data.profile.emailVerified ? 'Verified' : 'Not verified'}
              </span>
              {!changingEmail && <SoftButton onClick={() => setChangingEmail(true)}>Change</SoftButton>}
            </div>
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
          ) : null}
        </div>

        <p className="text-[13px] text-ink3">
          {ROLE_LABEL[data.profile.role] ?? data.profile.role} · member since {fmtDate(data.profile.createdAt)}
        </p>
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

/** The sessions that are open for this account. */
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

  const closeOthers = useAction(async () => {
    const result = await del<{ closed: number; current: boolean }>('/settings/sessions');
    return result;
  });

  // Closing the other sessions is asked for twice: once for the button and
  // once for the words that say what is about to happen.
  const [confirmingOthers, setConfirmingOthers] = useState(false);
  const others = sessions.filter((session) => !session.current).length;

  const onRevoke = async (id: string) => {
    const result = await revoke.run(id);
    if (!result) return;
    onChanged();
    // The server says which session was closed. The answer of the server is
    // the truth, not the sign that was in the list.
    if (result.current) {
      await logout();
      toast.push('This session was closed', 'ok');
      return;
    }
    toast.push('Session closed', 'ok');
  };

  const onCloseOthers = async () => {
    const result = await closeOthers.run();
    setConfirmingOthers(false);
    if (!result) return;
    onChanged();
    toast.push(
      result.closed > 0
        ? `${result.closed} other session${result.closed === 1 ? '' : 's'} closed.`
        : 'There was no other session to close.',
      'ok',
    );
  };

  return (
    <Panel title="Sessions" description="The sessions that are open for this account.">
      {sessions.length === 0 ? (
        <p className="rounded-2xl bg-s2 px-4 py-3 text-[13.5px] text-ink2">
          No session is open for this account right now.
        </p>
      ) : (
        <ul className="grid gap-2">
          {sessions.map((session) => (
            <li key={session.id} className="grid gap-2 rounded-2xl bg-s2 p-3.5 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center">
              <div className="min-w-0">
                <p className="flex flex-wrap items-center gap-2 text-[14.5px] font-medium text-ink">
                  {session.device}
                  {session.current && <StatusPill status="current" label="This device" />}
                </p>
                <p className="mt-0.5 font-mono text-[12.5px] text-ink3" title={session.ip ?? undefined}>{sessionSummary(session)}</p>
              </div>
              <SoftButton
                onClick={() => onRevoke(session.id)}
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
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {revoke.error}
        </p>
      )}

      {others > 0 && (
        <div className="mt-3 flex flex-wrap items-center justify-end gap-2">
          {confirmingOthers ? (
            <>
              <span className="mr-auto text-[12.5px] leading-relaxed text-ink3">
                Close the {others} other session{others === 1 ? '' : 's'} of this account? The session of this device
                stays open.
              </span>
              <SoftButton onClick={() => setConfirmingOthers(false)} disabled={closeOthers.pending}>
                Cancel
              </SoftButton>
              <DangerButton onClick={onCloseOthers} disabled={closeOthers.pending}>
                {closeOthers.pending ? 'Working…' : 'Close the other sessions'}
              </DangerButton>
            </>
          ) : (
            <SoftButton onClick={() => setConfirmingOthers(true)} disabled={closeOthers.pending}>
              Close all other sessions
            </SoftButton>
          )}
        </div>
      )}

      {closeOthers.error && (
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
          {closeOthers.error}
        </p>
      )}

      <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
        The session is held on the server in an HttpOnly cookie, so a script in the browser cannot read it. Closing a
        session ends it at once, wherever it is used.
      </p>
    </Panel>
  );
}

/**
 * The preferences of the notifications.
 *
 * The groups of the messages come from the server, in the order the server
 * gives them and with the words the server uses. Every switch is saved with
 * the preferences of the account, and the answer of the server is what the
 * page shows afterwards: a refusal is written in words and the switches go
 * back to what the server holds.
 */
function NotificationsPanel() {
  const toast = useToast();
  const state = useAsync(
    (signal) => get<NotificationPreferencesResponse>('/notifications/preferences', undefined, signal),
    [],
  );

  // The switches show the answer of the server until the customer touches
  // one. After that the answer of the last save is what the page shows.
  const [values, setValues] = useState<NotificationPreferences | null>(null);
  const preferences = values ?? state.data?.preferences ?? null;
  const categories = state.data?.categories ?? [];

  const save = useAction(async (next: NotificationPreferences) => {
    const result = await put<{ preferences: NotificationPreferences }>('/notifications/preferences', {
      preferences: {
        // The essential group is not sent: the server keeps it on whatever
        // the customer sends.
        ordersBilling: next.ordersBilling,
        billing: next.billing,
        hostingServices: next.hostingServices,
        support: next.support,
        domainsEmail: next.domainsEmail,
        incidents: next.incidents,
        productUpdates: next.productUpdates,
        marketing: next.marketing,
        emailChannel: next.emailChannel,
        inAppChannel: next.inAppChannel,
      },
    });
    return result.preferences;
  });

  const onToggle = async (group: NotificationGroupKey, channel: NotificationChannel, next: boolean) => {
    if (!preferences) return;
    const updated: NotificationPreferences = { ...preferences, [group]: next };
    // Turning a group on with every channel off would mean nothing, so the
    // channel it is offered on is turned on with it. Turning a group off
    // leaves the channels as they are.
    if (next) {
      if (channel === 'email') updated.emailChannel = true;
      else updated.inAppChannel = true;
    }
    setValues(updated);
    const saved = await save.run(updated);
    if (!saved) {
      // The server refused: the switches go back to what the server holds.
      setValues(null);
      return;
    }
    setValues(saved);
    toast.push('Preferences saved', 'ok');
  };

  const onChannel = async (channel: NotificationChannel, next: boolean) => {
    if (!preferences) return;
    const updated: NotificationPreferences = { ...preferences, [channel === 'email' ? 'emailChannel' : 'inAppChannel']: next };
    setValues(updated);
    const saved = await save.run(updated);
    if (!saved) {
      setValues(null);
      return;
    }
    setValues(saved);
    toast.push('Preferences saved', 'ok');
  };

  const onRestoreLegacyBilling = async () => {
    if (!preferences) return;
    const updated: NotificationPreferences = { ...preferences, billing: true };
    setValues(updated);
    const saved = await save.run(updated);
    if (!saved) {
      setValues(null);
      return;
    }
    setValues(saved);
    toast.push('The billing switch of the old platform is on again', 'ok');
  };

  return (
    <Panel title="Notifications" description="The groups of the messages, and where they reach you.">
      {state.loading ? (
        <LoadingBlock rows={3} label="Loading your preferences" />
      ) : state.error ? (
        <ErrorState
          title="Your preferences could not be loaded"
          message={state.error.message}
          onRetry={state.reload}
        />
      ) : !preferences ? (
        <ErrorState
          title="Your preferences could not be loaded"
          message="Try again in a moment."
          onRetry={state.reload}
        />
      ) : (
        <div className="grid gap-3">
          {save.error && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
              {save.error}
            </p>
          )}

          <fieldset className="rounded-2xl border border-line p-3.5">
            <legend className="px-1.5 text-[13px] font-semibold text-ink3">Where messages reach you</legend>
            <div className="grid gap-2 sm:grid-cols-2">
              {(['email', 'in_app'] as NotificationChannel[]).map((channel) => (
                <label key={channel} className="flex items-center gap-3">
                  <input
                    type="checkbox"
                    checked={channel === 'email' ? preferences.emailChannel : preferences.inAppChannel}
                    disabled={save.pending}
                    onChange={(event) => void onChannel(channel, event.target.checked)}
                    className="size-6 shrink-0 accent-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
                  />
                  <span className="text-[14px] font-medium text-ink">{CHANNEL_LABEL[channel]}</span>
                </label>
              ))}
            </div>
            <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">
              These two apply to every group below. A group you switch off is silent on both.
            </p>
          </fieldset>

          <NotificationPreferencesPanel
            preferences={preferences}
            categories={categories}
            pending={save.pending}
            onToggle={onToggle}
            onRestoreLegacyBilling={onRestoreLegacyBilling}
          />

          <p className="text-[12.5px] leading-relaxed text-ink3">
            These are your preferences. They say what you want to hear about; they do not promise that a message has been
            sent. The messages themselves need a mail relay, and the address they come from has to be accepted by the
            provider.
          </p>
        </div>
      )}
    </Panel>
  );
}

/** The groups of the messages, as the customer reads them. */
const GROUP_KEYS: NotificationGroupKey[] = [
  'accountSecurity',
  'ordersBilling',
  'hostingServices',
  'support',
  'domainsEmail',
  'incidents',
  'productUpdates',
  'marketing',
];

/** True when the key is a group of the preferences of the server. */
function isGroupKey(key: string): key is NotificationGroupKey {
  return (GROUP_KEYS as string[]).includes(key);
}

/** The words of a channel, as the customer reads them. */
const CHANNEL_LABEL: Record<NotificationChannel, string> = {
  email: 'E-mail',
  in_app: 'Notification centre',
};

/**
 * The groups of the messages with their switches.
 *
 * The essential group is written as "always on": there is no switch that
 * would do nothing. The marketing carries the agreement of the customer, so
 * it says in words that it is off until it is turned on.
 */
export function NotificationPreferencesPanel({
  preferences,
  categories,
  pending,
  onToggle,
  onRestoreLegacyBilling,
}: {
  preferences: NotificationPreferences;
  categories: NotificationCategoryView[];
  pending?: boolean;
  onToggle: (group: NotificationGroupKey, channel: NotificationChannel, next: boolean) => void;
  onRestoreLegacyBilling?: () => void;
}) {
  return (
    <div className="grid gap-2">
      {categories.map((category) => (
        <NotificationPreferenceGroup
          key={category.key}
          category={category}
          preferences={preferences}
          pending={Boolean(pending)}
          onToggle={onToggle}
          onRestoreLegacyBilling={onRestoreLegacyBilling}
        />
      ))}
    </div>
  );
}

/** One group of messages and its switches. */
function NotificationPreferenceGroup({
  category,
  preferences,
  pending,
  onToggle,
  onRestoreLegacyBilling,
}: {
  category: NotificationCategoryView;
  preferences: NotificationPreferences;
  pending: boolean;
  onToggle: (group: NotificationGroupKey, channel: NotificationChannel, next: boolean) => void;
  onRestoreLegacyBilling?: () => void;
}) {
  const group = isGroupKey(category.key) ? category.key : null;
  const groupOn = group ? preferences[group] : false;
  const channels = category.channels ?? [];

  return (
    <div className="rounded-2xl bg-s2 p-3.5">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div className="min-w-0">
          <p className="text-[15px] font-semibold text-ink">{category.label}</p>
          <p className="mt-0.5 text-[13px] leading-relaxed text-ink3">{category.description}</p>
        </div>
        {category.essential ? (
          <span className="shrink-0 rounded-full bg-acc-bg px-2.5 py-1 text-[12px] font-bold text-acc">Always on</span>
        ) : null}
      </div>

      {category.essential ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">
          These messages protect the account and the contract of the platform. They are always sent, so there is no switch
          that could turn them off.
        </p>
      ) : group ? (
        <>
          <label className="mt-2 flex items-center gap-3">
            <input
              id={`preference-${group}`}
              name={`preference-${group}`}
              type="checkbox"
              checked={groupOn}
              disabled={pending}
              onChange={(event) => onToggle(group, channels[0] ?? 'email', event.target.checked)}
              aria-label={`${category.label}: receive these messages`}
              className="size-6 shrink-0 accent-acc focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc disabled:cursor-not-allowed"
            />
            <span className="text-[14px] font-medium text-ink">Receive these messages</span>
          </label>
        </>
      ) : null}

      {category.classification === 'marketing' ? (
        <p className="mt-2 text-[12.5px] leading-relaxed text-ink2">
          It is off until you agree to it. Turning it on is your agreement to receive the offers of the platform by
          e-mail, and every one of them carries a way to stop them.
        </p>
      ) : null}

      {category.key === 'ordersBilling' && preferences.billing === false ? (
        <div className="mt-2 rounded-2xl bg-s3 p-3">
          <p className="text-[12.5px] leading-relaxed text-ink2">
            The billing switch of the old platform is off, so the optional billing messages stay off even with the group
            on.
          </p>
          {onRestoreLegacyBilling ? (
            <div className="mt-2">
              <SoftButton onClick={onRestoreLegacyBilling} disabled={pending}>
                Turn the old billing switch back on
              </SoftButton>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
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
          <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
            {request.error ?? cancel.error}
          </p>
        )}
        <div className="mt-3 flex flex-wrap justify-end gap-2">
          <SoftButton onClick={onCancelRequest} disabled={cancel.pending}>
            {cancel.pending ? 'Working…' : 'Take the request back'}
          </SoftButton>
          <SoftButton
            onClick={async () => {
              await logout();
              toast.push('Signed out', 'ok');
            }}
          >
            Sign out
          </SoftButton>
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
        <p role="alert" className="mt-3 rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">
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

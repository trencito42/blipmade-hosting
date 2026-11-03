import { useState, type ReactNode } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useInfiniteList } from '../lib/useInfinite';
import { passkeysSupported } from '../lib/passkeys';
import { ButtonGroup } from './components/premium';
import { ButtonLink, ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';

interface SecurityState {
  twoFactor: { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null; deviceType: string | null; backedUp: boolean }[];
}

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

/** Two-factor authentication with an authenticator app. The setup, the new codes and turning it off are pages of their own. */
export function TwoFactorPanel({ state }: { state: SecurityState['twoFactor']; reload?: () => void }) {
  return (
    <Panel
      title="Two-factor authentication"
      description="Asks for a code from an authenticator app after your password, so a stolen password is not enough."
      action={
        <span className={`rounded-full px-3 py-1 text-[12px] font-bold ${state.enabled ? 'bg-acc-bg text-acc' : 'bg-s3 text-ink2'}`}>
          {state.enabled ? 'On' : 'Off'}
        </span>
      }
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="min-w-0 flex-1 text-[14px] text-ink2">
          {state.enabled
            ? `On since ${day(state.enabledAt)}. ${state.backupCodesLeft} backup code${state.backupCodesLeft === 1 ? '' : 's'} left.`
            : 'Off'}
        </p>
        {state.enabled ? (
          <ButtonGroup label="Two-factor actions">
            <ButtonLink to="/app/settings/security/2fa/backup-codes" variant="soft" title="Make new backup codes. The old ones stop working.">New codes</ButtonLink>
            <ButtonLink to="/app/settings/security/2fa/disable" variant="danger" title="Turn off two-factor authentication. Needs your password and a code.">Turn off</ButtonLink>
          </ButtonGroup>
        ) : (
          <ButtonLink to="/app/settings/security/2fa" variant="primary">Set up</ButtonLink>
        )}
      </div>
    </Panel>
  );
}

/** Passkeys: a fingerprint, a face or a PIN instead of a password, on devices you own. */
export function PasskeysPanel({ passkeys, reload }: { passkeys: SecurityState['passkeys']; reload: () => void }) {
  const { push } = useToast();
  const [removing, setRemoving] = useState<SecurityState['passkeys'][number] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const remove = useAction(async (id: string) => {
    await del(`/settings/passkeys/${encodeURIComponent(id)}`);
    push('The passkey was removed.', 'ok');
    setRemoving(null);
    reload();
  });
  const rename = useAction(async () => {
    if (!renaming) return;
    await patch(`/settings/passkeys/${encodeURIComponent(renaming.id)}`, { name: renaming.name });
    setRenaming(null);
    reload();
  });

  return (
    <Panel
      title="Passkeys"
      description="Sign in with your fingerprint, face or device PIN, without typing a password. A passkey stays on your device."
      action={passkeysSupported() ? <ButtonLink to="/app/settings/security/passkeys/new" variant="soft">Add passkey</ButtonLink> : undefined}
    >
      <div className="grid gap-4">
        {passkeys.length === 0 ? (
          <p className="text-[14px] text-ink2">No passkey yet.</p>
        ) : (
          <ul className="grid">
            {passkeys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                {renaming?.id === key.id ? (
                  <div className="flex min-w-0 flex-1 flex-wrap items-end gap-2">
                    <div className="min-w-[12rem] flex-1">
                      <TextInput label="Name" value={renaming.name} onChange={(event) => setRenaming({ id: key.id, name: event.target.value })} />
                    </div>
                    <PrimaryButton onClick={() => void rename.run()} disabled={rename.pending || !renaming.name.trim()}>Save</PrimaryButton>
                    <SoftButton onClick={() => setRenaming(null)}>Cancel</SoftButton>
                  </div>
                ) : (
                  <>
                    <div className="min-w-0">
                      <p className="truncate text-[14.5px] font-semibold text-ink">{key.name}</p>
                      <p className="text-[12.5px] text-ink3">
                        Added {day(key.createdAt)} · last used {day(key.lastUsedAt)}
                        {key.backedUp ? ' · synced to your account' : key.deviceType === 'singleDevice' ? ' · this device only' : ''}
                      </p>
                    </div>
                    <ButtonGroup label={`Actions for ${key.name}`}>
                      <SoftButton onClick={() => setRenaming({ id: key.id, name: key.name })} title="Change the name of this passkey">Rename</SoftButton>
                      <SoftButton onClick={() => setRemoving(key)} title="Remove this passkey. You can no longer sign in with it.">Remove</SoftButton>
                    </ButtonGroup>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {!passkeysSupported() && (
          <p className="text-[13.5px] text-ink3">This browser does not support passkeys. Try a recent version of Chrome, Edge, Safari or Firefox.</p>
        )}
      </div>
      <ConfirmDialog
        open={removing !== null}
        title={removing ? `Remove “${removing.name}”?` : 'Remove this passkey?'}
        description="You will no longer be able to sign in with it. Your password and your other passkeys keep working."
        confirmLabel="Remove"
        busy={remove.pending}
        onCancel={() => setRemoving(null)}
        onConfirm={() => removing && void remove.run(removing.id)}
      />
    </Panel>
  );
}

interface ActivityRow {
  id: string;
  action: string;
  text: string;
  detail: string | null;
  ip: string | null;
  byStaff: boolean;
  createdAt: string;
}

/** The history of the security of the account: sign-ins with their device, and every change. */
export function SecurityActivityPanel() {
  const list = useInfiniteList<ActivityRow, string>(
    async (cursor, signal) => {
      const page = await get<{ activity: ActivityRow[]; pagination: { hasMore: boolean; nextCursor: string | null } }>(
        '/settings/security/activity',
        { cursor: cursor ?? undefined, limit: 10 },
        signal,
      );
      return { items: page.activity, next: page.pagination.hasMore ? page.pagination.nextCursor : null };
    },
    [],
  );
  return (
    <Panel title="Security activity" description="Sign-ins and changes to the security of your account. You are also told by e-mail when something important happens.">
      {list.loading ? (
        <LoadingBlock rows={3} label="Loading the activity" />
      ) : list.error && list.items.length === 0 ? (
        <ErrorState title="The activity could not be loaded" message={list.error.message} onRetry={list.reload} />
      ) : list.items.length === 0 ? (
        <EmptyState title="Nothing yet." description="Sign-ins and security changes appear here." />
      ) : (
        <ul className="grid">
          {list.items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-x-4 gap-y-0.5 border-t border-line py-3 first:border-t-0 first:pt-0">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">
                  {row.text}
                  {row.byStaff && <span className="ml-2 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">our team</span>}
                </p>
                <p className="text-[12.5px] text-ink3">{[row.detail, row.ip].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="whitespace-nowrap text-[12.5px] text-ink3">{new Date(row.createdAt).toLocaleString()}</span>
            </li>
          ))}
          <li className="border-t border-line">
            {list.hasMore ? (
              // No automatic loading: ten rows are shown and the reader asks for the next ten.
              <div className="grid justify-items-center gap-2 pt-2">
                {list.loadingMore ? <p role="status" className="text-[12.5px] text-ink3">Loading more…</p> : <SoftButton onClick={list.loadMore}>Load more</SoftButton>}
                {list.error && <p role="alert" className="text-[12.5px] text-bad">{list.error.message}</p>}
              </div>
            ) : (
              <p className="pt-2 text-center text-[12.5px] text-ink3">That is everything.</p>
            )}
          </li>
        </ul>
      )}
    </Panel>
  );
}

interface ApiKeyRow { id: string; name: string; prefix: string; scope: string; lastUsedAt: string | null; lastUsedIp: string | null; expiresAt: string | null; createdAt: string; expired: boolean }

/** Keys for scripts: read-only or read and write, one per tool, shown once, revoked at any time. A key is made on its own page. */
export function ApiKeysPanel() {
  const { push } = useToast();
  const state = useAsync<{ keys: ApiKeyRow[] }>((signal) => get<{ keys: ApiKeyRow[] }>('/settings/api-keys', undefined, signal), []);
  const [pendingRevoke, setPendingRevoke] = useState<ApiKeyRow | null>(null);
  const revoke = useAction(async (id: string) => {
    await del(`/settings/api-keys/${encodeURIComponent(id)}`);
    setPendingRevoke(null);
    push('The key was revoked.', 'ok');
    state.reload();
  });
  const keys = state.data?.keys ?? [];
  return (
    <Panel
      title="API keys"
      description="Use the API from your own scripts and tools. A key reads (and optionally writes) the services of your account. It never reaches your settings, your payment method or your invoices."
      action={<ButtonLink to="/app/settings/api-keys/new" variant="soft">New key</ButtonLink>}
    >
      <div className="grid gap-3">
        {state.loading && !state.data ? (
          <LoadingBlock rows={1} label="Loading the keys" />
        ) : state.error ? (
          <ErrorState title="The keys could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : keys.length === 0 ? (
          <p className="text-[14px] text-ink2">No key yet.</p>
        ) : (
          <ul className="grid">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 border-t border-line py-3 first:border-t-0 first:pt-0 last:pb-0">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{key.name} <span className="ml-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase text-ink2">{key.scope === 'write' ? 'read and write' : 'read only'}</span></p>
                  <p className="font-mono text-[12.5px] text-ink3">{key.prefix}… · made {day(key.createdAt)} · {key.lastUsedAt ? `used ${day(key.lastUsedAt)}${key.lastUsedIp ? ` from ${key.lastUsedIp}` : ''}` : 'never used'} · {key.expired ? 'expired' : key.expiresAt ? `expires ${day(key.expiresAt)}` : 'does not expire'}</p>
                </div>
                <SoftButton onClick={() => setPendingRevoke(key)} disabled={revoke.pending} title="Revoke this key. Anything that uses it stops working.">Revoke</SoftButton>
              </li>
            ))}
          </ul>
        )}
        {revoke.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{revoke.error}</p>}
      </div>
      <ConfirmDialog
        open={Boolean(pendingRevoke)}
        title="Revoke this key?"
        description={pendingRevoke ? `${pendingRevoke.name} stops working at once, and every script that uses it fails. This cannot be undone.` : undefined}
        confirmLabel="Revoke key"
        busy={revoke.pending}
        onCancel={() => setPendingRevoke(null)}
        onConfirm={() => { if (pendingRevoke) void revoke.run(pendingRevoke.id); }}
      />
    </Panel>
  );
}

/**
 * The panels of the security tab, in two columns that stack on their own, so a short panel never leaves a hole beside a
 * tall one. `left` and `right` are the panels that come from the page (the password, the sessions).
 */
export function SecurityPanels({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const state = useAsync<SecurityState>((signal) => get<SecurityState>('/settings/security', undefined, signal), []);
  const loading = state.loading && !state.data;
  const failed = !loading && (state.error || !state.data);
  const waiting = loading ? <LoadingBlock rows={2} label="Loading your security settings" /> : null;
  const broken = failed ? <ErrorState title="Your security settings could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} /> : null;
  return (
    <div className="grid gap-4 lg:col-span-2 lg:grid-cols-2 lg:items-start">
      <div className="grid min-w-0 gap-4">
        {left}
        {waiting}
        {broken}
        {state.data && (
          <>
            <TwoFactorPanel state={state.data.twoFactor} reload={state.reload} />
            <PasskeysPanel passkeys={state.data.passkeys} reload={state.reload} />
          </>
        )}
        <ApiKeysPanel />
      </div>
      <div className="grid min-w-0 gap-4">
        {right}
        <SecurityActivityPanel />
      </div>
    </div>
  );
}

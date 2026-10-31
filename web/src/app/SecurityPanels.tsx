import { useState } from 'react';
import { del, get, patch, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { useInfiniteList } from '../lib/useInfinite';
import { passkeyFailure, passkeysSupported, registerPasskey } from '../lib/passkeys';
import { OtpInput } from '../OtpInput';
import { ConfirmDialog, EmptyState, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';

interface SecurityState {
  twoFactor: { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
  passkeys: { id: string; name: string; createdAt: string; lastUsedAt: string | null; deviceType: string | null; backedUp: boolean }[];
}

const day = (value: string | null) => (value ? new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' }) : 'never');

/** Groups of four, so a secret read from the screen is easy to type: ABCD EFGH IJKL. */
const spaced = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

function BackupCodes({ codes, onDone }: { codes: string[]; onDone: () => void }) {
  const { push } = useToast();
  const text = codes.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      push('The backup codes were copied.', 'ok');
    } catch {
      push('Copy failed. Select the codes and copy them by hand.', 'error');
    }
  };
  const download = () => {
    const url = URL.createObjectURL(new Blob([`Blipmade backup codes\n\nEach code works once.\n\n${text}\n`], { type: 'text/plain' }));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'blipmade-backup-codes.txt';
    link.click();
    URL.revokeObjectURL(url);
  };
  return (
    <div className="grid gap-3 rounded-2xl bg-s2 p-4">
      <p className="text-[14.5px] font-medium text-ink">Save your backup codes now</p>
      <p className="text-[13.5px] text-ink2">
        If you lose your phone, each of these codes lets you in once. They are shown only this one time, so keep them somewhere safe.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[15px] text-ink" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="rounded-xl bg-card px-3 py-2 text-center">{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <SoftButton onClick={() => void copy()}>Copy</SoftButton>
        <SoftButton onClick={download}>Download</SoftButton>
        <PrimaryButton onClick={onDone}>I saved them</PrimaryButton>
      </div>
    </div>
  );
}

/** Two-factor authentication with an authenticator app. */
export function TwoFactorPanel({ state, reload }: { state: SecurityState['twoFactor']; reload: () => void }) {
  const { push } = useToast();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  const [mode, setMode] = useState<'idle' | 'disable' | 'renew'>('idle');
  const [password, setPassword] = useState('');
  const [other, setOther] = useState('');

  const start = useAction(async () => {
    const result = await post<{ secret: string; qrSvg: string }>('/settings/2fa/setup');
    setSetup({ secret: result.secret, qrSvg: result.qrSvg });
    setCode('');
  });
  const enable = useAction(async (value: string) => {
    const result = await post<{ backupCodes: string[] }>('/settings/2fa/enable', { code: value });
    setCodes(result.backupCodes);
    setSetup(null);
    reload();
  });
  const disable = useAction(async () => {
    await post('/settings/2fa/disable', { password, code: other });
    push('Two-factor authentication is off.', 'ok');
    setMode('idle');
    setPassword('');
    setOther('');
    reload();
  });
  const renew = useAction(async (value: string) => {
    const result = await post<{ backupCodes: string[] }>('/settings/2fa/backup-codes', { code: value });
    setCodes(result.backupCodes);
    setMode('idle');
    setOther('');
    reload();
  });

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
      <div className="grid gap-4">
        {codes ? (
          <BackupCodes codes={codes} onDone={() => setCodes(null)} />
        ) : setup ? (
          <div className="grid gap-4">
            <ol className="grid list-decimal gap-1 pl-5 text-[14px] text-ink2">
              <li>Open an authenticator app (Google Authenticator, Authy, 1Password, Microsoft Authenticator).</li>
              <li>Scan the code below, or type the key by hand.</li>
              <li>Enter the 6-digit code the app shows.</li>
            </ol>
            <div className="grid items-center gap-4 sm:grid-cols-[auto_minmax(0,1fr)]">
              <img
                alt="QR code for the authenticator app"
                width={176}
                height={176}
                className="rounded-2xl bg-white p-2"
                src={`data:image/svg+xml;utf8,${encodeURIComponent(setup.qrSvg)}`}
              />
              <div className="grid gap-1">
                <p className="text-[12.5px] text-ink3">Key to type by hand</p>
                <p className="break-all font-mono text-[15px] font-semibold text-ink">{spaced(setup.secret)}</p>
              </div>
            </div>
            <div className="grid gap-3">
              <OtpInput value={code} onChange={setCode} onComplete={(value) => void enable.run(value)} disabled={enable.pending} invalid={Boolean(enable.error)} autoFocus />
              {enable.error && <p role="alert" className="text-center text-[13.5px] font-medium text-bad">{enable.error}</p>}
              <div className="flex flex-wrap justify-center gap-2">
                <PrimaryButton onClick={() => void enable.run(code)} disabled={enable.pending || code.length < 6}>{enable.pending ? 'Checking…' : 'Turn on'}</PrimaryButton>
                <SoftButton onClick={() => setSetup(null)} disabled={enable.pending}>Cancel</SoftButton>
              </div>
            </div>
          </div>
        ) : state.enabled ? (
          <div className="grid gap-3">
            <p className="text-[14px] text-ink2">
              On since {day(state.enabledAt)}. {state.backupCodesLeft} backup code{state.backupCodesLeft === 1 ? '' : 's'} left.
            </p>
            {mode === 'idle' && (
              <div className="flex flex-wrap gap-2">
                <SoftButton onClick={() => setMode('renew')}>New backup codes</SoftButton>
                <SoftButton onClick={() => setMode('disable')}>Turn off</SoftButton>
              </div>
            )}
            {mode === 'renew' && (
              <div className="grid gap-3 rounded-2xl bg-s2 p-4">
                <p className="text-[14px] text-ink2">Enter a code from your app. The old backup codes stop working.</p>
                <OtpInput value={other} onChange={setOther} onComplete={(value) => void renew.run(value)} disabled={renew.pending} invalid={Boolean(renew.error)} autoFocus />
                {renew.error && <p role="alert" className="text-center text-[13.5px] font-medium text-bad">{renew.error}</p>}
                <div className="flex justify-center"><SoftButton onClick={() => { setMode('idle'); setOther(''); }}>Cancel</SoftButton></div>
              </div>
            )}
            {mode === 'disable' && (
              <div className="grid gap-3 rounded-2xl bg-s2 p-4">
                <p className="text-[14px] text-ink2">Enter your password and a code from your app (or a backup code) to turn it off.</p>
                <TextInput label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" error={disable.fieldErrors.password} />
                <TextInput label="Code or backup code" value={other} onChange={(event) => setOther(event.target.value)} autoComplete="one-time-code" error={disable.fieldErrors.code} />
                {disable.error && !disable.fieldErrors.password && !disable.fieldErrors.code && <p role="alert" className="text-[13.5px] font-medium text-bad">{disable.error}</p>}
                <div className="flex flex-wrap gap-2">
                  <PrimaryButton onClick={() => void disable.run()} disabled={disable.pending || !password || other.trim().length < 6}>{disable.pending ? 'Working…' : 'Turn off'}</PrimaryButton>
                  <SoftButton onClick={() => { setMode('idle'); setPassword(''); setOther(''); }}>Cancel</SoftButton>
                </div>
              </div>
            )}
          </div>
        ) : (
          <div>
            <PrimaryButton onClick={() => void start.run()} disabled={start.pending}>{start.pending ? 'Preparing…' : 'Set up two-factor'}</PrimaryButton>
            {start.error && <p role="alert" className="mt-2 text-[13.5px] font-medium text-bad">{start.error}</p>}
          </div>
        )}
      </div>
    </Panel>
  );
}

/** Passkeys: a fingerprint, a face or a PIN instead of a password, on devices you own. */
export function PasskeysPanel({ passkeys, reload }: { passkeys: SecurityState['passkeys']; reload: () => void }) {
  const { push } = useToast();
  const [name, setName] = useState('');
  const [adding, setAdding] = useState(false);
  const [removing, setRemoving] = useState<SecurityState['passkeys'][number] | null>(null);
  const [renaming, setRenaming] = useState<{ id: string; name: string } | null>(null);

  const add = async () => {
    setAdding(true);
    try {
      await registerPasskey(name.trim() || undefined);
      push('The passkey was added.', 'ok');
      setName('');
      reload();
    } catch (failure) {
      push(passkeyFailure(failure), 'error');
    } finally {
      setAdding(false);
    }
  };
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
    <Panel title="Passkeys" description="Sign in with your fingerprint, face or device PIN, without typing a password. A passkey stays on your device.">
      <div className="grid gap-4">
        {passkeys.length === 0 ? (
          <p className="text-[14px] text-ink2">No passkey yet.</p>
        ) : (
          <ul className="grid gap-2">
            {passkeys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
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
                    <div className="flex gap-2">
                      <SoftButton onClick={() => setRenaming({ id: key.id, name: key.name })}>Rename</SoftButton>
                      <SoftButton onClick={() => setRemoving(key)}>Remove</SoftButton>
                    </div>
                  </>
                )}
              </li>
            ))}
          </ul>
        )}
        {passkeysSupported() ? (
          <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-end">
            <TextInput label="Name of the new passkey (optional)" value={name} onChange={(event) => setName(event.target.value)} placeholder="My laptop" autoComplete="off" />
            <PrimaryButton onClick={() => void add()} disabled={adding}>{adding ? 'Waiting for the device…' : 'Add a passkey'}</PrimaryButton>
          </div>
        ) : (
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
        <ul className="grid gap-1.5">
          {list.items.map((row) => (
            <li key={row.id} className="flex flex-wrap items-start justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
              <div className="min-w-0">
                <p className="text-[14px] font-medium text-ink">
                  {row.text}
                  {row.byStaff && <span className="ml-2 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase tracking-[0.06em] text-ink2">our team</span>}
                </p>
                <p className="text-[12.5px] text-ink3">{[row.detail, row.ip].filter(Boolean).join(' · ')}</p>
              </div>
              <span className="whitespace-nowrap font-mono text-[12px] text-ink3">{new Date(row.createdAt).toLocaleString()}</span>
            </li>
          ))}
          <li>
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

/** Keys for scripts: read-only or read and write, one per tool, shown once, revoked at any time. */
export function ApiKeysPanel() {
  const { push } = useToast();
  const state = useAsync<{ keys: ApiKeyRow[] }>((signal) => get<{ keys: ApiKeyRow[] }>('/settings/api-keys', undefined, signal), []);
  const [name, setName] = useState('');
  const [scope, setScope] = useState('read');
  const [days, setDays] = useState('90');
  const [made, setMade] = useState<string | null>(null);
  const create = useAction(async () => {
    const result = await post<{ key: string }>('/settings/api-keys', { name, scope, expiresInDays: days === 'never' ? null : Number(days) });
    setMade(result.key);
    setName('');
    state.reload();
  });
  const revoke = useAction(async (id: string) => {
    await del(`/settings/api-keys/${encodeURIComponent(id)}`);
    push('The key was revoked.', 'ok');
    state.reload();
  });
  const keys = state.data?.keys ?? [];
  return (
    <Panel title="API keys" description="Use the API from your own scripts and tools. A key reads (and optionally writes) the services of your account. It never reaches your settings, your payment method or your other keys.">
      <div className="grid gap-4">
        {made && (
          <div className="grid gap-2 rounded-2xl bg-acc-bg p-4">
            <p className="text-[14px] font-medium text-ink">Copy your key now. It is shown only this once.</p>
            <p className="break-all rounded-xl bg-card px-3 py-2 font-mono text-[13px] text-ink">{made}</p>
            <div className="flex flex-wrap gap-2">
              <SoftButton onClick={() => void navigator.clipboard.writeText(made).then(() => push('The key was copied.', 'ok'), () => push('Copy failed. Select the key and copy it by hand.', 'error'))}>Copy</SoftButton>
              <PrimaryButton onClick={() => setMade(null)}>I saved it</PrimaryButton>
            </div>
            <p className="font-mono text-[12px] text-ink3">curl -H "Authorization: Bearer {made.slice(0, 12)}…" https://blipmade.com/api/instances</p>
          </div>
        )}
        {state.loading && !state.data ? (
          <LoadingBlock rows={1} label="Loading the keys" />
        ) : state.error ? (
          <ErrorState title="The keys could not be loaded" message={state.error.message} onRetry={state.reload} />
        ) : keys.length === 0 ? (
          <p className="text-[14px] text-ink2">No key yet.</p>
        ) : (
          <ul className="grid gap-2">
            {keys.map((key) => (
              <li key={key.id} className="flex flex-wrap items-center justify-between gap-2 rounded-2xl bg-s2 px-4 py-3">
                <div className="min-w-0">
                  <p className="text-[14.5px] font-semibold text-ink">{key.name} <span className="ml-1 rounded-full bg-s3 px-2 py-0.5 text-[11px] font-bold uppercase text-ink2">{key.scope === 'write' ? 'read and write' : 'read only'}</span></p>
                  <p className="font-mono text-[12.5px] text-ink3">{key.prefix}… · made {day(key.createdAt)} · {key.lastUsedAt ? `used ${day(key.lastUsedAt)}${key.lastUsedIp ? ` from ${key.lastUsedIp}` : ''}` : 'never used'} · {key.expired ? 'expired' : key.expiresAt ? `expires ${day(key.expiresAt)}` : 'does not expire'}</p>
                </div>
                <SoftButton onClick={() => void revoke.run(key.id)} disabled={revoke.pending}>Revoke</SoftButton>
              </li>
            ))}
          </ul>
        )}
        <div className="grid gap-2 sm:grid-cols-[minmax(0,1fr)_9rem_9rem_auto] sm:items-end">
          <TextInput label="Name" value={name} onChange={(event) => setName(event.target.value)} placeholder="deploy script" autoComplete="off" error={create.fieldErrors.name} />
          <label className="grid gap-1.5 text-[13.5px] font-medium text-ink">Access
            <select value={scope} onChange={(event) => setScope(event.target.value)} className="min-h-11 rounded-xl border border-line bg-s2 px-3 text-[14px] text-ink"><option value="read">Read only</option><option value="write">Read and write</option></select>
          </label>
          <label className="grid gap-1.5 text-[13.5px] font-medium text-ink">Expires
            <select value={days} onChange={(event) => setDays(event.target.value)} className="min-h-11 rounded-xl border border-line bg-s2 px-3 text-[14px] text-ink"><option value="30">30 days</option><option value="90">90 days</option><option value="365">1 year</option><option value="never">Never</option></select>
          </label>
          <PrimaryButton onClick={() => void create.run()} disabled={create.pending || name.trim().length < 2}>{create.pending ? 'Making…' : 'Make a key'}</PrimaryButton>
        </div>
        {create.error && !create.fieldErrors.name && <p role="alert" className="text-[13.5px] font-medium text-bad">{create.error}</p>}
      </div>
    </Panel>
  );
}

/** The panels, with the state they share. */
export function SecurityPanels() {
  const state = useAsync<SecurityState>((signal) => get<SecurityState>('/settings/security', undefined, signal), []);
  if (state.loading && !state.data) return <LoadingBlock rows={2} label="Loading your security settings" />;
  if (state.error || !state.data) return <ErrorState title="Your security settings could not be loaded" message={state.error?.message ?? 'Try again.'} onRetry={state.reload} />;
  return (
    <>
      <TwoFactorPanel state={state.data.twoFactor} reload={state.reload} />
      <PasskeysPanel passkeys={state.data.passkeys} reload={state.reload} />
      <ApiKeysPanel />
      <SecurityActivityPanel />
    </>
  );
}

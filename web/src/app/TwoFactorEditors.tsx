import { useState } from 'react';
import { get, post } from '../lib/api';
import { useAction, useAsync } from '../lib/useAsync';
import { OtpInput } from '../OtpInput';
import { useRouter } from '../router';
import { ErrorState, LoadingBlock, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';
import { PageEditorShell, useUnsavedChangesGuard } from './components/premium';

const BACK_TO = '/app/settings?tab=security';

interface TwoFactorState {
  twoFactor: { enabled: boolean; enabledAt: string | null; backupCodesLeft: number };
}

/** Groups of four, so a secret read from the screen is easy to type: ABCD EFGH IJKL. */
const spaced = (secret: string) => secret.replace(/(.{4})/g, '$1 ').trim();

function useTwoFactor() {
  return useAsync<TwoFactorState>((signal) => get<TwoFactorState>('/settings/security', undefined, signal), []);
}

/** The backup codes, shown once. Leaving the page without them is asked about, because they cannot be read again. */
function BackupCodesView({ codes }: { codes: string[] }) {
  const toast = useToast();
  const text = codes.join('\n');
  const copy = async () => {
    try {
      await navigator.clipboard.writeText(text);
      toast.push('The backup codes were copied.', 'ok');
    } catch {
      toast.push('Copy failed. Select the codes and copy them by hand.', 'error');
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
    <div className="grid gap-4">
      <p className="text-[13.5px] leading-relaxed text-ink2">
        If you lose your phone, each of these codes lets you in once. They are shown only this one time, so keep them somewhere safe.
      </p>
      <ul className="grid grid-cols-2 gap-2 font-mono text-[15px] text-ink" aria-label="Backup codes">
        {codes.map((code) => (
          <li key={code} className="rounded-xl bg-card px-3 py-2 text-center">{code}</li>
        ))}
      </ul>
      <div className="flex flex-wrap gap-2">
        <SoftButton type="button" onClick={() => void copy()}>Copy</SoftButton>
        <SoftButton type="button" onClick={download}>Download</SoftButton>
      </div>
    </div>
  );
}

/** Turning on two-factor authentication: prepare the key, scan it, prove it with a code, keep the backup codes. */
export function SetupTwoFactor() {
  const { navigate } = useRouter();
  const toast = useToast();
  const state = useTwoFactor();
  const [setup, setSetup] = useState<{ secret: string; qrSvg: string } | null>(null);
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  // Half-way through the setup, or with codes that were not saved, leaving loses something that cannot be read again.
  useUnsavedChangesGuard(
    setup !== null || codes !== null,
    codes ? 'You have not saved your backup codes. They cannot be shown again. Leave anyway?' : 'Stop the setup? The key on screen will not work.',
  );

  const start = useAction(async () => {
    const result = await post<{ secret: string; qrSvg: string }>('/settings/2fa/setup');
    setSetup({ secret: result.secret, qrSvg: result.qrSvg });
    setCode('');
    return true;
  });
  const enable = useAction(async (value: string) => {
    const result = await post<{ backupCodes: string[] }>('/settings/2fa/enable', { code: value });
    setCodes(result.backupCodes);
    setSetup(null);
    toast.push('Two-factor authentication is on.', 'ok');
    return true;
  });

  const done = () => navigate(BACK_TO, { replace: true });
  const discard = () => {
    if (codes === null && setup === null) return navigate(BACK_TO);
    if (window.confirm(codes ? 'You have not saved your backup codes. Leave anyway?' : 'Stop the setup?')) navigate(BACK_TO);
  };
  const alreadyOn = state.data?.twoFactor.enabled === true && codes === null;

  return (
    <PageEditorShell
      eyebrow="Security"
      title={codes ? 'Save your backup codes' : 'Set up two-factor authentication'}
      description="A code from an authenticator app is asked after your password, so a stolen password is not enough."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={setup !== null && codes === null}
      actions={
        codes ? (
          <PrimaryButton type="button" onClick={done}>I saved them</PrimaryButton>
        ) : (
          <>
            <SoftButton type="button" onClick={discard} disabled={enable.pending}>Discard</SoftButton>
            {setup ? (
              <PrimaryButton type="button" onClick={() => void enable.run(code)} disabled={enable.pending || code.length < 6}>
                {enable.pending ? 'Checking…' : 'Turn on'}
              </PrimaryButton>
            ) : (
              <PrimaryButton type="button" onClick={() => void start.run()} disabled={start.pending || state.loading || alreadyOn}>
                {start.pending ? 'Preparing…' : 'Start the setup'}
              </PrimaryButton>
            )}
          </>
        )
      }
    >
      {state.loading ? (
        <LoadingBlock rows={3} label="Loading your security settings" />
      ) : state.error ? (
        <ErrorState title="Your security settings could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : codes ? (
        <BackupCodesView codes={codes} />
      ) : alreadyOn ? (
        <ErrorState title="Two-factor authentication is already on" message="Turn it off first if you want to set it up again with a new device. You can also make new backup codes." />
      ) : setup ? (
        <div className="grid gap-5">
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
          </div>
        </div>
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px] leading-relaxed text-ink2">
            The setup makes a key for your account. Nothing is turned on until you prove with a code that your app has it.
          </p>
          {start.error && <p role="alert" className="text-[13.5px] font-medium text-bad">{start.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

/** Turning off two-factor authentication needs the password and a code, so a stolen session cannot do it alone. */
export function DisableTwoFactor() {
  const { navigate } = useRouter();
  const toast = useToast();
  const state = useTwoFactor();
  const [password, setPassword] = useState('');
  const [other, setOther] = useState('');
  const [touched, setTouched] = useState(false);
  const dirty = Boolean(password || other);
  useUnsavedChangesGuard(dirty, 'Discard this confirmation?');
  const off = state.data?.twoFactor.enabled === false;

  const disable = useAction(async () => {
    await post('/settings/2fa/disable', { password, code: other });
    return true;
  });
  const ready = Boolean(password) && other.trim().length >= 6;
  const submit = async () => {
    setTouched(true);
    if (!ready) return;
    const result = await disable.run();
    if (!result) return;
    toast.push('Two-factor authentication is off.', 'ok');
    navigate(BACK_TO, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this confirmation?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Security"
      title="Turn off two-factor authentication"
      description="Your account is protected by the password alone after this."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={disable.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={disable.pending || state.loading || off || !ready}>
            {disable.pending ? 'Working…' : 'Turn off'}
          </PrimaryButton>
        </>
      }
    >
      {state.loading ? (
        <LoadingBlock rows={2} label="Loading your security settings" />
      ) : state.error ? (
        <ErrorState title="Your security settings could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : off ? (
        <ErrorState title="Two-factor authentication is already off" message="There is nothing to turn off." />
      ) : (
        <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
          <div role="alert" className="rounded-2xl border border-bad/25 bg-bad/10 p-4">
            <h2 className="text-[14px] font-semibold text-bad">A stolen password becomes enough to sign in</h2>
            <p className="mt-1 text-[13px] leading-relaxed text-ink2">Enter your password and a code from your app, or a backup code, to confirm it is you.</p>
          </div>
          <TextInput label="Password" type="password" value={password} onChange={(event) => setPassword(event.target.value)} autoComplete="current-password" error={disable.fieldErrors.password ?? (touched && !password ? 'Enter your password.' : undefined)} />
          <TextInput label="Code or backup code" value={other} onChange={(event) => setOther(event.target.value)} autoComplete="one-time-code" error={disable.fieldErrors.code ?? (touched && other.trim().length < 6 ? 'Enter the 6-digit code or a backup code.' : undefined)} />
          {disable.error && !disable.fieldErrors.password && !disable.fieldErrors.code && (
            <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{disable.error}</p>
          )}
        </form>
      )}
    </PageEditorShell>
  );
}

/** New backup codes replace the old ones. They are shown once. */
export function RenewBackupCodes() {
  const { navigate } = useRouter();
  const state = useTwoFactor();
  const [code, setCode] = useState('');
  const [codes, setCodes] = useState<string[] | null>(null);
  useUnsavedChangesGuard(codes !== null || code !== '', codes ? 'You have not saved your backup codes. They cannot be shown again. Leave anyway?' : 'Discard this code?');
  const off = state.data?.twoFactor.enabled === false;

  const renew = useAction(async (value: string) => {
    const result = await post<{ backupCodes: string[] }>('/settings/2fa/backup-codes', { code: value });
    setCodes(result.backupCodes);
    return true;
  });
  const discard = () => {
    if ((codes === null && code === '') || window.confirm(codes ? 'You have not saved your backup codes. Leave anyway?' : 'Discard this code?')) navigate(BACK_TO);
  };

  return (
    <PageEditorShell
      eyebrow="Security"
      title={codes ? 'Save your new backup codes' : 'New backup codes'}
      description="The old backup codes stop working as soon as the new ones are made."
      backTo={BACK_TO}
      backLabel="Back to security"
      dirty={codes === null && code !== ''}
      actions={
        codes ? (
          <PrimaryButton type="button" onClick={() => navigate(BACK_TO, { replace: true })}>I saved them</PrimaryButton>
        ) : (
          <>
            <SoftButton type="button" onClick={discard} disabled={renew.pending}>Discard</SoftButton>
            <PrimaryButton type="button" onClick={() => void renew.run(code)} disabled={renew.pending || state.loading || off || code.length < 6}>
              {renew.pending ? 'Making…' : 'Make new codes'}
            </PrimaryButton>
          </>
        )
      }
    >
      {state.loading ? (
        <LoadingBlock rows={2} label="Loading your security settings" />
      ) : state.error ? (
        <ErrorState title="Your security settings could not be loaded" message={state.error.message} onRetry={state.reload} />
      ) : codes ? (
        <BackupCodesView codes={codes} />
      ) : off ? (
        <ErrorState title="Two-factor authentication is off" message="Turn it on first. Backup codes belong to it." />
      ) : (
        <div className="grid gap-3">
          <p className="text-[14px] text-ink2">Enter a code from your authenticator app.</p>
          <OtpInput value={code} onChange={setCode} onComplete={(value) => void renew.run(value)} disabled={renew.pending} invalid={Boolean(renew.error)} autoFocus />
          {renew.error && <p role="alert" className="text-center text-[13.5px] font-medium text-bad">{renew.error}</p>}
        </div>
      )}
    </PageEditorShell>
  );
}

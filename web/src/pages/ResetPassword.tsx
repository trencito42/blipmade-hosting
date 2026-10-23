import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { useState, type FormEvent } from 'react';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link, useRouter } from '../router';
import { ApiError, post } from '../lib/api';
import { AuthField } from './auth-field';

/** The rules the API enforces, checked here so the user is told before submitting. */
const passwordIssues = (value: string): string[] => {
  const issues: string[] = [];
  if (value.length < 10) issues.push('10 characters or more');
  if (!/[a-z]/.test(value)) issues.push('a lowercase letter');
  if (!/[A-Z]/.test(value)) issues.push('an uppercase letter');
  if (!/[0-9]/.test(value)) issues.push('a number');
  return issues;
};

/** Strength is described in words, never as a bar. */
const passwordHelper = (value: string) => {
  if (!value) return 'At least 10 characters, with an uppercase letter, a lowercase letter and a number.';
  const issues = passwordIssues(value);
  if (issues.length === 0) {
    return 'Strong password: at least 10 characters, with an uppercase letter, a lowercase letter and a number.';
  }
  return `Still needed: ${issues.join(', ')}.`;
};

function PromisePanel() {
  const catalog = useCatalogSummary();
  return (
    <aside aria-hidden="true" className="hidden flex-col justify-between gap-8 rounded-[32px] bg-acc p-12 text-on-acc lg:flex">
      <span className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] opacity-70">Blipmade</span>
      <div>
        <h2 className="text-[clamp(52px,6vw,96px)] font-extrabold leading-[0.88] tracking-[-0.07em]">Pick an app.<br />Deploy it.</h2>
        <p className="mt-6 max-w-[26em] text-[19px] opacity-75">One account for your apps, databases, domains and billing. No VPS to set up.</p>
      </div>
      <ul className="flex flex-wrap gap-2">
        {[
          `Apps from ${formatPrice(catalog.minAppPrice, catalog.currency)}/mo`,
          `Databases from ${formatPrice(catalog.minDatabasePrice, catalog.currency)}/mo`,
          'Start small, scale freely',
        ].map((t) => <li key={t} className="rounded-full bg-on-acc/10 px-4 py-2 text-[14.5px] font-bold">{t}</li>)}
      </ul>
    </aside>
  );
}

export default function ResetPassword() {
  const { query } = useRouter();
  const token = query.token ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const checkPw = (value: string) =>
    passwordIssues(value).length === 0
      ? null
      : 'Choose a password with at least 10 characters, an uppercase letter, a lowercase letter and a number.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const vp = checkPw(pw);
    const vc = confirm.length === 0 ? 'Type the password again.' : pw !== confirm ? 'The two passwords do not match.' : null;
    setPwErr(vp);
    setConfirmErr(vc);
    if (vp || vc) return;

    setPending(true);
    setMsg(null);
    try {
      await post('/auth/reset-password', { token, password: pw });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else if (err.status === 400 || err.status === 404) {
          // The link was already used, expired or was never valid.
          setLinkInvalid(true);
        } else if (err.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not change the password. Try again in a moment.');
        }
      } else {
        setMsg('We could not change the password. Try again in a moment.');
      }
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <div className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
        <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
            <Eyebrow>All set</Eyebrow>
            <Headline as="h1" lines={['Password', 'updated.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
            <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14.5px] font-bold text-acc">
              Your password has been changed. Use it the next time you log in.
            </div>
            <Button to="/login" full size="lg">Go to log in</Button>
          </div>
          <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
        </main>
        <PromisePanel />
      </div>
    );
  }

  if (!token || linkInvalid) {
    return (
      <div className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
        <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
            <Eyebrow>Account help</Eyebrow>
            <Headline as="h1" lines={['Link', 'not valid.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
            <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">
              This reset link is invalid or has expired. Request a new one and try again.
            </div>
            <p className="text-[15px] text-ink2">Reset links can only be used once and stop working after a while. A new one takes a moment to arrive.</p>
            <Button to="/forgot-password" full size="lg">Request a new link</Button>
            <p className="text-center text-[14.5px] text-ink2">Remembered it? <Link to="/login" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Back to log in</Link></p>
          </div>
          <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
        </main>
        <PromisePanel />
      </div>
    );
  }

  return (
    <div className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Account help</Eyebrow>
          <Headline as="h1" lines={['Choose a', 'new password.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Pick a password you do not use anywhere else.</p>
          {msg && <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">{msg}</div>}
          <form onSubmit={submit} noValidate aria-busy={pending} className="grid gap-4">
            <AuthField
              id="password"
              label="New password"
              type="password"
              autoComplete="new-password"
              value={pw}
              error={pwErr}
              hint={passwordHelper(pw)}
              onChange={(v) => {
                setPw(v);
                if (pwErr) setPwErr(checkPw(v));
              }}
              onBlur={() => {
                if (pw) setPwErr(checkPw(pw));
              }}
            />
            <AuthField
              id="confirm"
              label="Repeat new password"
              type="password"
              autoComplete="new-password"
              value={confirm}
              error={confirmErr}
              onChange={(v) => {
                setConfirm(v);
                if (confirmErr) setConfirmErr(null);
              }}
              onBlur={() => {
                if (confirm) setConfirmErr(pw !== confirm ? 'The two passwords do not match.' : null);
              }}
            />
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Saving…' : 'Save new password'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">Changed your mind? <Link to="/login" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Back to log in</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
      <PromisePanel />
    </div>
  );
}

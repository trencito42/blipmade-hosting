import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { useState, type FormEvent } from 'react';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link } from '../router';
import { useSession } from '../session';
import { ApiError, post } from '../lib/api';
import { AuthField } from './auth-field';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

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

export default function Register() {
  const { register } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMsg, setResendMsg] = useState<string | null>(null);

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');
  const checkPw = (value: string) =>
    passwordIssues(value).length === 0
      ? null
      : 'Choose a password with at least 10 characters, an uppercase letter, a lowercase letter and a number.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const ve = checkEmail(email);
    const vp = checkPw(pw);
    setEmailErr(ve);
    setPwErr(vp);
    setNameErr(null);
    if (ve || vp) return;

    setPending(true);
    setMsg(null);
    try {
      await register(email.trim(), pw, name.trim() || undefined);
      setAccountEmail(email.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (err.fields?.email) {
          setEmailErr(err.fields.email);
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else if (err.fields?.name) {
          setNameErr(err.fields.name);
        } else if (err.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not create the account. Check the details and try again.');
        }
      } else {
        setMsg('We could not create the account. Check the details and try again.');
      }
    } finally {
      setPending(false);
    }
  };

  const resendEmail = async () => {
    if (!accountEmail) {
      setResend('failed');
      setResendMsg('We need the address of the account to send another email.');
      return;
    }
    setResend('sending');
    setResendMsg(null);
    try {
      // The API wants the address in the body and answers 204 without a body.
      await post<void>('/auth/resend-verification', { email: accountEmail });
      setResend('sent');
    } catch (err) {
      setResend('failed');
      setResendMsg(
        err instanceof ApiError && (err.status === 429 || err.code === 'rate_limited')
          ? 'Too many emails asked for. Try again in 15 minutes.'
          : 'We could not send another email. Try again in a moment.',
      );
    }
  };

  if (accountEmail) {
    return (
      <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
        <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
            <Eyebrow>Almost done</Eyebrow>
            <Headline as="h1" lines={['Check', 'your email.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
            <p className="text-[17px] text-ink2">Your account is ready. Confirm your address to finish setting it up.</p>
            <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14.5px] font-bold text-acc">
              We sent a confirmation link to {accountEmail}. Open it to confirm your address.
            </div>
            <Button to="/app" full size="lg">Go to your dashboard</Button>
            <div className="grid gap-2">
              <Button variant="soft" full type="button" onClick={resendEmail} disabled={resend === 'sending'}>
                {resend === 'sending' ? 'Sending…' : 'Resend the email'}
              </Button>
              {resend === 'sent' && (
                <p role="status" className="px-1 text-[13.5px] text-ink2">We sent a new confirmation link to {accountEmail}.</p>
              )}
              {resend === 'failed' && (
                <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">{resendMsg ?? 'We could not send another email. Try again in a moment.'}</p>
              )}
            </div>
            <p className="text-[14px] text-ink3">Some features, such as billing and domain changes, need a verified email address. You can confirm it later.</p>
            <p className="text-center text-[14.5px] text-ink2">Already confirmed? <Link to="/login" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Log in</Link></p>
          </div>
          <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
        </main>
        <PromisePanel />
      </div>
    );
  }

  return (
    <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Get started</Eyebrow>
          <Headline as="h1" lines={['Create', 'your account.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">One account for your apps, databases, domains and billing.</p>
          {msg && <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">{msg}</div>}
          <form onSubmit={submit} noValidate aria-busy={pending} className="grid gap-4">
            <AuthField
              id="name"
              label={<>Name <span className="font-medium text-ink3">(optional)</span></>}
              autoComplete="name"
              value={name}
              error={nameErr}
              onChange={(v) => {
                setName(v);
                if (nameErr) setNameErr(null);
              }}
            />
            <AuthField
              id="email"
              label="Email address"
              type="email"
              autoComplete="email"
              inputMode="email"
              value={email}
              error={emailErr}
              onChange={(v) => {
                setEmail(v);
                if (emailErr) setEmailErr(checkEmail(v));
              }}
              onBlur={() => {
                // An empty field is not an error before the form was sent.
                if (email) setEmailErr(checkEmail(email));
                else setEmailErr(null);
              }}
            />
            <AuthField
              id="password"
              label="Password"
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
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Working…' : 'Create account'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">Already have an account? <Link to="/login" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Log in</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
      <PromisePanel />
    </div>
  );
}

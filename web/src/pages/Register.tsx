import { useState, type FormEvent } from 'react';
import { Icon } from '../icons';
import { cn } from '../lib';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link } from '../router';
import { useSession } from '../session';
import { ApiError, post } from '../lib/api';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const field = (err: boolean) =>
  cn(
    'flex h-14 items-center rounded-full bg-s1 pl-5 pr-2 transition-colors duration-[180ms]',
    err ? 'bg-bad/10 ring-2 ring-bad' : 'focus-within:bg-s2 focus-within:ring-2 focus-within:ring-acc',
  );

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
  return (
    <aside aria-hidden="true" className="hidden flex-col justify-between gap-8 rounded-[32px] bg-acc p-12 text-on-acc lg:flex">
      <span className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] opacity-70">Blipmade</span>
      <div>
        <h2 className="text-[clamp(52px,6vw,96px)] font-extrabold leading-[0.88] tracking-[-0.07em]">Pick an app.<br />Deploy it.</h2>
        <p className="mt-6 max-w-[26em] text-[19px] opacity-75">One account for your apps, databases, domains and billing. No VPS to set up.</p>
      </div>
      <ul className="flex flex-wrap gap-2">{['Apps from €1.49/mo', 'Databases from €4.49/mo', 'Start small, scale freely'].map((t) => <li key={t} className="rounded-full bg-on-acc/10 px-4 py-2 text-[14.5px] font-bold">{t}</li>)}</ul>
    </aside>
  );
}

export default function Register() {
  const { register } = useSession();
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [accountEmail, setAccountEmail] = useState('');
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');
  const checkPw = (value: string) =>
    passwordIssues(value).length === 0
      ? null
      : 'Choose a password with at least 10 characters, an uppercase letter, a lowercase letter and a number.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
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
    setResend('sending');
    try {
      await post('/auth/resend-verification');
      setResend('sent');
    } catch {
      setResend('failed');
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
                <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">We could not send another email. Try again in a moment.</p>
              )}
            </div>
            <p className="text-[14px] text-ink3">Some features, such as billing and domain changes, need a verified email address. You can confirm it later.</p>
            <p className="text-center text-[14.5px] text-ink2">Already confirmed? <Link to="/login" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Log in</Link></p>
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
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="name" className="px-1 text-[14px] font-bold">Name <span className="font-medium text-ink3">(optional)</span></label>
              <div className={field(!!nameErr)}>
                <input id="name" name="name" type="text" autoComplete="name" value={name} aria-invalid={nameErr ? true : undefined} aria-describedby={nameErr ? 'name-error' : undefined} onChange={(e) => { const v = e.target.value; setName(v); if (nameErr) setNameErr(null); }} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
              </div>
              {nameErr && <p id="name-error" className="px-1 text-[12.5px] font-medium text-bad">{nameErr}</p>}
            </div>
            <div className="grid gap-2">
              <label htmlFor="email" className="px-1 text-[14px] font-bold">Email address</label>
              <div className={field(!!emailErr)}>
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoFocus value={email} aria-invalid={emailErr ? true : undefined} aria-describedby={emailErr ? 'email-error' : undefined} onChange={(e) => { const v = e.target.value; setEmail(v); if (emailErr) setEmailErr(checkEmail(v)); }} onBlur={() => setEmailErr(checkEmail(email))} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
              </div>
              {emailErr && <p id="email-error" className="px-1 text-[12.5px] font-medium text-bad">{emailErr}</p>}
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="px-1 text-[14px] font-bold">Password</label>
              <div className={field(!!pwErr)}>
                <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="new-password" value={pw} aria-invalid={pwErr ? true : undefined} aria-describedby={pwErr ? 'password-error' : 'password-hint'} onChange={(e) => { const v = e.target.value; setPw(v); if (pwErr) setPwErr(checkPw(v)); }} onBlur={() => { if (pw) setPwErr(checkPw(pw)); }} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="grid size-11 place-items-center rounded-full text-ink3 hover:bg-s3 hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"><Icon name={show ? 'eyeOff' : 'eye'} /></button>
              </div>
              {pwErr ? (
                <p id="password-error" className="px-1 text-[12.5px] font-medium text-bad">{pwErr}</p>
              ) : (
                <p id="password-hint" className="px-1 text-[12.5px] text-ink3">{passwordHelper(pw)}</p>
              )}
            </div>
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Working…' : 'Create account'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">Already have an account? <Link to="/login" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Log in</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
      <PromisePanel />
    </div>
  );
}

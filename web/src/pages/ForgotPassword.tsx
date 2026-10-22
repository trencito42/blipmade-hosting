import { useState, type FormEvent } from 'react';
import { cn } from '../lib';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link } from '../router';
import { ApiError, post } from '../lib/api';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const field = (err: boolean) =>
  cn(
    'flex h-14 items-center rounded-full bg-s1 pl-5 pr-2 transition-colors duration-[180ms]',
    err ? 'bg-bad/10 ring-2 ring-bad' : 'focus-within:bg-s2 focus-within:ring-2 focus-within:ring-acc',
  );

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

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ve = checkEmail(email);
    setEmailErr(ve);
    if (ve) return;

    setPending(true);
    setMsg(null);
    try {
      // The API always answers 204, so the same confirmation is shown either way.
      await post('/auth/forgot-password', { email: email.trim() });
      setSent(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (err.fields?.email) {
          setEmailErr(err.fields.email);
        } else if (err.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not send the reset link. Try again in a moment.');
        }
      } else {
        setMsg('We could not send the reset link. Try again in a moment.');
      }
    } finally {
      setPending(false);
    }
  };

  if (sent) {
    return (
      <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
        <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
            <Eyebrow>Check your inbox</Eyebrow>
            <Headline as="h1" lines={['Reset', 'your password.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
            <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14.5px] font-bold text-acc">
              If that address has an account, we sent a reset link.
            </div>
            <p className="text-[15px] text-ink2">Open the link in the email to choose a new password. It can take a minute to arrive, so check your spam folder too.</p>
            <Button to="/login" full size="lg">Back to log in</Button>
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
          <Eyebrow>Account help</Eyebrow>
          <Headline as="h1" lines={['Reset', 'your password.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Enter your email address and we will send you a reset link.</p>
          {msg && <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">{msg}</div>}
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email" className="px-1 text-[14px] font-bold">Email address</label>
              <div className={field(!!emailErr)}>
                <input id="email" name="email" type="email" autoComplete="email" inputMode="email" autoFocus value={email} aria-invalid={emailErr ? true : undefined} aria-describedby={emailErr ? 'email-error' : undefined} onChange={(e) => { const v = e.target.value; setEmail(v); if (emailErr) setEmailErr(checkEmail(v)); }} onBlur={() => setEmailErr(checkEmail(email))} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
              </div>
              {emailErr && <p id="email-error" className="px-1 text-[12.5px] font-medium text-bad">{emailErr}</p>}
            </div>
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">Remembered it? <Link to="/login" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Back to log in</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
      <PromisePanel />
    </div>
  );
}

import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { useState, type FormEvent } from 'react';
import { Icon } from '../icons';
import { cn } from '../lib';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link, safeNext, useRouter } from '../router';
import { useSession } from '../session';
import { ApiError } from '../lib/api';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

const field = (err: boolean) =>
  cn(
    'flex h-14 items-center rounded-full bg-s1 pl-5 pr-2 transition-colors duration-[180ms]',
    err ? 'bg-bad/10 ring-2 ring-bad' : 'focus-within:bg-s2 focus-within:ring-2 focus-within:ring-acc',
  );

export default function Login() {
  const catalog = useCatalogSummary();
  const { query, navigate } = useRouter();
  const { login } = useSession();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');
  const checkPw = (value: string) => (value.length > 0 ? null : 'Enter your password.');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    const ve = checkEmail(email);
    const vp = checkPw(pw);
    setEmailErr(ve);
    setPwErr(vp);
    if (ve || vp) return;

    setPending(true);
    setMsg(null);
    try {
      await login(email.trim(), pw);
      navigate(safeNext(query.next) ?? '/app');
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg({ kind: 'err', text: 'Too many attempts. Try again in 5 minutes.' });
        } else if (err.fields?.email) {
          setEmailErr(err.fields.email);
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else if (err.status === 401) {
          // Never say whether the address exists.
          setMsg({ kind: 'err', text: 'Email or password is incorrect.' });
        } else if (err.status === 0) {
          setMsg({ kind: 'err', text: 'Cannot reach the Blipmade API. Check your connection and try again.' });
        } else {
          setMsg({ kind: 'err', text: err.message });
        }
      } else {
        setMsg({ kind: 'err', text: 'Something went wrong. Try again.' });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Secure access</Eyebrow>
          <Headline as="h1" lines={['Welcome', 'back.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Log in to your Blipmade account.</p>
          {msg && <div role="alert" className={cn('rounded-2xl px-4 py-3 text-[14.5px] font-bold', msg.kind === 'err' ? 'bg-bad/10 text-bad' : 'bg-acc-bg text-acc')}>{msg.text}</div>}
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email" className="px-1 text-[14px] font-bold">Email address</label>
              <div className={field(!!emailErr)}>
                <input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoFocus value={email} aria-invalid={emailErr ? true : undefined} aria-describedby={emailErr ? 'email-error' : undefined} onChange={(e) => { const v = e.target.value; setEmail(v); if (emailErr) setEmailErr(checkEmail(v)); }} onBlur={() => setEmailErr(checkEmail(email))} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
              </div>
              {emailErr && <p id="email-error" className="px-1 text-[12.5px] font-medium text-bad">{emailErr}</p>}
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="px-1 text-[14px] font-bold">Password</label>
              <div className={field(!!pwErr)}>
                <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} aria-invalid={pwErr ? true : undefined} aria-describedby={pwErr ? 'password-error' : undefined} onChange={(e) => { const v = e.target.value; setPw(v); if (pwErr) setPwErr(checkPw(v)); }} onBlur={() => setPwErr(checkPw(pw))} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} aria-pressed={show} className="grid size-11 place-items-center rounded-full text-ink3 hover:bg-s3 hover:text-ink focus-visible:ring-2 focus-visible:ring-acc"><Icon name={show ? 'eyeOff' : 'eye'} /></button>
              </div>
              {pwErr && <p id="password-error" className="px-1 text-[12.5px] font-medium text-bad">{pwErr}</p>}
            </div>
            <div className="flex justify-end px-1 text-[14px]"><Link to="/forgot-password" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Forgot password?</Link></div>
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Working…' : 'Log in'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">New to Blipmade? <Link to="/register" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Create account</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
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
    </div>
  );
}

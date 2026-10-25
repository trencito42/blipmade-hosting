import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { useState, type FormEvent } from 'react';
import { cn } from '../lib';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link, useRouter } from '../router';
import { postLoginTarget } from '../auth-guard';
import { useSession } from '../session';
import { ApiError } from '../lib/api';
import { loginFailureMessage } from '../lib/login-message';
import { AuthField } from './auth-field';
import { LegalFooter } from '../legal/LegalFooter';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
  const catalog = useCatalogSummary();
  const { query, navigate } = useRouter();
  const { login, suspensionNotice } = useSession();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(null);
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [pending, setPending] = useState(false);

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');
  const checkPw = (value: string) => (value.length > 0 ? null : 'Enter your password.');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const ve = checkEmail(email);
    const vp = checkPw(pw);
    setEmailErr(ve);
    setPwErr(vp);
    if (ve || vp) return;

    setPending(true);
    setMsg(null);
    try {
      const session = await login(email.trim(), pw);
      // The page the visitor asked for is only used when their role is allowed
      // to open it. Otherwise they land on the home of their role.
      navigate(postLoginTarget(session.role, query.next), { replace: true });
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.fields?.email) {
          setEmailErr(err.fields.email);
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else {
          // The message is chosen in one place, so the answer of a suspended
          // account and the answer of a wrong password never drift apart.
          setMsg({ kind: 'err', text: loginFailureMessage(err) });
        }
      } else {
        setMsg({ kind: 'err', text: 'Something went wrong. Try again.' });
      }
    } finally {
      setPending(false);
    }
  };

  return (
    <div className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Secure access</Eyebrow>
          <Headline as="h1" lines={['Welcome', 'back.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Log in to your Blipmade account.</p>
          {(msg || suspensionNotice) && (
        <div
          role="alert"
          className={cn(
            'rounded-2xl px-4 py-3 text-[14.5px] font-bold',
            msg?.kind === 'info' ? 'bg-acc-bg text-acc' : 'bg-bad/10 text-bad',
          )}
        >
          {msg?.text ?? suspensionNotice}
        </div>
      )}
          <form onSubmit={submit} noValidate aria-busy={pending} className="grid gap-4">
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
              autoComplete="current-password"
              value={pw}
              error={pwErr}
              onChange={(v) => {
                setPw(v);
                if (pwErr) setPwErr(checkPw(v));
              }}
              onBlur={() => {
                // An empty field is not an error before the form was sent.
                if (pw) setPwErr(checkPw(pw));
                else setPwErr(null);
              }}
            />
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Working…' : 'Log in'}</Button>
            <div className="flex justify-end px-1 text-[14px]">
              <Link to="/forgot-password" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Forgot password?</Link>
            </div>
          </form>
          <p className="text-center text-[14.5px] text-ink2">New to Blipmade? <Link to="/register" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Create account</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
        <LegalFooter className="mt-6" />
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

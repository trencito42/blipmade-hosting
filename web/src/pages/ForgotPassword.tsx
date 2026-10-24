import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { useState, type FormEvent } from 'react';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link } from '../router';
import { ApiError, post } from '../lib/api';
import { AuthField } from './auth-field';
import { LegalFooter } from '../legal/LegalFooter';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

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

export default function ForgotPassword() {
  const [email, setEmail] = useState('');
  const [emailErr, setEmailErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [sent, setSent] = useState(false);
  const [notice, setNotice] = useState<string | null>(null);

  const checkEmail = (value: string) => (EMAIL_RE.test(value.trim()) ? null : 'Enter a valid email address.');

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const ve = checkEmail(email);
    setEmailErr(ve);
    if (ve) return;

    setPending(true);
    setMsg(null);
    try {
      // The API answers with the same words for an address that has an account
      // and for one that has not, and it says whether the message could really
      // be sent. The page shows that answer and never claims that a link is on
      // its way while the relay is not configured.
      const answer = await post<{ message?: string; mail?: { configured?: boolean } }>('/auth/forgot-password', {
        email: email.trim(),
      });
      setNotice(answer?.message ?? null);
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
      <div className="grid min-h-[100svh] gap-3 p-3 pb-[max(0.75rem,env(safe-area-inset-bottom))] lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
        <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
          <Logo />
          <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
            <Eyebrow>Check your inbox</Eyebrow>
            <Headline as="h1" lines={['Reset', 'your password.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
            <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14.5px] font-bold text-acc">
              {notice ?? 'If that address has an account, a reset link is on its way.'}
            </div>
            <p className="text-[15px] text-ink2">Open the link in the email to choose a new password. It can take a minute to arrive, so check your spam folder too.</p>
            <Button to="/login" full size="lg">Back to log in</Button>
          </div>
          <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
          <LegalFooter className="mt-6" />
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
          <Headline as="h1" lines={['Reset', 'your password.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Enter your email address and we will send you a reset link.</p>
          {msg && <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">{msg}</div>}
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
            <Button type="submit" full size="lg" disabled={pending}>{pending ? 'Sending…' : 'Send reset link'}</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">Remembered it? <Link to="/login" className="inline-flex min-h-11 items-center font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc">Back to log in</Link></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
        <LegalFooter className="mt-6" />
      </main>
      <PromisePanel />
    </div>
  );
}

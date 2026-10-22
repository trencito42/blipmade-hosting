import { useEffect, useRef, useState } from 'react';
import { Button, Eyebrow, Headline, Logo } from '../ui';
import { Link, useRouter } from '../router';
import { ApiError, post } from '../lib/api';
import { LoadingBlock } from '../ui-app';

type State = 'checking' | 'verified' | 'failed';
type FailReason = 'invalid' | 'network' | 'unknown';

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

export default function VerifyEmail() {
  const { query } = useRouter();
  const token = query.token ?? '';
  const [state, setState] = useState<State>(token ? 'checking' : 'failed');
  const [reason, setReason] = useState<FailReason>(token ? 'unknown' : 'invalid');
  const [attempt, setAttempt] = useState(0);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  // The confirmation link can only be used once, so the request is sent once
  // per token even when React runs the effect twice.
  const started = useRef<{ token: string; attempt: number } | null>(null);

  useEffect(() => {
    if (!token) {
      setState('failed');
      setReason('invalid');
      return;
    }
    if (started.current?.token === token && started.current.attempt === attempt) return;
    started.current = { token, attempt };
    setState('checking');
    post('/auth/verify-email', { token })
      .then(() => {
        setState('verified');
        setReason('unknown');
      })
      .catch((err: unknown) => {
        setState('failed');
        if (err instanceof ApiError && (err.status === 400 || err.status === 404)) setReason('invalid');
        else if (err instanceof ApiError && err.status === 0) setReason('network');
        else setReason('unknown');
      });
  }, [token, attempt]);

  const retry = () => {
    started.current = null;
    setAttempt((n) => n + 1);
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

  return (
    <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <main className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Account setup</Eyebrow>
          <Headline as="h1" lines={['Confirm', 'your email.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />

          {state === 'checking' && (
            <div className="grid gap-3">
              <p className="text-[17px] text-ink2">We are confirming your email address.</p>
              <LoadingBlock rows={2} label="Verifying your email" />
            </div>
          )}

          {state === 'verified' && (
            <>
              <div role="status" className="rounded-2xl bg-acc-bg px-4 py-3 text-[14.5px] font-bold text-acc">
                Email verified. Your address is confirmed.
              </div>
              <p className="text-[15px] text-ink2">Every feature is open to you now, including billing and domain changes.</p>
              <Button to="/app" full size="lg">Go to your dashboard</Button>
            </>
          )}

          {state === 'failed' && (
            <>
              <div role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[14.5px] font-bold text-bad">
                {reason === 'invalid'
                  ? 'This confirmation link is invalid or has expired.'
                  : reason === 'network'
                    ? 'We could not reach the Blipmade API. Check your connection and try again.'
                    : 'We could not confirm that link.'}
              </div>
              <p className="text-[15px] text-ink2">Confirmation links can only be used once and stop working after a while. Send yourself a new one and try again.</p>
              {reason === 'network' && (
                <Button variant="soft" full type="button" onClick={retry}>Try again</Button>
              )}
              <Button variant="soft" full type="button" onClick={resendEmail} disabled={resend === 'sending'}>
                {resend === 'sending' ? 'Sending…' : 'Resend the email'}
              </Button>
              {resend === 'sent' && (
                <p role="status" className="px-1 text-[13.5px] text-ink2">If that address has an account, we sent a new confirmation link.</p>
              )}
              {resend === 'failed' && (
                <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">We could not send another email. Try again in a moment.</p>
              )}
              <p className="text-center text-[14.5px] text-ink2">Already confirmed? <Link to="/app" className="font-bold text-acc hover:underline focus-visible:rounded-full focus-visible:ring-2 focus-visible:ring-acc">Go to your dashboard</Link></p>
            </>
          )}
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </main>
      <PromisePanel />
    </div>
  );
}

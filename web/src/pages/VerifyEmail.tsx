import { useEffect, useRef, useState } from 'react';
import { Arrow, Button } from '../ui';
import { Link, useRouter } from '../router';
import { ApiError, post } from '../lib/api';
import { useSession } from '../session';
import { LoadingBlock } from '../ui-app';
import { AuthAlert, AuthBlock, AuthHead, AuthNote, AuthShell } from './auth-shell';

type State = 'checking' | 'verified' | 'failed';
type FailReason = 'invalid' | 'network' | 'unknown';

export default function VerifyEmail() {
  const { query } = useRouter();
  const token = query.token ?? '';
  // The address of the account is only in the session. Without it there is
  // nothing to send the new link to, and the control is hidden.
  const { user, loading: sessionLoading } = useSession();
  const accountEmail = user?.email ?? '';
  const [state, setState] = useState<State>(token ? 'checking' : 'failed');
  const [reason, setReason] = useState<FailReason>(token ? 'unknown' : 'invalid');
  const [attempt, setAttempt] = useState(0);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMsg, setResendMsg] = useState<string | null>(null);
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
    if (!accountEmail) {
      setResend('failed');
      setResendMsg('We do not know the address of the account, so we cannot send another email.');
      return;
    }
    setResend('sending');
    setResendMsg(null);
    try {
      // The API answers with the same words for every address and says whether
      // the message could really be sent. The page shows that answer.
      const answer = await post<{ message?: string }>('/auth/resend-verification', { email: accountEmail });
      setResendMsg(answer?.message ?? null);
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

  return (
    <AuthShell label="Confirm your email">
      <div className="grid w-full max-w-sm gap-5 py-10">
        <AuthHead title="Confirm your email" text="One click on the link in the message opens every feature of your account." index={0} />

        {state === 'checking' && (
          <AuthBlock index={1} className="gap-3">
            <p className="text-[15px] text-ink2">We are confirming your email address.</p>
            <LoadingBlock rows={2} label="Verifying your email" />
          </AuthBlock>
        )}

        {state === 'verified' && (
          <AuthBlock index={1} className="gap-4">
            <AuthNote>Email verified. Your address is confirmed.</AuthNote>
            <p className="text-[15px] text-ink2">Every feature is open to you now, including billing and domain changes.</p>
            <Button to="/app" size="lg" full>
              Go to your dashboard
              <Arrow />
            </Button>
          </AuthBlock>
        )}

        {state === 'failed' && (
          <AuthBlock index={1} className="gap-4">
            <AuthAlert>
              {reason === 'invalid'
                ? 'This confirmation link is invalid or has expired.'
                : reason === 'network'
                  ? 'We could not reach the Blipmade API. Check your connection and try again.'
                  : 'We could not confirm that link.'}
            </AuthAlert>
            <p className="text-[15px] text-ink2">
              Confirmation links can only be used once and stop working after a while. Send yourself a new one and try again.
            </p>
            {reason === 'network' && (
              <Button variant="soft" full type="button" onClick={retry}>
                Try again
              </Button>
            )}
            {sessionLoading ? (
              <p className="px-1 text-[13.5px] text-ink3">Checking your account…</p>
            ) : accountEmail ? (
              <>
                <Button variant="soft" full type="button" onClick={resendEmail} disabled={resend === 'sending'}>
                  {resend === 'sending' ? 'Sending…' : 'Resend the email'}
                </Button>
                {resend === 'sent' && (
                  <p role="status" className="px-1 text-[13.5px] text-ink2">
                    {resendMsg ?? `If that address still needs a confirmation, we sent a new link to ${accountEmail}.`}
                  </p>
                )}
                {resend === 'failed' && (
                  <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">
                    {resendMsg ?? 'We could not send another email. Try again in a moment.'}
                  </p>
                )}
              </>
            ) : (
              <p className="px-1 text-[13.5px] text-ink3">
                We cannot send another link without the account.{' '}
                <Link
                  to="/login"
                  className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
                >
                  Log in
                </Link>{' '}
                to ask for one.
              </p>
            )}
            <p className="text-center text-[14px] text-ink2">
              Already confirmed?{' '}
              <Link
                to="/app"
                className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
              >
                Go to your dashboard
              </Link>
            </p>
          </AuthBlock>
        )}
      </div>
    </AuthShell>
  );
}

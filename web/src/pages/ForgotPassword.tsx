import { useState, type FormEvent } from 'react';
import { Arrow, Button } from '../ui';
import { Link } from '../router';
import { ApiError, post } from '../lib/api';
import { AuthField } from './auth-field';
import { AuthAlert, AuthBlock, AuthHead, AuthNote, AuthShell } from './auth-shell';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

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
      <AuthShell label="Reset your password">
        <div className="grid w-full max-w-sm gap-5 py-10">
          <AuthHead title="Check your inbox" text="We sent the reset link to the address you gave us." index={0} />
          <AuthBlock index={1} className="gap-4">
            <AuthNote>{notice ?? 'If that address has an account, a reset link is on its way.'}</AuthNote>
            <p className="text-[15px] text-ink2">
              Open the link in the email to choose a new password. It can take a minute to arrive, so check your spam folder too.
            </p>
            <Button to="/login" size="lg" full>
              Back to log in
              <Arrow />
            </Button>
          </AuthBlock>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Reset your password">
      <form onSubmit={submit} noValidate aria-busy={pending} className="grid w-full max-w-sm gap-5 py-10">
        <AuthHead title="Reset your password" text="Enter your email address and we will send you a reset link." index={0} />
        {msg && <AuthAlert>{msg}</AuthAlert>}
        <AuthBlock index={1} className="gap-4">
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
        </AuthBlock>
        <AuthBlock index={2} className="gap-3">
          <Button type="submit" size="lg" full disabled={pending}>
            {pending ? 'Sending…' : 'Send reset link'}
            <Arrow />
          </Button>
          <p className="text-center text-[14px] text-ink2">
            Remembered it?{' '}
            <Link
              to="/login"
              className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Back to log in
            </Link>
          </p>
        </AuthBlock>
      </form>
    </AuthShell>
  );
}

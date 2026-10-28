import { useState, type FormEvent } from 'react';
import { Arrow, Button } from '../ui';
import { Link } from '../router';
import { useSession } from '../session';
import { ApiError, post } from '../lib/api';
import { passwordIssues } from '../lib/password-rules';
import { AuthField, PasswordRules } from './auth-field';
import { AuthAlert, AuthBlock, AuthHead, AuthNote, AuthShell } from './auth-shell';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Register() {
  const { register, registrationNotice } = useSession();
  const [firstName, setFirstName] = useState('');
  const [lastName, setLastName] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [msg, setMsg] = useState<string | null>(null);
  const [nameErr, setNameErr] = useState<string | null>(null);
  const [lastNameErr, setLastNameErr] = useState<string | null>(null);
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
    const vn = firstName.trim() ? null : 'Enter your first name.';
    const vl = lastName.trim() ? null : 'Enter your last name.';
    setEmailErr(ve);
    setPwErr(vp);
    setNameErr(vn);
    setLastNameErr(vl);
    if (ve || vp || vn || vl) return;

    setPending(true);
    setMsg(null);
    try {
      await register(email.trim(), pw, firstName.trim(), lastName.trim());
      setAccountEmail(email.trim());
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (err.fields?.email) {
          setEmailErr(err.fields.email);
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else if (err.fields?.firstName) {
          setNameErr(err.fields.firstName);
        } else if (err.fields?.lastName) {
          setLastNameErr(err.fields.lastName);
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

  if (accountEmail) {
    return (
      <AuthShell label="Confirm your email">
        <div className="grid w-full max-w-sm gap-5 py-10">
          <AuthHead title="Check your email" text="Your account is ready. Confirm your address to finish setting it up." index={0} />
          <AuthBlock index={1} className="gap-4">
            <AuthNote>
              {registrationNotice ?? `We sent a confirmation link to ${accountEmail}. Open it to confirm your address.`}
            </AuthNote>
            <Button to="/app" size="lg" full>
              Go to your dashboard
              <Arrow />
            </Button>
            <div className="grid gap-2">
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
            </div>
            <p className="text-[14px] text-ink3">
              Some features, such as billing and domain changes, need a verified email address. You can confirm it later.
            </p>
            <p className="text-center text-[14px] text-ink2">
              Already confirmed?{' '}
              <Link
                to="/login"
                className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
              >
                Log in
              </Link>
            </p>
          </AuthBlock>
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Create account">
      <form onSubmit={submit} noValidate aria-busy={pending} className="grid w-full max-w-sm gap-5 py-10">
        <AuthHead title="Create account" text="Your services, domains and invoices live in one place." index={0} />
        {msg && <AuthAlert>{msg}</AuthAlert>}
        <AuthBlock index={1} className="gap-4">
          <div className="grid grid-cols-2 gap-3">
            <AuthField
              id="firstName"
              label="First name"
              autoComplete="given-name"
              value={firstName}
              error={nameErr}
              onChange={(v) => {
                setFirstName(v);
                if (nameErr) setNameErr(null);
              }}
            />
            <AuthField
              id="lastName"
              label="Last name"
              autoComplete="family-name"
              value={lastName}
              error={lastNameErr}
              onChange={(v) => {
                setLastName(v);
                if (lastNameErr) setLastNameErr(null);
              }}
            />
          </div>
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
            onChange={(v) => {
              setPw(v);
              if (pwErr) setPwErr(checkPw(v));
            }}
            onBlur={() => {
              if (pw) setPwErr(checkPw(pw));
            }}
          />
          <PasswordRules value={pw} />
        </AuthBlock>
        <AuthBlock index={2} className="gap-3">
          <Button type="submit" size="lg" full disabled={pending}>
            {pending ? 'Working…' : 'Create account'}
            <Arrow />
          </Button>
          <p className="text-center text-[14px] text-ink2">
            Already have an account?{' '}
            <Link
              to="/login"
              className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Log in
            </Link>
          </p>
        </AuthBlock>
      </form>
    </AuthShell>
  );
}

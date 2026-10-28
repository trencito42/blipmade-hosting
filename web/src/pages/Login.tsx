import { useState, type FormEvent } from 'react';
import { Arrow, Button } from '../ui';
import { Link, useRouter } from '../router';
import { postLoginTarget } from '../auth-guard';
import { useSession } from '../session';
import { ApiError } from '../lib/api';
import { loginFailureMessage } from '../lib/login-message';
import { AuthField } from './auth-field';
import { AuthAlert, AuthBlock, AuthHead, AuthShell } from './auth-shell';

const EMAIL_RE = /^\S+@\S+\.\S+$/;

export default function Login() {
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
    <AuthShell label="Log in">
      <form onSubmit={submit} noValidate aria-busy={pending} className="grid w-full max-w-sm gap-5 py-10">
        <AuthHead title="Log in" text="Welcome back." index={0} />
        {(msg || suspensionNotice) && (
          <AuthAlert kind={msg?.kind === 'info' ? 'good' : 'bad'}>{msg?.text ?? suspensionNotice}</AuthAlert>
        )}
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
        </AuthBlock>
        <AuthBlock index={2} className="gap-3">
          <Button type="submit" size="lg" full disabled={pending}>
            {pending ? 'Working…' : 'Log in'}
            <Arrow />
          </Button>
          <div className="flex justify-between gap-3 text-[14px]">
            <Link
              to="/forgot-password"
              className="inline-flex min-h-11 items-center font-medium text-ink2 underline underline-offset-4 transition-colors duration-200 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Forgot password?
            </Link>
          </div>
          <p className="text-center text-[14px] text-ink2">
            New to Blipmade?{' '}
            <Link
              to="/register"
              className="font-medium text-ink underline underline-offset-4 transition-colors duration-200 hover:text-acc-h focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc-h"
            >
              Create an account
            </Link>
          </p>
        </AuthBlock>
      </form>
    </AuthShell>
  );
}

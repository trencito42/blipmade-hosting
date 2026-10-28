import { useState, type FormEvent } from 'react';
import { Arrow, Button } from '../ui';
import { Link, useRouter } from '../router';
import { ApiError, post } from '../lib/api';
import { passwordIssues } from '../lib/password-rules';
import { AuthField, PasswordRules } from './auth-field';
import { AuthAlert, AuthBlock, AuthHead, AuthNote, AuthShell } from './auth-shell';

export default function ResetPassword() {
  const { query } = useRouter();
  const token = query.token ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [pwErr, setPwErr] = useState<string | null>(null);
  const [confirmErr, setConfirmErr] = useState<string | null>(null);
  const [msg, setMsg] = useState<string | null>(null);
  const [pending, setPending] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const checkPw = (value: string) =>
    passwordIssues(value).length === 0
      ? null
      : 'Choose a password with at least 10 characters, an uppercase letter, a lowercase letter and a number.';

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    if (pending) return;
    const vp = checkPw(pw);
    const vc = confirm.length === 0 ? 'Type the password again.' : pw !== confirm ? 'The two passwords do not match.' : null;
    setPwErr(vp);
    setConfirmErr(vc);
    if (vp || vc) return;

    setPending(true);
    setMsg(null);
    try {
      await post('/auth/reset-password', { token, password: pw });
      setDone(true);
    } catch (err) {
      if (err instanceof ApiError) {
        if (err.status === 429 || err.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (err.fields?.password) {
          setPwErr(err.fields.password);
        } else if (err.status === 400 || err.status === 404) {
          // The link was already used, expired or was never valid.
          setLinkInvalid(true);
        } else if (err.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not change the password. Try again in a moment.');
        }
      } else {
        setMsg('We could not change the password. Try again in a moment.');
      }
    } finally {
      setPending(false);
    }
  };

  if (done) {
    return (
      <AuthShell label="Password updated">
        <div className="grid w-full max-w-sm gap-5 py-10">
          <AuthHead title="Password updated" text="Your password has been changed." index={0} />
          <AuthBlock index={1} className="gap-4">
            <AuthNote>Your password has been changed. Use it the next time you log in.</AuthNote>
            <Button to="/login" size="lg" full>
              Go to log in
              <Arrow />
            </Button>
          </AuthBlock>
        </div>
      </AuthShell>
    );
  }

  if (!token || linkInvalid) {
    return (
      <AuthShell label="Reset link not valid">
        <div className="grid w-full max-w-sm gap-5 py-10">
          <AuthHead title="Link not valid" text="This reset link cannot be used." index={0} />
          <AuthBlock index={1} className="gap-4">
            <AuthAlert>This reset link is invalid or has expired. Request a new one and try again.</AuthAlert>
            <p className="text-[15px] text-ink2">
              Reset links can only be used once and stop working after a while. A new one takes a moment to arrive.
            </p>
            <Button to="/forgot-password" size="lg" full>
              Request a new link
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
        </div>
      </AuthShell>
    );
  }

  return (
    <AuthShell label="Choose a new password">
      <form onSubmit={submit} noValidate aria-busy={pending} className="grid w-full max-w-sm gap-5 py-10">
        <AuthHead title="Choose a new password" text="Pick a password you do not use anywhere else." index={0} />
        {msg && <AuthAlert>{msg}</AuthAlert>}
        <AuthBlock index={1} className="gap-4">
          <AuthField
            id="password"
            label="New password"
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
          <AuthField
            id="confirm"
            label="Repeat new password"
            type="password"
            autoComplete="new-password"
            value={confirm}
            error={confirmErr}
            onChange={(v) => {
              setConfirm(v);
              if (confirmErr) setConfirmErr(null);
            }}
            onBlur={() => {
              if (confirm) setConfirmErr(pw !== confirm ? 'The two passwords do not match.' : null);
            }}
          />
        </AuthBlock>
        <AuthBlock index={2} className="gap-3">
          <Button type="submit" size="lg" full disabled={pending}>
            {pending ? 'Saving…' : 'Save new password'}
            <Arrow />
          </Button>
          <p className="text-center text-[14px] text-ink2">
            Changed your mind?{' '}
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

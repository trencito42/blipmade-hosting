import { useEffect, useId, useRef, useState, type FormEvent, type ReactNode } from 'react';
import { ApiError, post } from '../lib/api';
import { loginFailureMessage } from '../lib/login-message';
import { PASSWORD_RULES, passwordIssues } from '../lib/password-rules';
import { postLoginTarget } from '../auth-guard';
import { useSession } from '../session';
import { Link, useRouter } from '../router';
import { useProducts } from './catalog';
import { breakdownOfResources, eur, fmtRam } from './pricing';
import { Btn, Logo, cx } from './ui';

/**
 * The five screens of the account.
 *
 * The design is the one of the reference: the night panel on the left, the
 * form on the right, and the configuration the visitor chose on the home page
 * waiting for them in the panel.
 *
 * The logic is ours and it is not a copy of the reference:
 *
 *   - the sign-in goes through the session of the platform, so the answer of
 *     the API and the state of the browser never drift apart;
 *   - a refused sign-in is answered with the words of `loginFailureMessage`,
 *     so a suspended account and a wrong password are never confused;
 *   - the rules of the password are the rules of the API, read from the same
 *     file the tests read;
 *   - the answer of the server is shown as it is.
 */

/** The shape of a field of the forms. */
function Field({
  label,
  type = 'text',
  value,
  set,
  auto,
  error,
  hint,
  disabled,
}: {
  label: string;
  type?: string;
  value: string;
  set: (v: string) => void;
  auto?: string;
  error?: string;
  hint?: ReactNode;
  disabled?: boolean;
}) {
  const id = useId();
  const [show, setShow] = useState(false);
  const pw = type === 'password';
  return (
    <div className="grid gap-1.5">
      <label htmlFor={id} className="text-[15px] font-semibold">
        {label}
      </label>
      <div className="relative">
        <input
          id={id}
          type={pw && show ? 'text' : type}
          value={value}
          onChange={(e) => set(e.target.value)}
          autoComplete={auto}
          disabled={disabled}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? `${id}-e` : hint ? `${id}-h` : undefined}
          className="h-14 w-full rounded-2xl border border-line bg-card px-4 pr-20 text-[17px] outline-none transition-colors focus:border-ink disabled:opacity-60 aria-[invalid=true]:border-bad"
        />
        {pw ? (
          <button
            type="button"
            aria-pressed={show}
            aria-label={show ? 'Hide password' : 'Show password'}
            onClick={() => setShow(!show)}
            className="absolute top-1/2 right-2 -translate-y-1/2 rounded-full px-3.5 py-2 text-[14px] font-medium text-ink-2 hover:bg-ink/5"
          >
            {show ? 'Hide' : 'Show'}
          </button>
        ) : null}
      </div>
      {error ? (
        <p id={`${id}-e`} role="alert" className="text-[14px] text-bad">
          {error}
        </p>
      ) : hint ? (
        <p id={`${id}-h`} className="text-[14px] text-ink-3">
          {hint}
        </p>
      ) : null}
    </div>
  );
}

/**
 * The checklist of the rules of a password.
 *
 * The rules are the ones of the API, read from `lib/password-rules.ts`, so the
 * list on the page and the list the server enforces are the same list.
 */
function Rules({ pw }: { pw: string }) {
  return (
    <ul aria-label="Password rules" className="grid grid-cols-2 gap-x-4 gap-y-1.5 text-[14px]">
      {PASSWORD_RULES.map((rule) => {
        const ok = rule.ok(pw);
        return (
          <li key={rule.label} className={cx('flex items-center gap-2', ok ? 'text-green' : 'text-ink-3')}>
            <span aria-hidden="true">{ok ? '✓' : '○'}</span>
            <span>
              <span className="sr-only">{ok ? 'Met: ' : 'Not met: '}</span>
              {rule.label}
            </span>
          </li>
        );
      })}
    </ul>
  );
}

const EMAIL = /^\S+@\S+\.\S+$/;

/** The message of a password that does not keep the rules of the API. */
const PW_MESSAGE = 'Choose a password with at least 10 characters, an uppercase letter, a lowercase letter and a number.';

/**
 * The frame of the five screens.
 *
 * The night panel holds the name of the platform, the promise of the service
 * and the configuration the visitor chose before they signed up. The form is
 * on the right, and it is the only thing that moves.
 */
function Frame({ children, search }: { children: ReactNode; search: string }) {
  const products = useProducts();
  const query = new URLSearchParams(search);
  const product = products.find((entry) => entry.slug === query.get('app'));
  const summary = product
    ? (() => {
        const clamp = (key: 'ram' | 'cpu' | 'disk') =>
          Math.min(product.max[key], Math.max(product.min[key], Number(query.get(key)) || product.def[key]));
        return { ram: clamp('ram'), cpu: clamp('cpu'), disk: clamp('disk') };
      })()
    : null;

  return (
    <div className="grid min-h-svh gap-2 p-2 sm:p-3 lg:grid-cols-[minmax(0,0.9fr)_minmax(0,1.1fr)]">
      <aside className="on-night hidden flex-col justify-between gap-12 rounded-[32px] bg-night p-10 text-snow lg:flex">
        <Logo onNight />
        <div className="grid gap-8">
          <p className="max-w-[10em] font-display text-[clamp(38px,3.6vw,56px)] leading-[0.98] font-semibold tracking-[-0.045em]">
            Hosting for everything you run.
          </p>
          {product && summary ? (
            <div className="rounded-[24px] border border-night-line bg-night-2 p-6">
              <p className="text-[14px] text-snow-2">Your configuration</p>
              <p className="mt-1 font-display text-[26px] font-semibold tracking-[-0.03em]">{product.name}</p>
              <p className="num mt-2 text-[15px] text-snow-2">
                {fmtRam(summary.ram)} RAM · {summary.cpu} vCPU · {summary.disk} GB disk
              </p>
              <p className="mt-4">
                <span className="big text-[40px] text-mint">{eur(breakdownOfResources(summary, product.rates).total)}</span>
                <span className="text-snow-2"> /month</span>
              </p>
            </div>
          ) : null}
        </div>
        <p className="text-[14.5px] text-snow-2">Payments are completed with the team during launch.</p>
      </aside>
      <main id="main" className="grid content-between gap-10 rounded-[28px] px-5 py-8 sm:px-12 sm:py-12">
        <div className="lg:hidden">
          <Logo />
        </div>
        {children}
        <p className="text-center text-[14px] text-ink-3">
          <Link to="/docs/account-security" className="underline underline-offset-2">
            How we protect your account
          </Link>
        </p>
      </main>
    </div>
  );
}

/** The sign-in. */
export function AuthLogin() {
  const { query, search, navigate } = useRouter();
  const { login, suspensionNotice } = useSession();
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (!pw) next.password = 'Enter your password.';
    setErr(next);
    setMsg('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      const session = await login(email.trim(), pw);
      // The page the visitor asked for is only used when their role is allowed
      // to open it. Otherwise they land on the home of their role.
      navigate(postLoginTarget(session.role, query.next), { replace: true });
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.fields?.email) setErr({ email: error.fields.email });
        else if (error.fields?.password) setErr({ password: error.fields.password });
        else setMsg(loginFailureMessage(error));
      } else {
        setMsg('Something went wrong. Try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame search={search}>
      <div className="mx-auto grid w-full max-w-[440px] gap-7">
        <form onSubmit={submit} noValidate aria-busy={busy} className="grid gap-6">
          <div className="grid gap-2">
            <h1 className="text-[clamp(36px,4.4vw,48px)] leading-none font-semibold tracking-[-0.045em]">Log in</h1>
            <p className="text-[17px] text-ink-2">Welcome back. Your instances, invoices and tickets are one step away.</p>
          </div>
          {msg || suspensionNotice ? (
            <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
              {msg || suspensionNotice}
            </p>
          ) : null}
          <Field label="Email address" type="email" value={email} set={setEmail} auto="email" error={err.email} disabled={busy} />
          <div className="grid gap-3">
            <Field label="Password" type="password" value={pw} set={setPw} auto="current-password" error={err.password} disabled={busy} />
            <Link to="/forgot-password" className="w-fit text-[15px] text-green underline underline-offset-4">
              Forgot password?
            </Link>
          </div>
          <Btn type="submit" size="lg" disabled={busy} className="w-full">
            {busy ? 'One moment…' : 'Log in'}
          </Btn>
          <p className="text-[15.5px] text-ink-2">
            New to Blipmade?{' '}
            <Link to="/register" className="font-semibold text-ink underline underline-offset-4">
              Create an account
            </Link>
          </p>
        </form>
      </div>
    </Frame>
  );
}

/** The creation of an account. */
export function AuthRegister() {
  const { search } = useRouter();
  const { register, registrationNotice } = useSession();
  const [first, setFirst] = useState('');
  const [last, setLast] = useState('');
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [account, setAccount] = useState('');
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMsg, setResendMsg] = useState('');

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (!first.trim()) next.firstName = 'Enter your first name.';
    if (!last.trim()) next.lastName = 'Enter your last name.';
    if (!EMAIL.test(email.trim())) next.email = 'Enter a valid email address.';
    if (passwordIssues(pw).length) next.password = PW_MESSAGE;
    setErr(next);
    setMsg('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await register(email.trim(), pw, first.trim(), last.trim());
      setAccount(email.trim());
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429 || error.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (error.fields?.email) {
          setErr({ email: error.fields.email });
        } else if (error.fields?.password) {
          setErr({ password: error.fields.password });
        } else if (error.fields?.firstName) {
          setErr({ firstName: error.fields.firstName });
        } else if (error.fields?.lastName) {
          setErr({ lastName: error.fields.lastName });
        } else if (error.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not create the account. Check the details and try again.');
        }
      } else {
        setMsg('We could not create the account. Check the details and try again.');
      }
    } finally {
      setBusy(false);
    }
  };

  const resendEmail = async () => {
    if (!account) {
      setResend('failed');
      setResendMsg('We need the address of the account to send another email.');
      return;
    }
    setResend('sending');
    setResendMsg('');
    try {
      // The API answers with the same words for every address and says whether
      // the message could really be sent. The page shows that answer.
      const answer = await post<{ message?: string }>('/auth/resend-verification', { email: account });
      setResendMsg(answer?.message ?? '');
      setResend('sent');
    } catch (error) {
      setResend('failed');
      setResendMsg(
        error instanceof ApiError && (error.status === 429 || error.code === 'rate_limited')
          ? 'Too many emails asked for. Try again in 15 minutes.'
          : 'We could not send another email. Try again in a moment.',
      );
    }
  };

  return (
    <Frame search={search}>
      <div className="mx-auto grid w-full max-w-[440px] gap-7">
        {account ? (
          <div className="grid gap-5" role="status">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Check your email.</h1>
            <p className="text-[18px] text-ink-2">
              {registrationNotice ?? `We sent a confirmation link to ${account}. Open it to finish creating your account, then log in.`}
            </p>
            <Btn to="/login" size="lg">
              Go to log in
            </Btn>
            <div className="grid gap-2">
              <Btn variant="outline" type="button" onClick={resendEmail} disabled={resend === 'sending'}>
                {resend === 'sending' ? 'Sending…' : 'Resend the email'}
              </Btn>
              {resend === 'sent' ? (
                <p role="status" className="px-1 text-[13.5px] text-ink-2">
                  {resendMsg || `If that address still needs a confirmation, we sent a new link to ${account}.`}
                </p>
              ) : null}
              {resend === 'failed' ? (
                <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">
                  {resendMsg || 'We could not send another email. Try again in a moment.'}
                </p>
              ) : null}
            </div>
            <p className="text-[14px] text-ink-3">
              Some features, such as billing and domain changes, need a verified email address. You can confirm it later.
            </p>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={busy} className="grid gap-6">
            <div className="grid gap-2">
              <h1 className="text-[clamp(36px,4.4vw,48px)] leading-none font-semibold tracking-[-0.045em]">Create your account</h1>
              <p className="text-[17px] text-ink-2">One account for your instances, invoices and support tickets.</p>
            </div>
            <div className="grid gap-4 sm:grid-cols-2">
              <Field label="First name" value={first} set={setFirst} auto="given-name" error={err.firstName} disabled={busy} />
              <Field label="Last name" value={last} set={setLast} auto="family-name" error={err.lastName} disabled={busy} />
            </div>
            <Field label="Email address" type="email" value={email} set={setEmail} auto="email" error={err.email} disabled={busy} />
            <div className="grid gap-3">
              <Field label="Password" type="password" value={pw} set={setPw} auto="new-password" error={err.password} disabled={busy} />
              <Rules pw={pw} />
            </div>
            {msg ? (
              <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
                {msg}
              </p>
            ) : null}
            <Btn type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'One moment…' : 'Create account'}
            </Btn>
            <p className="text-[14px] text-ink-3">
              By creating an account you agree to the{' '}
              <Link to="/terms" className="underline underline-offset-2">
                terms of service
              </Link>{' '}
              and the{' '}
              <Link to="/privacy" className="underline underline-offset-2">
                privacy policy
              </Link>
              .
            </p>
            <p className="text-[15.5px] text-ink-2">
              Already have an account?{' '}
              <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
                Log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </Frame>
  );
}

/** The address of a lost password. */
export function AuthForgot() {
  const { search } = useRouter();
  const [email, setEmail] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [notice, setNotice] = useState('');
  const [sent, setSent] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    if (!EMAIL.test(email.trim())) {
      setErr({ email: 'Enter a valid email address.' });
      return;
    }
    setErr({});
    setMsg('');
    setBusy(true);
    try {
      // The API answers with the same words for an address that has an account
      // and for one that has not, and it says whether the message could really
      // be sent. The page shows that answer and never claims that a link is on
      // its way while the relay is not configured.
      const answer = await post<{ message?: string }>('/auth/forgot-password', { email: email.trim() });
      setNotice(answer?.message ?? '');
      setSent(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429 || error.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (error.fields?.email) {
          setErr({ email: error.fields.email });
        } else if (error.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not send the reset link. Try again in a moment.');
        }
      } else {
        setMsg('We could not send the reset link. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame search={search}>
      <div className="mx-auto grid w-full max-w-[440px] gap-7">
        {sent ? (
          <div className="grid gap-5" role="status">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Check your email.</h1>
            <p className="text-[18px] text-ink-2">{notice || 'If that address has an account, a reset link is on its way.'}</p>
            <p className="text-[16px] text-ink-2">
              Open the link in the email to choose a new password. It can take a minute to arrive, so check your spam folder too.
            </p>
            <Btn to="/login" size="lg">
              Back to log in
            </Btn>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={busy} className="grid gap-6">
            <div className="grid gap-2">
              <h1 className="text-[clamp(36px,4.4vw,48px)] leading-none font-semibold tracking-[-0.045em]">Forgot your password?</h1>
              <p className="text-[17px] text-ink-2">Enter the email address of your account and we will send you a link.</p>
            </div>
            {msg ? (
              <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
                {msg}
              </p>
            ) : null}
            <Field label="Email address" type="email" value={email} set={setEmail} auto="email" error={err.email} disabled={busy} />
            <Btn type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'One moment…' : 'Send the link'}
            </Btn>
            <p className="text-[15.5px] text-ink-2">
              <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </Frame>
  );
}

/** The choice of a new password. */
export function AuthReset() {
  const { query, search } = useRouter();
  const token = query.token ?? '';
  const [pw, setPw] = useState('');
  const [confirm, setConfirm] = useState('');
  const [err, setErr] = useState<Record<string, string>>({});
  const [msg, setMsg] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [linkInvalid, setLinkInvalid] = useState(false);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const next: Record<string, string> = {};
    if (passwordIssues(pw).length) next.password = PW_MESSAGE;
    if (!confirm) next.confirm = 'Type the password again.';
    else if (confirm !== pw) next.confirm = 'The two passwords do not match.';
    setErr(next);
    setMsg('');
    if (Object.keys(next).length) return;

    setBusy(true);
    try {
      await post('/auth/reset-password', { token, password: pw });
      setDone(true);
    } catch (error) {
      if (error instanceof ApiError) {
        if (error.status === 429 || error.code === 'rate_limited') {
          setMsg('Too many attempts. Try again in 5 minutes.');
        } else if (error.fields?.password) {
          setErr({ password: error.fields.password });
        } else if (error.status === 400 || error.status === 404) {
          // The link was already used, expired or was never valid.
          setLinkInvalid(true);
        } else if (error.status === 0) {
          setMsg('Cannot reach the Blipmade API. Check your connection and try again.');
        } else {
          setMsg('We could not change the password. Try again in a moment.');
        }
      } else {
        setMsg('We could not change the password. Try again in a moment.');
      }
    } finally {
      setBusy(false);
    }
  };

  return (
    <Frame search={search}>
      <div className="mx-auto grid w-full max-w-[440px] gap-7">
        {done ? (
          <div className="grid gap-5" role="status">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Password changed.</h1>
            <p className="text-[18px] text-ink-2">Your password has been changed. Use it the next time you log in.</p>
            <Btn to="/login" size="lg">
              Go to log in
            </Btn>
          </div>
        ) : !token || linkInvalid ? (
          <div className="grid gap-5">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Link not valid.</h1>
            <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
              This reset link is invalid or has expired. Request a new one and try again.
            </p>
            <p className="text-[16px] text-ink-2">
              Reset links can only be used once and stop working after a while. A new one takes a moment to arrive.
            </p>
            <Btn to="/forgot-password" size="lg">
              Request a new link
            </Btn>
          </div>
        ) : (
          <form onSubmit={submit} noValidate aria-busy={busy} className="grid gap-6">
            <div className="grid gap-2">
              <h1 className="text-[clamp(36px,4.4vw,48px)] leading-none font-semibold tracking-[-0.045em]">Choose a new password</h1>
              <p className="text-[17px] text-ink-2">Choosing a new password ends every session of your account.</p>
            </div>
            {msg ? (
              <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
                {msg}
              </p>
            ) : null}
            <div className="grid gap-3">
              <Field label="New password" type="password" value={pw} set={setPw} auto="new-password" error={err.password} disabled={busy} />
              <Rules pw={pw} />
            </div>
            <Field label="Type the password again" type="password" value={confirm} set={setConfirm} auto="new-password" error={err.confirm} disabled={busy} />
            <Btn type="submit" size="lg" disabled={busy} className="w-full">
              {busy ? 'One moment…' : 'Save new password'}
            </Btn>
            <p className="text-[15.5px] text-ink-2">
              <Link to="/login" className="font-semibold text-ink underline underline-offset-4">
                Back to log in
              </Link>
            </p>
          </form>
        )}
      </div>
    </Frame>
  );
}

/** The confirmation of the address of the account. */
export function AuthVerify() {
  const { query, search } = useRouter();
  const token = query.token ?? '';
  const { user } = useSession();
  const accountEmail = user?.email ?? '';
  const [state, setState] = useState<'checking' | 'verified' | 'failed'>(token ? 'checking' : 'failed');
  const [reason, setReason] = useState<'invalid' | 'network' | 'unknown'>('unknown');
  const [attempt, setAttempt] = useState(0);
  const [resend, setResend] = useState<'idle' | 'sending' | 'sent' | 'failed'>('idle');
  const [resendMsg, setResendMsg] = useState('');
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
      .catch((error: unknown) => {
        setState('failed');
        if (error instanceof ApiError && (error.status === 400 || error.status === 404)) setReason('invalid');
        else if (error instanceof ApiError && error.status === 0) setReason('network');
        else setReason('unknown');
      });
  }, [token, attempt]);

  const resendEmail = async () => {
    if (!accountEmail) {
      setResend('failed');
      setResendMsg('We do not know the address of the account, so we cannot send another email.');
      return;
    }
    setResend('sending');
    setResendMsg('');
    try {
      const answer = await post<{ message?: string }>('/auth/resend-verification', { email: accountEmail });
      setResendMsg(answer?.message ?? '');
      setResend('sent');
    } catch (error) {
      setResend('failed');
      setResendMsg(
        error instanceof ApiError && (error.status === 429 || error.code === 'rate_limited')
          ? 'Too many emails asked for. Try again in 15 minutes.'
          : 'We could not send another email. Try again in a moment.',
      );
    }
  };

  const failed = {
    invalid: 'This confirmation link is invalid or has already been used. Ask for a new one.',
    network: 'We could not reach the Blipmade API. Check your connection and try again.',
    unknown: 'We could not confirm your address. Try again in a moment.',
  }[reason];

  return (
    <Frame search={search}>
      <div className="mx-auto grid w-full max-w-[440px] gap-7">
        {state === 'checking' ? (
          <div className="grid gap-5" role="status">
            <h1 className="text-[clamp(36px,4.4vw,48px)] leading-none font-semibold tracking-[-0.045em]">Confirming your email.</h1>
            <p className="text-[17px] text-ink-2">We are confirming your email address.</p>
          </div>
        ) : state === 'verified' ? (
          <div className="grid gap-5" role="status">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">Email verified.</h1>
            <p className="text-[18px] text-ink-2">Your address is confirmed. Every feature is open to you now, including billing and domain changes.</p>
            <Btn to="/app" size="lg">
              Go to your dashboard
            </Btn>
          </div>
        ) : (
          <div className="grid gap-5">
            <h1 className="text-[40px] leading-none font-semibold tracking-[-0.045em]">We could not confirm your email.</h1>
            <p role="alert" className="rounded-2xl border border-bad/40 bg-bad/[0.07] px-4 py-3 text-[15px] text-bad">
              {failed}
            </p>
            <div className="grid gap-2">
              <Btn variant="outline" type="button" onClick={resendEmail} disabled={resend === 'sending'}>
                {resend === 'sending' ? 'Sending…' : 'Send another email'}
              </Btn>
              {resend === 'sent' ? (
                <p role="status" className="px-1 text-[13.5px] text-ink-2">
                  {resendMsg || `If that address still needs a confirmation, we sent a new link to ${accountEmail}.`}
                </p>
              ) : null}
              {resend === 'failed' ? (
                <p role="alert" className="px-1 text-[13.5px] font-medium text-bad">
                  {resendMsg || 'We could not send another email. Try again in a moment.'}
                </p>
              ) : null}
            </div>
            <Btn to="/login" size="lg">
              Back to log in
            </Btn>
          </div>
        )}
      </div>
    </Frame>
  );
}

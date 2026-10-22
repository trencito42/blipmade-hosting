import { useState, type FormEvent } from 'react';
import { Icon } from '../icons';
import { cn } from '../lib';
import { Button, Eyebrow, Headline, Logo } from '../ui';

const field = (err: boolean) => cn('flex h-14 items-center rounded-full bg-s1 pl-5 pr-2 transition-colors duration-[180ms] focus-within:bg-s2', err && 'bg-bad/10 ring-2 ring-bad');

export default function Login() {
  const [email, setEmail] = useState('');
  const [pw, setPw] = useState('');
  const [show, setShow] = useState(false);
  const [msg, setMsg] = useState<{ kind: 'err' | 'info'; text: string } | null>(null);
  const [bad, setBad] = useState({ e: false, p: false });
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const be = !/^\S+@\S+\.\S+$/.test(email), bp = !pw;
    setBad({ e: be, p: bp });
    // TODO: POST credentials to the auth API, then navigate to the validated `next` path on success.
    setMsg(be || bp ? { kind: 'err', text: 'Enter a valid email and your password.' } : { kind: 'info', text: 'Login backend is not connected yet. Nothing was submitted.' });
  };
  return (
    <div className="grid min-h-[100svh] gap-3 p-3 lg:grid-cols-[minmax(420px,1fr)_1.1fr]">
      <section className="flex flex-col px-3 py-4 sm:px-8 sm:py-6">
        <Logo />
        <div className="m-auto grid w-full max-w-[420px] gap-5 py-10">
          <Eyebrow>Secure access</Eyebrow>
          <Headline as="h1" lines={['Welcome', 'back.']} className="text-[clamp(52px,12vw,76px)] leading-[0.9]" />
          <p className="text-[17px] text-ink2">Log in to your Blipmade account.</p>
          {msg && <div role="alert" className={cn('rounded-2xl px-4 py-3 text-[14.5px] font-bold', msg.kind === 'err' ? 'bg-bad/10 text-bad' : 'bg-acc-bg text-acc')}>{msg.text}</div>}
          <form onSubmit={submit} noValidate className="grid gap-4">
            <div className="grid gap-2">
              <label htmlFor="email" className="px-1 text-[14px] font-bold">Email address</label>
              <div className={field(bad.e)}><input id="email" name="email" type="email" autoComplete="username" inputMode="email" autoFocus value={email} aria-invalid={bad.e || undefined} onChange={(e) => setEmail(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" /></div>
            </div>
            <div className="grid gap-2">
              <label htmlFor="password" className="px-1 text-[14px] font-bold">Password</label>
              <div className={field(bad.p)}>
                <input id="password" name="password" type={show ? 'text' : 'password'} autoComplete="current-password" value={pw} aria-invalid={bad.p || undefined} onChange={(e) => setPw(e.target.value)} className="h-full min-w-0 flex-1 bg-transparent text-[16px] outline-none" />
                <button type="button" onClick={() => setShow(!show)} aria-label={show ? 'Hide password' : 'Show password'} className="grid size-11 place-items-center rounded-full text-ink3 hover:bg-s3 hover:text-ink"><Icon name={show ? 'eyeOff' : 'eye'} /></button>
              </div>
            </div>
            <div className="flex justify-end px-1 text-[14px]"><a href="/forgot-password" className="font-bold text-acc hover:underline">Forgot password?</a></div>
            <Button type="submit" full size="lg">Log in</Button>
          </form>
          <p className="text-center text-[14.5px] text-ink2">New to Blipmade? <a href="/register" className="font-bold text-acc hover:underline">Create account</a></p>
        </div>
        <p className="flex items-center gap-2 px-1 font-mono text-[12.5px] text-ink3"><span className="size-[7px] rounded-full bg-acc" />Protected session access</p>
      </section>
      <aside aria-hidden="true" className="hidden flex-col justify-between gap-8 rounded-[32px] bg-acc p-12 text-on-acc lg:flex">
        <span className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] opacity-70">Blipmade</span>
        <div>
          <h2 className="text-[clamp(52px,6vw,96px)] font-extrabold leading-[0.88] tracking-[-0.07em]">Pick an app.<br />Deploy it.</h2>
          <p className="mt-6 max-w-[26em] text-[19px] opacity-75">One account for your apps, databases, domains and billing. No VPS to set up.</p>
        </div>
        <ul className="flex flex-wrap gap-2">{['Apps from €1.49/mo', 'Databases from €4.49/mo', 'Start small, scale freely'].map((t) => <li key={t} className="rounded-full bg-on-acc/10 px-4 py-2 text-[14.5px] font-bold">{t}</li>)}</ul>
      </aside>
    </div>
  );
}

import type { ReactNode } from 'react';
import { APPS, priceOf } from '../data';
import { Icon } from '../icons';
import { cn, clamp, ease, eur, useReducedMotion, useStickyProgress } from '../lib';
import { AppMark, Headline, StatusDot, Wrap } from '../ui';

const W = APPS[0];
const SHELF = ['WordPress', 'Ghost', 'Uptime Kuma', 'PostgreSQL', 'n8n', 'Forgejo'].map((n) => APPS.find((a) => a.name === n)!);

/* Scenes are pure functions of t (0 to 1 inside the chapter), so scrolling scrubs them both ways. */
function Pick({ t }: { t: number }) {
  const typed = 'word'.slice(0, Math.floor(clamp((t - 0.05) * 3) * 4.99));
  const hit = t > 0.55;
  return (
    <div className="grid gap-3">
      <div className="flex h-12 items-center gap-2.5 rounded-full bg-s2 px-4 text-ink3"><Icon name="search" /><span className="font-mono text-[14px] text-ink">{typed || <span className="text-ink3">Search apps</span>}<span className="bm-caret">▍</span></span></div>
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-3">
        {SHELF.map((a, i) => {
          const on = a.name === 'WordPress' && hit;
          const dim = typed.length > 1 && !a.name.toLowerCase().includes(typed);
          return (
            <div key={a.name} className={cn('grid gap-2 rounded-2xl p-3 transition-[background-color,opacity] duration-[220ms]', on ? 'bg-acc text-on-acc' : 'bg-s2')} style={{ transform: `translateY(${(1 - ease(t * 3.2 - i * 0.18)) * 18}px)`, opacity: dim && !on ? 0.3 : clamp(t * 4 - i * 0.15 + 0.3) }}>
              <AppMark icon={a.icon} size={34} tone={on ? 'acc' : 'dark'} />
              <span className="text-[14.5px] font-semibold leading-tight">{a.name}</span>
              <span className={cn('font-mono text-[12px]', on ? 'opacity-70' : 'text-ink3')}>from {eur(a.from)}</span>
            </div>
          );
        })}
      </div>
    </div>
  );
}

function Shape({ t }: { t: number }) {
  const mb = 512 + Math.round(ease(t * 1.5) * 3) * 512;
  const mbi = Math.round(ease(t * 1.5) * 3);
  const cpu = 1 + Math.round(ease(clamp(t * 1.4 - 0.2)) * 1);
  const disk = 5 + Math.round(ease(clamp(t * 1.5 - 0.1)) * 3) * 5;
  const price = priceOf(W, mb, cpu, disk);
  return (
    <div className="grid gap-3">
      <div className="grid grid-cols-4 gap-2">
        {['512 MB', '1 GB', '1.5 GB', '2 GB'].map((l, i) => <div key={l} className={cn('rounded-full p-3 text-center font-mono text-[13px] font-medium transition-colors duration-[220ms]', i === mbi ? 'bg-ink text-bg' : 'bg-s2 text-ink3')}>{l}</div>)}
      </div>
      {([['Memory', mb / 2048, `${(mb / 1024).toFixed(1)} GB`], ['CPU', cpu / 4, `${cpu} vCPU`], ['Storage', disk / 30, `${disk} GB`]] as const).map(([l, v, d]) => (
        <div key={l} className="rounded-2xl bg-s2 p-3.5"><div className="flex justify-between text-[13px]"><span className="text-ink2">{l}</span><span className="font-mono text-ink">{d}</span></div><div className="mt-2 h-2 overflow-hidden rounded-full bg-s3"><i className="block h-full rounded-full bg-acc" style={{ width: `${clamp(v) * 100}%` }} /></div></div>
      ))}
      <div className="flex items-end justify-between rounded-2xl bg-acc p-4 text-on-acc"><span className="text-[13px] font-bold opacity-70">Per month, always visible</span><span className="font-mono text-[32px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{eur(price)}</span></div>
    </div>
  );
}

function Launch({ t }: { t: number }) {
  const steps = ['Order confirmed', 'Container created', 'Configuration applied', 'Service online'];
  const done = (i: number) => t > (i + 1) / (steps.length + 0.7);
  const logs = ['Pulling image', 'Starting web server', 'Site is up', 'Listening on :80'];
  const shown = Math.floor(clamp(t * 1.5) * (logs.length + 0.99));
  return (
    <div className="grid gap-3">
      <ul className="grid gap-2">
        {steps.map((s, i) => (
          <li key={s} className={cn('flex items-center gap-3 rounded-2xl bg-s2 p-3 transition-opacity duration-[220ms]', done(i) ? 'opacity-100' : 'opacity-50')}>
            <span className={cn('grid size-6 place-items-center rounded-full transition-colors duration-[180ms]', done(i) ? 'bg-acc text-on-acc' : 'bg-s3')}>{done(i) && <Icon name="check" size={13} />}</span>
            <span className="font-medium">{s}</span>
          </li>
        ))}
      </ul>
      <div className="rounded-2xl bg-con p-3.5 font-mono text-[12.5px] text-con-ink">
        {logs.slice(0, shown).map((l, i) => <p key={l} className={i === 2 ? 'text-acc' : ''}><span className="text-ink3">[12:04:{10 + i}]</span> {l}</p>)}
        <p className="text-ink3">&gt; <span className="bm-caret">▍</span></p>
      </div>
      <div className="flex items-center justify-between rounded-2xl bg-s2 p-3.5">
        <span className="flex items-center gap-2.5 font-medium"><AppMark icon="globe" size={34} tone="lit" />wordpress</span>
        <span className={cn('flex items-center gap-2 font-mono text-[12.5px] transition-colors duration-[220ms]', t > 0.8 ? 'text-acc' : 'text-ink3')}><StatusDot live={t > 0.8} />{t > 0.8 ? 'online' : 'starting'}</span>
      </div>
    </div>
  );
}

const CHAPTERS: { id: string; title: string; text: string; scene: (t: number) => ReactNode }[] = [
  { id: 'pick', title: 'Pick an app.', text: 'Search the catalog or open a category. WordPress, Ghost, Uptime Kuma, PostgreSQL and more, each with its price up front.', scene: (t) => <Pick t={t} /> },
  { id: 'shape', title: 'Set the resources.', text: 'Memory, CPU and storage. The monthly price updates as you move, so there is nothing to discover at checkout.', scene: (t) => <Shape t={t} /> },
  { id: 'launch', title: 'Launch it.', text: 'Provisioning and start-up happen for you with every step visible. Then it lives in your dashboard with status, logs and files.', scene: (t) => <Launch t={t} /> },
];

export function Story() {
  const reduced = useReducedMotion();
  const [ref, p] = useStickyProgress<HTMLDivElement>();
  const n = CHAPTERS.length;
  const active = Math.min(n - 1, Math.floor(p * n));
  const local = (i: number) => clamp(p * n - i);
  const head = (
    <div className="grid gap-4">
      <Headline lines={['From pick to', 'online in three moves.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" />
      <p className="text-[12.5px] text-ink3">Interactive concept with sample data. The apps and the prices of the catalog are shown when you deploy.</p>
    </div>
  );

  if (reduced) {
    return (
      <section id="how" aria-label="How it works" className="py-24"><Wrap className="grid gap-12">{head}
        <ol className="grid gap-5 lg:grid-cols-3">{CHAPTERS.map((c, i) => <li key={c.id} className="grid gap-4 rounded-[24px] bg-s1 p-6"><p className="text-[26px] font-extrabold tracking-[-0.04em]"><span className="mr-3 font-mono text-[14px] text-acc">0{i + 1}</span>{c.title}</p><p className="text-ink2">{c.text}</p>{c.scene(1)}</li>)}</ol>
      </Wrap></section>
    );
  }
  return (
    <section id="how" aria-label="How it works" className="relative">
      <Wrap className="pb-10 pt-24">{head}</Wrap>
      <div ref={ref} className="relative" style={{ height: `${n * 90}svh` }}>
        <div className="sticky top-0 flex h-[100svh] items-center">
          <Wrap className="grid w-full items-center gap-6 pt-16 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.05fr)] lg:gap-14">
            <div className="grid gap-5">
              <ol className="grid gap-2" aria-label="Steps">
                {CHAPTERS.map((c, i) => (
                  <li key={c.id} aria-current={i === active ? 'step' : undefined} className={cn('grid grid-cols-[auto_minmax(0,1fr)] gap-x-4 rounded-[24px] p-4 transition-[background-color,opacity] duration-[220ms] sm:p-5', i === active ? 'bg-s1' : 'opacity-60', i !== active && 'max-lg:hidden')}>
                    <span className={cn('grid size-9 place-items-center rounded-full font-mono text-[13px] font-medium transition-colors duration-[220ms]', i === active ? 'bg-acc text-on-acc' : i < active ? 'bg-acc/20 text-acc' : 'bg-s2 text-ink3')}>{i < active ? <Icon name="check" size={15} /> : i + 1}</span>
                    <div><p className="text-[clamp(28px,3.4vw,44px)] font-extrabold leading-none tracking-[-0.055em]">{c.title}</p>
                      <div className={cn('grid transition-[grid-template-rows,opacity] duration-[220ms]', i === active ? 'grid-rows-[1fr] opacity-100' : 'grid-rows-[0fr] opacity-0')}><p className="overflow-hidden pt-2 text-[16px] text-ink2">{c.text}</p></div></div>
                  </li>
                ))}
              </ol>
              <div className="hidden h-1.5 overflow-hidden rounded-full bg-s2 lg:block" aria-hidden="true"><i className="block h-full rounded-full bg-acc" style={{ width: `${p * 100}%` }} /></div>
            </div>
            <div className="relative h-[clamp(380px,56svh,560px)] rounded-[28px] bg-acc-bg p-3 sm:p-5" aria-live="polite">
              {CHAPTERS.map((c, i) => (
                <div key={c.id} aria-hidden={i !== active} className={cn('absolute inset-3 grid transition-[opacity,transform] duration-[220ms] sm:inset-5', i === active ? 'opacity-100' : 'pointer-events-none opacity-0', i < active ? '-translate-y-3' : i > active ? 'translate-y-3' : '')}><div className="grid h-full content-center gap-3 rounded-[22px] bg-s1 p-3 sm:p-4">{c.scene(local(i))}</div></div>
              ))}
            </div>
          </Wrap>
        </div>
      </div>
    </section>
  );
}

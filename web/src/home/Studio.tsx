import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { APPS, CATEGORIES, fmtMb, minLabel, priceOf, slug, type App, type Category } from '../data';
import { Icon } from '../icons';
import { cn, eur, useMediaQuery, useReducedMotion, useTween } from '../lib';
import { AppMark, Button, StatusDot } from '../ui';

type Phase = 'browse' | 'deploying' | 'running';
const STEPS = ['Pulling image', 'Allocating resources', 'Starting container', 'Health check'];
const BOOT: Record<string, string[]> = {
  'Web & CMS': ['Starting web server', 'Loading configuration', 'ok|Site is up', 'Listening on :80'],
  'Developer Tools': ['Starting service', 'Loading configuration', 'ok|Service is up', 'Listening on :3000'],
  Monitoring: ['Starting service', 'Loading monitors', 'ok|Dashboard is up', 'Listening on :3001'],
  Automation: ['Starting runtime', 'Loading workflows', 'ok|Editor is up', 'Listening on :5678'],
  Bots: ['Installing dependencies', 'Starting index.js', 'ok|Logged in', 'Listening for events'],
  Databases: ['Initializing data directory', 'Starting server', 'ok|Database system is ready', 'Accepting connections'],
};
const stamp = () => new Date().toTimeString().slice(0, 8);
type Line = { t: string; text: string; ok?: boolean; me?: boolean };
const pill = (on: boolean) => cn('h-11 whitespace-nowrap rounded-full px-3 text-[13.5px] font-bold transition-colors duration-[180ms] lg:h-10', on ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink');
const ALL_RAM = [256, 512, 1024, 2048, 4096, 8192];

export function Studio({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  const reduced = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 1023px)');
  const [q, setQ] = useState('');
  const [app, setApp] = useState<App>(APPS[0]);
  const [mb, setMb] = useState(1024);
  const [cpu, setCpu] = useState(1);
  const [disk, setDisk] = useState(10);
  const [phase, setPhase] = useState<Phase>('browse');
  const [screen, setScreen] = useState<'pick' | 'config'>('pick');
  const [step, setStep] = useState(0);
  const [on, setOn] = useState(true);
  const [lines, setLines] = useState<Line[]>([]);
  const [cmd, setCmd] = useState('');
  const [series, setSeries] = useState<number[]>(() => Array.from({ length: 36 }, (_, i) => 30 + Math.sin(i / 3) * 6 + (i % 4)));
  const timers = useRef<number[]>([]);
  const box = useRef<HTMLDivElement>(null);
  const clear = () => { timers.current.forEach(clearTimeout); timers.current = []; };
  useEffect(() => clear, []);

  const sizes = useMemo(() => ALL_RAM.filter((m) => m >= app.mb).slice(0, 4), [app]);
  const price = priceOf(app, mb, cpu, disk);
  const shown = useTween(price);
  const list = APPS.filter((a) => (cat === 'All' || a.cat === cat) && (!q.trim() || `${a.name} ${a.cat}`.toLowerCase().includes(q.trim().toLowerCase())));

  const pick = (a: App) => {
    clear(); setPhase('browse'); setStep(0); setApp(a);
    const s = ALL_RAM.filter((m) => m >= a.mb);
    setMb(s[1] ?? s[0]); setCpu(1); setDisk(a.disk * 2);
    setScreen('config');
  };
  const log = (text: string, extra?: Partial<Line>) => setLines((l) => [...l.slice(-40), { t: stamp(), text, ...extra }]);
  const boot = () => {
    setLines([]);
    BOOT[app.cat].forEach((raw, i) => timers.current.push(window.setTimeout(() => log(raw.replace('ok|', ''), { ok: raw.startsWith('ok|') }), reduced ? 0 : 380 * (i + 1))));
  };
  const deploy = () => {
    clear(); setPhase('deploying'); setStep(0); setOn(true);
    STEPS.forEach((_, i) => timers.current.push(window.setTimeout(() => setStep(i + 1), (reduced ? 0 : 620) * (i + 1))));
    timers.current.push(window.setTimeout(() => { setPhase('running'); boot(); }, (reduced ? 0 : 620) * STEPS.length + 300));
  };
  const reset = () => { clear(); setPhase('browse'); setStep(0); setLines([]); setScreen('pick'); };

  useEffect(() => {
    if (phase !== 'running' || reduced) return;
    const id = setInterval(() => setSeries((c) => [...c.slice(1), on ? Math.max(6, Math.min(88, c[c.length - 1] + (Math.random() - 0.5) * 14)) : c[c.length - 1] * 0.6]), 900);
    return () => clearInterval(id);
  }, [phase, on, reduced]);
  useEffect(() => { box.current?.scrollTo({ top: box.current.scrollHeight }); }, [lines]);

  const power = (a: 'start' | 'restart' | 'stop') => {
    clear();
    if (a === 'stop') { setOn(false); log('Stopping… offline'); return; }
    setOn(true); if (a === 'restart') log('Restarting…'); boot();
  };
  const submit = (e: FormEvent) => {
    e.preventDefault();
    const raw = cmd.trim(); if (!raw) return;
    setCmd(''); log(raw, { me: true });
    const c = raw.split(/\s+/)[0];
    if (c === 'clear') return setLines([]);
    if (c === 'restart' || c === 'stop' || c === 'start') return power(c);
    if (!on) return log('Instance is offline. Type start.');
    if (c === 'help') return log('Commands: help, status, logs, restart, stop, clear');
    if (c === 'status') return log(`${slug(app.name)} · running · ${fmtMb(mb)} · ${cpu} vCPU`);
    if (c === 'logs') return log('Showing last 4 lines of output above');
    log(`Unknown command "${c}". Type help.`);
  };

  const now = Math.round(series[series.length - 1]);
  const path = series.map((v, i) => `${(i / (series.length - 1)) * 100},${100 - v}`).join(' ');
  const idx = phase === 'browse' ? (screen === 'config' || !mobile ? 1 : 0) : 2;
  const showList = phase === 'browse' && (!mobile || screen === 'pick');
  const showConfig = !mobile || (phase === 'browse' && screen === 'config');
  const showBar = mobile && !(phase === 'browse' && screen === 'pick');

  const catChips = (
    <div className="flex gap-1.5 overflow-x-auto pb-1 [scrollbar-width:none] lg:grid lg:overflow-visible lg:pb-0" role="group" aria-label="Categories">
      {CATEGORIES.map((c) => {
        const n = c === 'All' ? APPS.length : APPS.filter((a) => a.cat === c).length;
        return (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); }} className={cn('flex h-11 shrink-0 items-center justify-between gap-3 rounded-full px-4 text-[14px] font-bold transition-colors duration-[180ms] lg:h-10 lg:rounded-2xl', cat === c ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink lg:bg-transparent')}>
            {c}<span className="hidden font-mono text-[11.5px] opacity-60 lg:inline">{n}</span>
          </button>
        );
      })}
    </div>
  );

  const action = phase === 'browse'
    ? <Button full size="lg" icon="rocket" onClick={deploy}>Deploy {app.name}</Button>
    : phase === 'deploying' ? <Button full size="lg" disabled>Deploying…</Button>
    : <Button full size="lg" variant="soft" onClick={reset}>Start over</Button>;

  return (
    <div className="rounded-[28px] bg-acc-bg p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1.5">
        <ol className="flex items-center gap-1 font-mono text-[12px]" aria-label="Progress">
          {['Choose app', 'Configure', 'Deploy'].map((s, i) => {
            const done = i < idx || (phase === 'running' && i === 2);
            return (
              <li key={s} className={cn('flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-[180ms]', i === idx && !done ? 'bg-s1 text-ink' : done ? 'text-acc' : 'text-ink3')}>
                <span className={cn('grid size-5 place-items-center rounded-full text-[11px] font-bold', done ? 'bg-acc text-on-acc' : i === idx ? 'bg-acc text-on-acc' : 'bg-s1')}>{done ? <Icon name="check" size={11} /> : i + 1}</span>
                <span className={cn(i === idx || done ? '' : 'hidden sm:inline')}>{s}</span>
              </li>
            );
          })}
        </ol>
        <span className="font-mono text-[11.5px] text-ink3">sample</span>
      </div>

      <div className="grid gap-2.5 lg:grid-cols-[210px_minmax(0,1fr)_330px] lg:gap-3">
        {!mobile && <aside className="rounded-[22px] bg-s1 p-4"><p className="px-2 pb-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink3">Categories</p>{catChips}</aside>}

        <div className="min-w-0 rounded-[22px] bg-s1 p-3 sm:p-4 lg:min-h-[560px]">
          {showList && (
            <div className="bm-in grid gap-3">
              {mobile && catChips}
              <label className="flex h-12 items-center gap-2.5 rounded-full bg-s2 px-4 text-ink3 transition-colors duration-[180ms] focus-within:bg-s3">
                <Icon name="search" size={17} /><span className="sr-only">Search apps</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps and databases" className="min-w-0 flex-1 bg-transparent text-[15px] text-ink outline-none placeholder:text-ink3" />
                <span className="font-mono text-[11.5px]">{list.length}</span>
              </label>
              <div className="grid gap-2 lg:max-h-[440px] lg:grid-cols-2 lg:overflow-y-auto lg:pr-1" role="radiogroup" aria-label="App">
                {list.map((a) => {
                  const sel = !mobile && app.name === a.name;
                  return (
                    <button key={a.name} type="button" role="radio" aria-checked={sel} onClick={() => pick(a)} className={cn('flex items-center gap-3 rounded-2xl p-3 text-left transition-colors duration-[180ms] active:scale-[0.99]', sel ? 'bg-acc text-on-acc' : 'bg-s2 hover:bg-s3')}>
                      <AppMark icon={a.icon} size={44} tone={sel ? 'acc' : 'dark'} />
                      <span className="min-w-0 flex-1"><span className="block truncate text-[16px] font-extrabold leading-tight tracking-[-0.025em]">{a.name}</span><span className={cn('block truncate text-[12.5px]', sel ? 'opacity-70' : 'text-ink3')}>{minLabel(a)}</span></span>
                      <span className="font-mono text-[13px] font-medium">{eur(a.from)}</span>
                      {mobile && <Icon name="arrow" size={16} className="text-ink3" />}
                    </button>
                  );
                })}
                {!list.length && <p className="col-span-full rounded-2xl bg-s2 p-8 text-center text-ink2">No apps match.</p>}
              </div>
            </div>
          )}

          {phase === 'deploying' && (
            <div className="bm-in grid h-full content-center gap-5 py-6 sm:px-6 lg:py-10">
              <div className="flex items-center gap-3"><AppMark icon={app.icon} size={52} tone="lit" /><div><p className="text-[22px] font-extrabold tracking-[-0.04em]">Launching {slug(app.name)}…</p><p className="font-mono text-[12.5px] text-ink3">{fmtMb(mb)} · {cpu} vCPU · {disk} GB</p></div></div>
              <ul className="grid gap-2" aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn('flex items-center gap-3 rounded-2xl bg-s2 p-3.5 transition-opacity duration-[220ms]', step > i ? 'opacity-100' : 'opacity-50')}>
                    <span className={cn('grid size-6 place-items-center rounded-full', step > i ? 'bg-acc text-on-acc' : 'bg-s3')}>{step > i ? <Icon name="check" size={13} /> : step === i ? <span className="size-2 animate-pulse rounded-full bg-acc" /> : null}</span>
                    <span className="font-bold">{s}</span>
                  </li>
                ))}
              </ul>
              <div className="h-2 overflow-hidden rounded-full bg-s3"><i className="block h-full rounded-full bg-acc transition-[width] duration-[320ms]" style={{ width: `${(step / STEPS.length) * 100}%` }} /></div>
            </div>
          )}

          {phase === 'running' && (
            <div className="bm-in grid gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><AppMark icon={app.icon} size={46} tone="lit" /><div><p className="text-[20px] font-extrabold leading-tight tracking-[-0.04em]">{slug(app.name)}</p><p className={cn('flex items-center gap-1.5 font-mono text-[12.5px]', on ? 'text-acc' : 'text-ink3')}><StatusDot live={on} />{on ? 'online' : 'offline'}</p></div></div>
                <div className="flex gap-1.5" role="group" aria-label="Power controls">
                  {(['start', 'restart', 'stop'] as const).map((a) => <button key={a} type="button" disabled={(a === 'start' && on) || (a === 'stop' && !on)} onClick={() => power(a)} className="h-10 rounded-full bg-s2 px-4 text-[13.5px] font-bold capitalize transition-colors duration-[180ms] hover:bg-s3 disabled:opacity-40">{a}</button>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['CPU', `${on ? now : 0}%`, on ? now : 0], ['RAM', fmtMb(on ? Math.round(mb * 0.46) : 40), on ? 46 : 3], ['Disk', `${(disk * 0.31).toFixed(1)}G`, 31]] as const).map(([l, v, p]) => (
                  <div key={l} className="rounded-2xl bg-s2 p-3"><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{l}</p><p className="font-mono text-[19px] font-semibold tracking-[-0.03em] tabular-nums sm:text-[22px]">{v}</p><div className="mt-2 h-1.5 overflow-hidden rounded-full bg-s3"><i className="block h-full rounded-full bg-acc transition-[width] duration-[320ms]" style={{ width: `${p}%` }} /></div></div>
                ))}
              </div>
              <svg viewBox="0 0 100 100" preserveAspectRatio="none" className="h-20 w-full rounded-2xl bg-s2" role="img" aria-label={`CPU usage, currently ${on ? now : 0} percent`}><polyline points={`0,100 ${path} 100,100`} className="fill-acc/15" /><polyline points={path} fill="none" className="stroke-acc" strokeWidth="2" vectorEffect="non-scaling-stroke" strokeLinejoin="round" /></svg>
              <div className="rounded-2xl bg-con p-3.5 font-mono text-[12.5px]">
                <div ref={box} role="log" aria-live="polite" aria-label="Console" className="h-[120px] overflow-y-auto text-con-ink">
                  {lines.map((l, i) => <p key={i} className={cn(l.me && 'text-white', l.ok && 'text-acc')}><span className="text-ink3">{l.t}</span> {l.me && '> '}{l.text}</p>)}
                  <span className="bm-caret inline-block h-3 w-1.5 bg-ink2 align-middle" aria-hidden="true" />
                </div>
                <form onSubmit={submit} className="mt-2 flex items-center gap-2 rounded-xl bg-white/5 px-3"><span aria-hidden="true" className="text-acc">&gt;</span><input value={cmd} onChange={(e) => setCmd(e.target.value)} aria-label="Console command" placeholder="Type help" autoComplete="off" spellCheck={false} className="h-10 min-w-0 flex-1 bg-transparent text-[16px] text-white outline-none placeholder:text-ink3 lg:text-[12.5px]" /></form>
              </div>
            </div>
          )}
        </div>

        {showConfig && (
          <aside className="rounded-[22px] bg-s1 p-4 sm:p-5">
            {mobile && <button type="button" onClick={() => setScreen('pick')} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-s2 pl-3 pr-4 text-[14px] font-bold"><Icon name="arrow" size={15} className="rotate-180" />All apps</button>}
            <div className="flex items-center gap-3"><AppMark icon={app.icon} size={48} tone="lit" /><div className="min-w-0"><p className="truncate text-[22px] font-extrabold leading-tight tracking-[-0.04em]">{app.name}</p><p className="font-mono text-[12px] text-ink3">{app.cat}</p></div></div>
            <p className="mt-3 text-[14.5px] text-ink2">{app.blurb}</p>
            <fieldset disabled={phase !== 'browse'} className="mt-5 grid gap-5 disabled:opacity-60">
              <div><p className="mb-2 text-[13px] font-bold">Memory</p><div className="grid grid-cols-4 gap-1.5">{sizes.map((s) => <button key={s} type="button" aria-pressed={mb === s} onClick={() => setMb(s)} className={pill(mb === s)}>{fmtMb(s)}</button>)}</div></div>
              <div><p className="mb-2 text-[13px] font-bold">CPU <span className="font-mono font-normal text-ink3">vCPU</span></p><div className="grid grid-cols-4 gap-1.5">{[1, 2, 4, 8].map((c) => <button key={c} type="button" aria-pressed={cpu === c} onClick={() => setCpu(c)} className={pill(cpu === c)}>{c}</button>)}</div></div>
              <div><label htmlFor="studio-disk" className="mb-3 flex justify-between text-[13px] font-bold">Storage<span className="font-mono font-medium text-acc">{disk} GB</span></label><input id="studio-disk" type="range" min={app.disk} max={100} step={5} value={disk} onChange={(e) => setDisk(+e.target.value)} className="h-2 w-full cursor-pointer appearance-none rounded-full bg-s3 accent-acc [&::-webkit-slider-thumb]:size-6 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-s1 [&::-webkit-slider-thumb]:bg-acc [&::-moz-range-thumb]:size-5 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-s1 [&::-moz-range-thumb]:bg-acc" /></div>
            </fieldset>
            {!mobile && (
              <>
                <div className="mt-6 flex items-end justify-between rounded-2xl bg-s2 p-4"><span className="text-[13px] text-ink2">Per month</span><span className="font-mono text-[34px] font-semibold leading-none tracking-[-0.045em] tabular-nums">{eur(shown)}</span></div>
                <div className="mt-3">{action}</div>
              </>
            )}
            <p className="mt-3 text-[12px] text-ink3">Simulated preview. Nothing is created or billed. Prices are illustrative.</p>
          </aside>
        )}

        {showBar && (
          <div className="sticky bottom-3 z-10 grid grid-cols-[auto_1fr] items-center gap-3 rounded-[22px] bg-s3 p-2.5 pl-5">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p><p className="font-mono text-[24px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{eur(shown)}</p></div>
            {action}
          </div>
        )}
      </div>
    </div>
  );
}

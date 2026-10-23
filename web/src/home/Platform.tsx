import { useEffect, useState, type ReactNode } from 'react';
import { Icon, type IconName } from '../icons';
import { cn, eur, useInView, useReducedMotion, useTween } from '../lib';
import { Eyebrow, Headline, Wrap } from '../ui';

function Tile({ icon, title, text, className, children, delay = 0 }: { icon: IconName; title: string; text: string; className?: string; children: (seen: boolean) => ReactNode; delay?: number }) {
  const [ref, seen] = useInView<HTMLDivElement>('0px 0px -8% 0px');
  return (
    <div ref={ref} data-in={seen ? '' : undefined} style={{ '--d': delay } as React.CSSProperties} className={cn('rv grid min-w-0 content-between gap-6 rounded-[28px] bg-s1 p-6 sm:p-7', className)}>
      <div className="grid gap-3">
        <span className="grid size-11 place-items-center rounded-2xl bg-s3 text-acc"><Icon name={icon} size={20} /></span>
        <div><p className="text-[clamp(26px,2.6vw,34px)] font-extrabold leading-none tracking-[-0.055em]">{title}</p><p className="mt-2 max-w-sm text-[15px] text-ink2">{text}</p></div>
      </div>
      {/* The mock is a picture, not a text: it is clipped so that a long line
          never asks the page to be wider than the screen. */}
      <div aria-hidden="true" className="min-w-0 overflow-hidden">{children(seen)}</div>
    </div>
  );
}

const LOGS = ['[wordpress] GET /wp-admin 200', '[postgres] checkpoint complete', '[wordpress] cron event run', '[kuma] monitor #2 up', '[postgres] connection received', '[wordpress] cache warmed', '[kuma] notification sent'];
function Logs({ seen }: { seen: boolean }) {
  const reduced = useReducedMotion();
  const [n, setN] = useState(4);
  useEffect(() => {
    if (!seen || reduced) return;
    const id = setInterval(() => setN((x) => x + 1), 1100);
    return () => clearInterval(id);
  }, [seen, reduced]);
  const rows = Array.from({ length: 5 }, (_, i) => n - 4 + i);
  return (
    <div className="overflow-hidden rounded-2xl bg-con p-3.5 font-mono text-[12.5px] leading-[1.9] text-con-ink">
      {rows.map((k) => { const l = LOGS[k % LOGS.length]; const j = l.indexOf(']') + 1; return <p key={k} className="bm-in truncate"><span className="text-ink3">12:{String(10 + (k % 50)).padStart(2, '0')}:{String((k * 7) % 60).padStart(2, '0')}</span> <span className="text-acc">{l.slice(0, j)}</span>{l.slice(j)}</p>; })}
    </div>
  );
}

function Files() {
  const rows: [string, string, boolean][] = [['wp-content/', '—', true], ['uploads/', '412 MB', true], ['themes/', '38 MB', true], ['wp-config.php', '3 KB', false], ['.htaccess', '1 KB', false]];
  return (
    <div className="rounded-2xl bg-s2 p-1.5 font-mono text-[12.5px]">
      {rows.map(([n, s, d]) => <div key={n} className={cn('flex items-center justify-between rounded-xl px-3 py-2.5', n === 'wp-config.php' && 'bg-s3')}><span className="flex items-center gap-2.5"><Icon name={d ? 'folder' : 'doc'} size={15} className={d ? 'text-acc' : 'text-ink3'} />{n}</span><span className="text-ink3">{s}</span></div>)}
    </div>
  );
}

function Domains({ seen }: { seen: boolean }) {
  const [k, setK] = useState(0);
  useEffect(() => {
    if (!seen) return;
    const ids = [1, 2, 3].map((i) => window.setTimeout(() => setK(i), 600 * i));
    return () => ids.forEach(clearTimeout);
  }, [seen]);
  return (
    <div className="grid gap-2">
      <div className="flex h-12 items-center rounded-full bg-s2 px-4 font-mono text-[13px]">shop.example.com</div>
      {['DNS record found', 'SSL certificate issued', 'Domain connected'].map((s, i) => (
        <p key={s} className={cn('flex items-center gap-2.5 text-[13.5px] transition-colors duration-[220ms]', k > i ? 'text-ink' : 'text-ink3')}><span className={cn('grid size-4.5 place-items-center rounded-full', k > i ? 'bg-acc text-on-acc' : 'bg-s3')} style={{ width: 18, height: 18 }}>{k > i && <Icon name="check" size={11} />}</span>{s}</p>
      ))}
    </div>
  );
}

function Usage({ seen }: { seen: boolean }) {
  const bars = [34, 40, 38, 52, 47, 60, 44, 58, 66, 49, 54, 72, 61, 57];
  return (
    <div>
      <div className="flex h-24 items-end gap-1.5">{bars.map((h, i) => <i key={i} className="w-full rounded-sm bg-acc transition-[height] duration-[320ms]" style={{ height: seen ? `${h}%` : '4%', opacity: 0.35 + (i / bars.length) * 0.65, transitionDelay: `${i * 25}ms` }} />)}</div>
      <div className="mt-2 flex justify-between font-mono text-[11.5px] text-ink3"><span>14 days ago</span><span>RAM usage · today</span></div>
    </div>
  );
}

function Upgrade() {
  const [big, setBig] = useState(false);
  const price = useTween(big ? 3.89 : 1.49);
  const ram = big ? 100 : 25;
  return (
    <div className="grid gap-3">
      <div className="flex flex-wrap items-end justify-between gap-2"><div className="min-w-0"><p className="font-mono text-[12px] text-ink3">wordpress</p><p className="font-mono text-[15px]">{big ? '2 GB · 2 vCPU' : '512 MB · 1 vCPU'}</p></div><p className="font-mono text-[28px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{eur(price)}</p></div>
      <div className="h-2.5 overflow-hidden rounded-full bg-s3"><i className="block h-full rounded-full bg-acc transition-[width] duration-[320ms]" style={{ width: `${ram}%` }} /></div>
      <button type="button" onClick={() => setBig(!big)} className="h-12 rounded-full bg-s3 text-[14.5px] font-bold transition-colors duration-[180ms] hover:bg-acc hover:text-on-acc">{big ? 'Scale back down' : 'Upgrade in place'}</button>
    </div>
  );
}

function Billing() {
  const rows: [string, string][] = [['WordPress · 1 GB', '€2.09'], ['PostgreSQL · 1 GB · 5 GB', '€4.49'], ['Uptime Kuma · 256 MB', '€1.49']];
  return (
    <div className="rounded-2xl bg-s2 p-1.5 font-mono text-[13px]">
      {rows.map(([n, p]) => <div key={n} className="flex justify-between rounded-xl px-3 py-2.5 odd:bg-s3/60"><span className="text-ink2">{n}</span><span>{p}</span></div>)}
      <div className="mt-1 flex justify-between rounded-xl bg-acc px-3 py-3 font-semibold text-on-acc"><span>Next invoice</span><span>€8.07</span></div>
    </div>
  );
}

export function Platform() {
  return (
    <section id="product" className="scroll-mt-24 py-16 sm:py-28">
      <Wrap>
        <div className="mb-10 grid max-w-2xl gap-4">
          <Eyebrow>Product</Eyebrow>
          <Headline lines={['One place to', 'run everything.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" />
          <p className="text-[18px] text-ink2">Status, logs, files, domains, usage and billing for every app and database, in a single dashboard.</p>
        </div>
        <div className="grid grid-cols-[minmax(0,1fr)] gap-3.5 lg:grid-cols-6">
          <Tile icon="term" title="Live logs" text="See what your app prints, as it prints it." className="lg:col-span-4" delay={0}>{(s) => <Logs seen={s} />}</Tile>
          <Tile icon="folder" title="Files" text="Browse and edit what is on disk." className="lg:col-span-2" delay={60}>{() => <Files />}</Tile>
          <Tile icon="globe" title="Domains" text="Point a domain, get SSL." className="lg:col-span-2" delay={0}>{(s) => <Domains seen={s} />}</Tile>
          <Tile icon="chart" title="Usage" text="Know what you use before it becomes a problem." className="lg:col-span-2" delay={60}>{(s) => <Usage seen={s} />}</Tile>
          <Tile icon="rocket" title="Upgrade without migrating" text="Change resources from the dashboard." className="lg:col-span-2" delay={120}>{() => <Upgrade />}</Tile>
          <Tile icon="card" title="Billing you can read" text="What you run is what you pay. Per instance, per month." className="lg:col-span-6 lg:grid-cols-[1fr_1.2fr] lg:items-center lg:gap-10 lg:[&>div:last-child]:max-w-lg lg:[&>div:last-child]:justify-self-end lg:[&>div:last-child]:w-full" delay={0}>{() => <Billing />}</Tile>
        </div>
        <p className="mt-3 text-[12.5px] text-ink3">Interactive concept with sample data. Replaced by real dashboard screenshots at launch.</p>
      </Wrap>
    </section>
  );
}

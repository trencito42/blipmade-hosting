import { useEffect, useMemo, useRef, useState, type FormEvent } from 'react';
import { CATEGORIES, type Category } from '../data';
import { api, get, type CatalogProduct, type Quote } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { Icon } from '../icons';
import { cn, useMediaQuery, useReducedMotion } from '../lib';
import { AppMark, Button, StatusDot, rangeInput } from '../ui';
import { ScrollRow } from '../ui-app';
import { categoryCode, categoryLabel, formatPrice, memLabel, periodSuffix, productIcon } from '../lib/pricing';
import {
  availabilityLabel,
  cpuOptions,
  deployPathFor,
  diskOptions,
  isOrderable,
  orderBlockers,
  ramOptions,
  recommendedPreset,
  recommendedPrice,
  startingConfiguration,
  startingPrice,
  type ResourceConfiguration,
} from '../lib/pricing-contract';
import { useSession } from '../session';

/**
 * The simulator on the homepage.
 *
 * Everything it shows comes from the catalog of the platform: the products,
 * the prices and the availability. A product that cannot be deployed is shown
 * with the state the server gives it and gets no deploy action. The deploy
 * action of a product that can be deployed leads to the real deploy flow, and
 * the simulator itself is a preview: nothing is created and nothing is billed.
 */

type Phase = 'browse' | 'previewing' | 'running';
const STEPS = ['Pulling image', 'Allocating resources', 'Starting container', 'Health check'];
const BOOT: Record<string, string[]> = {
  WEB_CMS: ['Starting web server', 'Loading configuration', 'ok|Site is up', 'Listening on :80'],
  DEVELOPER_TOOLS: ['Starting service', 'Loading configuration', 'ok|Service is up', 'Listening on :3000'],
  MONITORING: ['Starting service', 'Loading monitors', 'ok|Dashboard is up', 'Listening on :3001'],
  AUTOMATION: ['Starting runtime', 'Loading workflows', 'ok|Editor is up', 'Listening on :5678'],
  BOTS: ['Installing dependencies', 'Starting index.js', 'ok|Logged in', 'Listening for events'],
  DATABASES: ['Initializing data directory', 'Starting server', 'ok|Database system is ready', 'Accepting connections'],
};
const stamp = () => new Date().toTimeString().slice(0, 8);
type Line = { t: string; text: string; ok?: boolean; me?: boolean };
const pill = (on: boolean) => cn('h-11 whitespace-nowrap rounded-full px-3 text-[13.5px] font-bold transition-colors duration-[180ms] lg:h-10', on ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink');

export function Studio({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  const reduced = useReducedMotion();
  const mobile = useMediaQuery('(max-width: 1023px)');
  const { user, loading: sessionLoading } = useSession();

  // The catalog of the platform, never a list written in this file.
  const state = useAsync<{ products: CatalogProduct[] }>((signal) =>
    get<{ products: CatalogProduct[] }>('/catalog/products', undefined, signal),
  );
  const products = state.data?.products ?? [];
  const loading = state.loading && !state.error;
  const failed = Boolean(state.error);

  const [q, setQ] = useState('');
  const [selectedSlug, setSelectedSlug] = useState<string | null>(null);
  const [picked, setPicked] = useState<{ slug: string; config: ResourceConfiguration } | null>(null);
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

  const product = useMemo(
    () => products.find((entry) => entry.slug === selectedSlug) ?? products[0] ?? null,
    [products, selectedSlug],
  );

  // The configuration of the preview. It starts at the configuration the
  // starting price is the price of, so the control and the price agree.
  const config = useMemo<ResourceConfiguration | null>(() => {
    if (!product) return null;
    if (picked?.slug === product.slug) return picked.config;
    return startingConfiguration(product);
  }, [product, picked]);

  const orderable = product ? isOrderable(product) : false;
  const currency = product?.price?.currency ?? 'EUR';
  const period = product?.price?.period ?? 'MONTHLY';

  const ramChoices = useMemo(() => (product ? ramOptions(product) : []), [product]);
  const cpuChoices = useMemo(() => (product ? cpuOptions(product) : []), [product]);
  const diskChoices = useMemo(() => (product ? diskOptions(product) : []), [product]);

  // The price of the configuration on the screen comes from the server, with
  // the same endpoint the real configurator uses.
  const quoteState = useAsync<Quote | null>(async (signal) => {
    if (!product || !orderable || !config) return null;
    return api<Quote>('/catalog/quote', {
      method: 'POST',
      body: {
        items: [
          {
            productSlug: product.slug,
            ram: config.ram,
            cpu: config.cpu,
            disk: config.disk,
            optionCodes: [],
          },
        ],
      },
      signal,
    });
  }, [product?.slug, config?.ram, config?.cpu, config?.disk, orderable]);

  const quote = quoteState.data ?? null;
  // A quote that belongs to another configuration is not shown.
  const quoted = Boolean(
    quote &&
      config &&
      product &&
      quote.items[0]?.productSlug === product.slug &&
      quote.items[0]?.ram === config.ram &&
      quote.items[0]?.cpu === config.cpu &&
      quote.items[0]?.disk === config.disk,
  );

  const start = product ? startingConfiguration(product) : null;
  const startAmount = product ? startingPrice(product) : null;
  const recommendation = product ? recommendedPreset(product) : null;
  const recommendationAmount = product ? recommendedPrice(product) : null;

  const needle = q.trim().toLowerCase();
  const list = useMemo(
    () =>
      products.filter((entry) => {
        if (cat !== 'All' && entry.category !== categoryCode(cat)) return false;
        if (!needle) return true;
        return `${entry.name} ${categoryLabel(entry.category)} ${entry.description}`.toLowerCase().includes(needle);
      }),
    [products, cat, needle],
  );

  const pick = (entry: CatalogProduct) => {
    clear(); setPhase('browse'); setStep(0); setLines([]);
    setSelectedSlug(entry.slug);
    setPicked(null);
    setScreen('config');
  };

  const setConfig = (next: Partial<ResourceConfiguration>) => {
    if (!product || !config) return;
    setPicked({ slug: product.slug, config: { ...config, ...next } });
  };

  const log = (text: string, extra?: Partial<Line>) => setLines((l) => [...l.slice(-40), { t: stamp(), text, ...extra }]);
  const boot = () => {
    setLines([]);
    const lines = BOOT[product?.category ?? ''] ?? ['Starting service', 'ok|Service is up'];
    lines.forEach((raw, i) => timers.current.push(window.setTimeout(() => log(raw.replace('ok|', ''), { ok: raw.startsWith('ok|') }), reduced ? 0 : 380 * (i + 1))));
  };

  // The preview of a start-up. It runs in the page only: nothing is created.
  const preview = () => {
    if (!product) return;
    clear(); setPhase('previewing'); setStep(0); setOn(true);
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
    if (c === 'status') return log(`${product?.slug ?? ''} · running · ${memLabel(config?.ram ?? 0)} · ${config?.cpu ?? 0} vCPU`);
    if (c === 'logs') return log('Showing last 4 lines of output above');
    log(`Unknown command "${c}". Type help.`);
  };

  const now = Math.round(series[series.length - 1]);
  const path = series.map((v, i) => `${(i / (series.length - 1)) * 100},${100 - v}`).join(' ');
  const idx = phase === 'browse' ? (screen === 'config' || !mobile ? 1 : 0) : 2;
  const showList = phase === 'browse' && (!mobile || screen === 'pick');
  const showConfig = !mobile || (phase === 'browse' && screen === 'config');
  const showBar = mobile && !(phase === 'browse' && screen === 'pick');

  // The deploy action leads to the real deploy flow, with the configuration
  // the visitor chose. A visitor without a session is sent to the login with
  // the same path.
  const deployTarget = product && config ? deployPathFor(product.slug, config) : '';
  const deployHref = user || sessionLoading ? deployTarget : `/login?next=${encodeURIComponent(deployTarget)}`;

  const catChips = (
    // The chips scroll sideways on a phone and the edge fades, so it is clear
    // that there are more categories to the side.
    <ScrollRow
      label="Categories"
      surface="s1"
      innerClassName="gap-1.5 pb-1 lg:grid lg:grid-cols-1 lg:overflow-visible lg:pb-0"
    >
      {CATEGORIES.map((c) => {
        const n = c === 'All' ? products.length : products.filter((entry) => entry.category === categoryCode(c)).length;
        return (
          <button key={c} type="button" aria-pressed={cat === c} onClick={() => { setCat(c); }} className={cn('flex h-11 shrink-0 items-center justify-between gap-3 rounded-full px-4 text-[14px] font-bold transition-colors duration-[180ms] lg:h-10 lg:rounded-2xl', cat === c ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink lg:bg-transparent')}>
            {c}<span className="hidden font-mono text-[11.5px] opacity-60 lg:inline">{n}</span>
          </button>
        );
      })}
    </ScrollRow>
  );

  // The price on the screen is the price of the configuration on the screen.
  // While the server is answering, the panel does not show another amount.
  const priceText = orderable
    ? quoted
      ? formatPrice(quote!.total, quote!.currency)
      : quoteState.error
        ? '—'
        : '…'
    : startAmount !== null
      ? formatPrice(startAmount, currency)
      : '—';

  const action = phase === 'browse'
    ? orderable
      ? <Button to={deployHref} full size="lg" icon="rocket">Deploy {product?.name}</Button>
      : null
    : phase === 'previewing'
      ? <Button full size="lg" disabled>Previewing…</Button>
      : <Button full size="lg" variant="soft" onClick={reset}>Start over</Button>;

  return (
    <div className="rounded-[28px] bg-acc-bg p-2.5 sm:p-3">
      <div className="flex items-center justify-between gap-3 px-2 pb-3 pt-1.5">
        <ol className="flex items-center gap-1 font-mono text-[12px]" aria-label="Progress">
          {['Choose app', 'Configure', 'Preview'].map((s, i) => {
            const done = i < idx || (phase === 'running' && i === 2);
            return (
              <li key={s} className={cn('flex items-center gap-1.5 rounded-full py-1 pl-1 pr-2.5 transition-colors duration-[180ms]', i === idx && !done ? 'bg-s1 text-ink' : done ? 'text-acc' : 'text-ink3')}>
                <span className={cn('grid size-5 place-items-center rounded-full text-[11px] font-bold', done ? 'bg-acc text-on-acc' : i === idx ? 'bg-acc text-on-acc' : 'bg-s1')}>{done ? <Icon name="check" size={11} /> : i + 1}</span>
                <span className={cn(i === idx || done ? '' : 'hidden sm:inline')}>{s}</span>
              </li>
            );
          })}
        </ol>
        <span className="inline-flex items-center gap-1.5 rounded-full bg-acc px-3 py-1.5 text-[13px] font-extrabold tracking-[-0.01em] text-on-acc">
          Preview
        </span>
      </div>

      <div className="grid grid-cols-[minmax(0,1fr)] gap-2.5 lg:grid-cols-[210px_minmax(0,1fr)_330px] lg:gap-3">
        {!mobile && <aside className="rounded-[22px] bg-s1 p-4"><p className="px-2 pb-2 font-mono text-[11.5px] uppercase tracking-[0.1em] text-ink3">Categories</p>{catChips}</aside>}

        <div className="min-w-0 rounded-[22px] bg-s1 p-3 sm:p-4 lg:min-h-[560px]">
          {failed ? (
            <div role="alert" className="grid h-full content-center gap-3 p-6 text-center sm:p-10">
              <p className="text-[17px] font-extrabold tracking-[-0.02em]">The catalog could not be loaded.</p>
              <p className="text-[14.5px] text-ink2">{state.error?.message ?? 'Something went wrong while loading the catalog.'}</p>
              <div className="flex justify-center pt-1"><Button onClick={state.reload}>Try again</Button></div>
            </div>
          ) : loading ? (
            <div className="grid gap-2 lg:grid-cols-2" aria-busy="true" aria-live="polite">
              {Array.from({ length: 6 }, (_, i) => (
                <div key={i} aria-hidden="true" className="h-[74px] animate-pulse rounded-2xl bg-s2" />
              ))}
            </div>
          ) : showList ? (
            <div className="bm-in grid gap-3">
              {mobile && catChips}
              <label className="flex h-12 items-center gap-2.5 rounded-full bg-s2 px-4 text-ink3 transition-colors duration-[180ms] focus-within:bg-s3">
                <Icon name="search" size={17} /><span className="sr-only">Search apps</span>
                <input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps and databases" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3 lg:text-[15px]" />
                <span className="font-mono text-[11.5px]">{list.length}</span>
              </label>
              <div className="grid grid-cols-[minmax(0,1fr)] gap-2 lg:max-h-[440px] lg:grid-cols-2 lg:overflow-y-auto lg:pr-1" role="radiogroup" aria-label="App">
                {list.map((entry) => {
                  const sel = !mobile && product?.slug === entry.slug;
                  const deployable = isOrderable(entry);
                  const amount = startingPrice(entry);
                  return (
                    <button key={entry.slug} type="button" role="radio" aria-checked={sel} onClick={() => pick(entry)} className={cn('flex min-w-0 flex-wrap items-center gap-3 overflow-hidden rounded-2xl p-3 text-left transition-colors duration-[180ms] active:scale-[0.99]', sel ? 'bg-acc text-on-acc' : 'bg-s2 hover:bg-s3')}>
                      <AppMark icon={productIcon(entry.icon)} size={44} tone={sel ? 'acc' : 'dark'} />
                      <span className="w-0 min-w-0 flex-1"><span className="block line-clamp-1 text-[16px] font-extrabold leading-tight tracking-[-0.025em]">{entry.name}</span><span className={cn('block line-clamp-1 text-[12.5px]', sel ? 'opacity-70' : 'text-ink3')}>Min. {memLabel(entry.minRam)} · {entry.minDisk} GB disk</span></span>
                      <span className="flex shrink-0 flex-col items-end gap-1">
                        <span className="font-mono text-[13px] font-medium">
                          {amount === null
                            ? 'Not priced'
                            : `${formatPrice(amount, entry.price?.currency ?? 'EUR')}${periodSuffix(entry.price?.period ?? 'MONTHLY')}`}
                        </span>
                        {!deployable && <span className={cn('rounded-full px-2 py-0.5 font-mono text-[10.5px]', sel ? 'bg-on-acc/20 text-on-acc' : 'bg-s3 text-ink2')}>{availabilityLabel(entry)}</span>}
                      </span>
                      {mobile && <Icon name="arrow" size={16} className="text-ink3" />}
                    </button>
                  );
                })}
                {!list.length && (
                  <p className="col-span-full rounded-2xl bg-s2 p-8 text-center text-ink2">
                    {products.length ? 'No apps match your search.' : 'The catalog is empty right now. Please check back later.'}
                  </p>
                )}
              </div>
            </div>
          ) : null}

          {phase === 'previewing' && product && (
            <div className="bm-in grid h-full content-center gap-5 py-6 sm:px-6 lg:py-10">
              <div className="flex items-center gap-3"><AppMark icon={productIcon(product.icon)} size={52} tone="lit" /><div><p className="text-[22px] font-extrabold tracking-[-0.04em]">Previewing {product.slug}…</p><p className="font-mono text-[12.5px] text-ink3">{config ? `${memLabel(config.ram)} · ${config.cpu} vCPU · ${config.disk} GB` : ''}</p></div></div>
              <ul className="grid gap-2" aria-live="polite">
                {STEPS.map((s, i) => (
                  <li key={s} className={cn('flex items-center gap-3 rounded-2xl bg-s2 p-3.5 transition-opacity duration-[220ms]', step > i ? 'opacity-100' : 'opacity-50')}>
                    <span className={cn('grid size-6 place-items-center rounded-full', step > i ? 'bg-acc text-on-acc' : 'bg-s3')}>{step > i ? <Icon name="check" size={13} /> : step === i ? <span className="size-2 animate-pulse rounded-full bg-acc" /> : null}</span>
                    <span className="font-bold">{s}</span>
                  </li>
                ))}
              </ul>
              <div className="h-2 overflow-hidden rounded-full bg-s3"><i className="block h-full rounded-full bg-acc transition-[width] duration-[320ms]" style={{ width: `${(step / STEPS.length) * 100}%` }} /></div>
              <p className="text-[13px] text-ink2">This is a preview. Nothing is created and nothing is billed.</p>
            </div>
          )}

          {phase === 'running' && product && (
            <div className="bm-in grid gap-2.5">
              <div className="flex flex-wrap items-center justify-between gap-3">
                <div className="flex items-center gap-3"><AppMark icon={productIcon(product.icon)} size={46} tone="lit" /><div><p className="text-[20px] font-extrabold leading-tight tracking-[-0.04em]">{product.slug}</p><p className={cn('flex items-center gap-1.5 font-mono text-[12.5px]', on ? 'text-acc' : 'text-ink3')}><StatusDot live={on} />{on ? 'preview online' : 'preview offline'}</p></div></div>
                <div className="flex gap-1.5" role="group" aria-label="Power controls">
                  {(['start', 'restart', 'stop'] as const).map((a) => <button key={a} type="button" disabled={(a === 'start' && on) || (a === 'stop' && !on)} onClick={() => power(a)} className="h-11 rounded-full bg-s2 px-4 text-[13.5px] font-bold capitalize transition-colors duration-[180ms] hover:bg-s3 disabled:opacity-40">{a}</button>)}
                </div>
              </div>
              <div className="grid grid-cols-3 gap-2">
                {([['CPU', `${on ? now : 0}%`, on ? now : 0], ['RAM', memLabel(on ? Math.round((config?.ram ?? 0) * 0.46) : 40), on ? 46 : 3], ['Disk', `${((config?.disk ?? 0) * 0.31).toFixed(1)}G`, 31]] as const).map(([l, v, p]) => (
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
              <p className="text-[13px] text-ink2">This is a preview. Nothing is created and nothing is billed.</p>
            </div>
          )}
        </div>

        {showConfig && (
          <aside className="rounded-[22px] bg-s1 p-4 sm:p-5">
            {mobile && <button type="button" onClick={() => setScreen('pick')} className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-full bg-s2 pl-3 pr-4 text-[14px] font-bold"><Icon name="arrow" size={15} className="rotate-180" />All apps</button>}
            {product ? (
              <>
                <div className="flex items-center gap-3"><AppMark icon={productIcon(product.icon)} size={48} tone="lit" /><div className="min-w-0"><p className="truncate text-[22px] font-extrabold leading-tight tracking-[-0.04em]">{product.name}</p><p className="font-mono text-[12px] text-ink3">{categoryLabel(product.category)}</p></div></div>
                <p className="mt-3 text-[14.5px] text-ink2">{product.description}</p>

                {!orderable && (
                  <div className="mt-4 rounded-2xl bg-s2 p-4">
                    <p className="text-[14px] font-bold">{availabilityLabel(product)}</p>
                    {orderBlockers(product).length > 0 && <p className="mt-1 text-[13px] leading-relaxed text-ink2">{orderBlockers(product).join(' ')}</p>}
                  </div>
                )}

                {orderable && config && (
                  <fieldset disabled={phase !== 'browse'} className="mt-5 grid gap-5 disabled:opacity-60">
                    <div><p className="mb-2 text-[13px] font-bold">Memory</p><div className="grid grid-cols-2 gap-2 sm:grid-cols-4">{ramChoices.map((value) => <button key={value} type="button" aria-pressed={config.ram === value} onClick={() => setConfig({ ram: value })} className={pill(config.ram === value)}>{memLabel(value)}</button>)}</div></div>
                    <div><p className="mb-2 text-[13px] font-bold">CPU <span className="font-mono font-normal text-ink3">vCPU</span></p><div className="grid grid-cols-4 gap-2">{cpuChoices.map((value) => <button key={value} type="button" aria-pressed={config.cpu === value} onClick={() => setConfig({ cpu: value })} className={pill(config.cpu === value)}>{value}</button>)}</div></div>
                    <div><label htmlFor="studio-disk" className="mb-3 flex justify-between text-[13px] font-bold">Storage<span className="font-mono font-medium text-acc">{config.disk} GB</span></label><input id="studio-disk" type="range" min={0} max={Math.max(0, diskChoices.length - 1)} step={1} value={Math.max(0, diskChoices.indexOf(config.disk))} aria-valuetext={`${config.disk} GB`} onChange={(e) => setConfig({ disk: diskChoices[Number(e.target.value)] ?? config.disk })} className={rangeInput} /></div>
                  </fieldset>
                )}

                {!mobile && (
                  <>
                    <div className="mt-6 flex items-end justify-between rounded-2xl bg-s2 p-4">
                      <span className="text-[13px] text-ink2">{orderable ? 'Per month' : 'From'}</span>
                      <span className="font-mono text-[34px] font-semibold leading-none tracking-[-0.045em] tabular-nums">
                        {priceText}
                        {orderable && quoted ? <span className="text-[16px] font-medium text-ink3">{periodSuffix(period)}</span> : null}
                      </span>
                    </div>
                    {/* The price always names the configuration it is the price
                        of. Nothing is priced in the page. */}
                    {config && orderable && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">
                        {memLabel(config.ram)} · {config.cpu} vCPU · {config.disk} GB disk, priced by the server.
                      </p>
                    )}
                    {start && startAmount !== null && !orderable && (
                      <p className="mt-2 text-[12.5px] leading-relaxed text-ink3">
                        The price of the smallest configuration: {memLabel(start.ram)} · {start.cpu} vCPU · {start.disk} GB disk.
                      </p>
                    )}
                    {recommendation && recommendationAmount !== null && orderable && (
                      <p className="mt-1 text-[12.5px] leading-relaxed text-ink3">
                        Recommended configuration: {memLabel(recommendation.ram)} · {recommendation.cpu} vCPU · {recommendation.disk} GB disk — {formatPrice(recommendationAmount, currency)}{periodSuffix(period)}.
                      </p>
                    )}
                    <div className="mt-3">{action}</div>
                    {phase === 'browse' && orderable && (
                      <div className="mt-2">
                        <Button full size="lg" variant="soft" onClick={preview}>Preview the start-up</Button>
                      </div>
                    )}
                    {/* The simulator never deploys anything: the deploy
                        action opens the real configurator. */}
                    <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
                      A preview. Nothing is created or billed here, and every price comes from the server.
                    </p>
                  </>
                )}
                {mobile && !orderable && (
                  <div className="mt-4">
                    <p className="text-[13px] text-ink2">From <span className="font-mono font-medium text-ink">{priceText}{periodSuffix(period)}</span> for the smallest configuration.</p>
                  </div>
                )}
                {mobile && orderable && phase === 'browse' && (
                  <div className="mt-4">
                    <Button full size="lg" variant="soft" onClick={preview}>Preview the start-up</Button>
                    <p className="mt-3 text-[12.5px] leading-relaxed text-ink3">
                      A preview. Nothing is created or billed here, and every price comes from the server.
                    </p>
                  </div>
                )}
              </>
            ) : (
              <p className="text-[14.5px] text-ink2">
                {failed ? 'The catalog could not be loaded.' : 'No product to show.'}
              </p>
            )}
          </aside>
        )}

        {showBar && (
          <div className="sticky bottom-3 z-10 grid grid-cols-[auto_1fr] items-center gap-3 rounded-[22px] bg-s3 p-2.5 pl-5">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">{orderable ? 'Per month' : 'From'}</p><p className="font-mono text-[24px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{priceText}</p></div>
            {action ?? (product ? <span className="text-[13.5px] font-bold text-ink2">{availabilityLabel(product)}</span> : null)}
          </div>
        )}
      </div>
    </div>
  );
}

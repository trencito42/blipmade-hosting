import { useState } from 'react';
import { eur, cn, useTween } from '../lib';
import { Button, Eyebrow, Headline, Reveal, Wrap } from '../ui';
import { scrollToId } from '../router';

const RAM = [512, 1024, 2048, 3072, 4096, 6144, 8192];
const fmtRam = (m: number) => (m < 1024 ? `${m} MB` : `${m / 1024} GB`);
const PRESETS = [{ n: 'Starter', r: 0, c: 1, d: 5 }, { n: 'Standard', r: 2, c: 2, d: 30 }, { n: 'Large', r: 4, c: 4, d: 80 }];
const range = 'h-2 w-full cursor-pointer appearance-none rounded-full bg-s3 accent-acc [&::-webkit-slider-thumb]:size-7 [&::-webkit-slider-thumb]:appearance-none [&::-webkit-slider-thumb]:rounded-full [&::-webkit-slider-thumb]:border-4 [&::-webkit-slider-thumb]:border-s1 [&::-webkit-slider-thumb]:bg-acc [&::-moz-range-thumb]:size-6 [&::-moz-range-thumb]:rounded-full [&::-moz-range-thumb]:border-4 [&::-moz-range-thumb]:border-s1 [&::-moz-range-thumb]:bg-acc';

function Slider({ id, label, value, display, min, max, step, lo, hi, onChange }: { id: string; label: string; value: number; display: string; min: number; max: number; step: number; lo: string; hi: string; onChange: (n: number) => void }) {
  return (
    <div className="rounded-[22px] bg-s2 p-4 sm:p-5">
      <label htmlFor={id} className="mb-4 flex items-baseline justify-between font-extrabold tracking-[-0.02em]">{label}<span className="font-mono text-[16px] font-medium text-acc">{display}</span></label>
      <input id={id} type="range" min={min} max={max} step={step} value={value} onChange={(e) => onChange(+e.target.value)} className={range} />
      <div className="mt-2.5 flex justify-between font-mono text-[12px] text-ink3"><span>{lo}</span><span>{hi}</span></div>
    </div>
  );
}

export function Configurator() {
  const [ram, setRam] = useState(1);
  const [cpu, setCpu] = useState(1);
  const [disk, setDisk] = useState(10);
  const mb = RAM[ram];
  // Illustrative rate card, replaced when billing is defined.
  const price = 0.75 + (mb / 1024) * 0.5 + (cpu - 1) * 0.4 + disk * 0.02;
  const shown = useTween(price);
  const cells = Math.max(1, Math.round((mb / 8192) * 16));
  return (
    <section id="resources" className="scroll-mt-24 pb-16 sm:pb-28">
      <Wrap>
        <div className="mb-8 grid max-w-3xl gap-4 sm:mb-10">
          <Eyebrow>Resources</Eyebrow>
          <Headline lines={['Your resources.', 'Your rules.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" />
          <Reveal as="p" className="text-[17px] text-ink2 sm:text-[18px]">Start cheap, upgrade later without buying a new VPS. The price is always visible, never revealed at checkout.</Reveal>
        </div>
        <Reveal className="grid items-start gap-3 rounded-[28px] bg-acc-bg p-2.5 sm:p-3 lg:grid-cols-[1.35fr_1fr]">
          <div className="grid gap-2.5 rounded-[22px] bg-s1 p-3 sm:p-4">
            <div role="group" aria-label="Presets" className="grid grid-cols-3 gap-1.5">
              {PRESETS.map((p) => {
                const on = ram === p.r && cpu === p.c && disk === p.d;
                return <button key={p.n} type="button" aria-pressed={on} onClick={() => { setRam(p.r); setCpu(p.c); setDisk(p.d); }} className={cn('h-12 rounded-full text-[14.5px] font-bold transition-colors duration-[180ms]', on ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink')}>{p.n}</button>;
              })}
            </div>
            <Slider id="ram" label="Memory" value={ram} display={fmtRam(mb)} min={0} max={6} step={1} lo="512 MB" hi="8 GB" onChange={setRam} />
            <Slider id="cpu" label="CPU" value={cpu} display={`${cpu} vCPU`} min={1} max={8} step={1} lo="1 vCPU" hi="8 vCPU" onChange={setCpu} />
            <Slider id="disk" label="Storage" value={disk} display={`${disk} GB`} min={5} max={200} step={5} lo="5 GB" hi="200 GB" onChange={setDisk} />
          </div>
          <aside aria-live="polite" className="rounded-[22px] bg-s1 p-5 sm:p-6 lg:sticky lg:top-24">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-ink3">Your instance</p>
            <div aria-hidden="true" className="mt-4 grid gap-2.5">
              <div className="grid grid-cols-8 gap-1.5">{Array.from({ length: 16 }, (_, i) => <i key={i} className={cn('h-6 rounded-lg transition-colors duration-[180ms]', i < cells ? 'bg-acc' : 'bg-s3')} />)}</div>
              <div className="grid grid-cols-8 gap-1.5">{Array.from({ length: 8 }, (_, i) => <i key={i} className={cn('h-6 rounded-lg transition-colors duration-[180ms]', i < cpu ? 'bg-ink' : 'bg-s3')} />)}</div>
              <div className="h-6 overflow-hidden rounded-lg bg-s3"><i className="block h-full rounded-lg bg-acc/50 transition-[width] duration-[220ms]" style={{ width: `${(disk / 200) * 100}%` }} /></div>
            </div>
            <div className="mt-5 grid gap-0 font-mono text-[14px]">
              {([['Memory', fmtRam(mb)], ['CPU', `${cpu} vCPU`], ['Storage', `${disk} GB`]] as const).map(([k, v]) => <div key={k} className="flex justify-between rounded-xl px-3 py-2.5 odd:bg-s2"><span className="text-ink2">{k}</span><span>{v}</span></div>)}
            </div>
            <div className="max-lg:hidden">
              <div className="flex items-baseline justify-between px-3 pb-5 pt-5"><span className="text-ink2">Per month</span><b className="font-mono text-[44px] font-semibold leading-none tracking-[-0.05em] tabular-nums">{eur(shown)}</b></div>
              <Button full size="lg" icon="arrowUR" onClick={() => scrollToId('apps')}>Choose an app to continue</Button>
            </div>
            <p className="mt-3 text-[12.5px] text-ink3">Illustrative pricing. Final rates are set when billing launches.</p>
          </aside>
          <div className="sticky bottom-3 z-10 grid grid-cols-[auto_1fr] items-center gap-3 rounded-[22px] bg-s3 p-2.5 pl-5 lg:hidden">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p><p className="font-mono text-[24px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{eur(shown)}</p></div>
            <Button full size="lg" onClick={() => scrollToId('apps')}>Choose app</Button>
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}

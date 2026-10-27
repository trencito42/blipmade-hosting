import { useEffect, useMemo, useState } from 'react';
import { eur, cn, useTween } from '../lib';
import { Button, Eyebrow, Headline, Reveal, Wrap, rangeInput } from '../ui';
import { scrollToId } from '../router';
import { api, get, type CatalogProduct, type Quote } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { memLabel } from '../lib/pricing';
import { cpuOptions, diskOptions, isOrderable, nearestOption, ramOptions, recommendedPreset, startingConfiguration, teaserProduct } from '../lib/pricing-contract';

/**
 * The resource teaser of the homepage.
 *
 * The products, the options and the amount come from the catalog of the
 * platform: the price is the price the server quotes for the configuration
 * that is on the screen. Nothing here is an invented rate card, and a catalog
 * that cannot be loaded shows a message instead of an amount.
 */

const range = rangeInput;

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
  const catalog = useAsync<{ products: CatalogProduct[] }>((signal) =>
    get<{ products: CatalogProduct[] }>('/catalog/products', undefined, signal),
  );
  const products = catalog.data?.products ?? [];
  // The teaser shows the price of a product that can be ordered. A product
  // that is closed has no price to quote: the server refuses the quote of a
  // product that was not validated, with a 400, and the page would sit there
  // with an error in the console and no amount on the screen.
  const product = useMemo(() => teaserProduct(products), [products]);
  const orderable = product ? isOrderable(product) : false;

  const ramGrid = useMemo(() => (product ? ramOptions(product) : []), [product]);
  const cpuGrid = useMemo(() => (product ? cpuOptions(product) : []), [product]);
  const diskGrid = useMemo(() => (product ? diskOptions(product) : []), [product]);

  const [ram, setRam] = useState(0);
  const [cpu, setCpu] = useState(0);
  const [disk, setDisk] = useState(0);

  // The configuration on the screen always belongs to the grid of the product,
  // so the amount that is quoted is the amount of a configuration that can be
  // ordered.
  const configuration = useMemo(() => {
    if (!product) return null;
    return {
      ram: nearestOption(ramGrid, ramGrid[ram] ?? product.minRam),
      cpu: nearestOption(cpuGrid, cpuGrid[cpu] ?? product.minCpu),
      disk: nearestOption(diskGrid, diskGrid[disk] ?? product.minDisk),
    };
  }, [product, ramGrid, cpuGrid, diskGrid, ram, cpu, disk]);

  // The sliders are moved by hand, so the request waits for the movement to
  // settle instead of following every step.
  const [quoted, setQuoted] = useState<{ ram: number; cpu: number; disk: number } | null>(null);
  useEffect(() => {
    if (!configuration) return;
    const timer = setTimeout(() => setQuoted(configuration), 250);
    return () => clearTimeout(timer);
  }, [configuration]);

  const quoteState = useAsync<Quote | null>(
    async (signal) => {
      if (!product || !orderable || !quoted) return null;
      return api<Quote>('/catalog/quote', {
        method: 'POST',
        body: { items: [{ productSlug: product.slug, ram: quoted.ram, cpu: quoted.cpu, disk: quoted.disk }] },
        signal,
      });
    },
    [product?.slug, orderable, quoted?.ram, quoted?.cpu, quoted?.disk],
  );

  const price = quoteState.data ? quoteState.data.total / 100 : null;
  const shown = useTween(price ?? 0);
  const cells = configuration ? Math.max(1, Math.round((configuration.ram / 8192) * 16)) : 1;
  const presets = useMemo(() => {
    if (!product) return [];
    const minimum = startingConfiguration(product);
    const recommended = recommendedPreset(product);
    const list = [
      { n: 'Starter', ram: minimum.ram, cpu: minimum.cpu, disk: minimum.disk },
      { n: 'Standard', ram: recommended.ram, cpu: recommended.cpu, disk: recommended.disk },
    ];
    return list.filter((preset, index) => index === 0 || preset.ram !== list[0]!.ram || preset.disk !== list[0]!.disk);
  }, [product]);

  const pick = (preset: { ram: number; cpu: number; disk: number }) => {
    setRam(ramGrid.indexOf(preset.ram) >= 0 ? ramGrid.indexOf(preset.ram) : 0);
    setCpu(cpuGrid.indexOf(preset.cpu) >= 0 ? cpuGrid.indexOf(preset.cpu) : 0);
    setDisk(diskGrid.indexOf(preset.disk) >= 0 ? diskGrid.indexOf(preset.disk) : 0);
  };

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
            <div role="group" aria-label="Presets" className="grid grid-cols-3 gap-2">
              {presets.map((p) => {
                const on = configuration?.ram === p.ram && configuration?.cpu === p.cpu && configuration?.disk === p.disk;
                return <button key={p.n} type="button" aria-pressed={on} onClick={() => pick(p)} className={cn('h-12 rounded-full text-[14.5px] font-bold transition-colors duration-[180ms]', on ? 'bg-ink text-bg' : 'bg-s2 text-ink2 hover:bg-s3 hover:text-ink')}>{p.n}</button>;
              })}
            </div>
            <Slider id="ram" label="Memory" value={ram} display={configuration ? memLabel(configuration.ram) : '—'} min={0} max={Math.max(0, ramGrid.length - 1)} step={1} lo={ramGrid[0] ? memLabel(ramGrid[0]) : ''} hi={ramGrid.length ? memLabel(ramGrid[ramGrid.length - 1]!) : ''} onChange={setRam} />
            <Slider id="cpu" label="CPU" value={cpu} display={configuration ? `${configuration.cpu} vCPU` : '—'} min={0} max={Math.max(0, cpuGrid.length - 1)} step={1} lo={cpuGrid[0] ? `${cpuGrid[0]} vCPU` : ''} hi={cpuGrid.length ? `${cpuGrid[cpuGrid.length - 1]!} vCPU` : ''} onChange={setCpu} />
            <Slider id="disk" label="Storage" value={disk} display={configuration ? `${configuration.disk} GB` : '—'} min={0} max={Math.max(0, diskGrid.length - 1)} step={1} lo={diskGrid[0] ? `${diskGrid[0]} GB` : ''} hi={diskGrid.length ? `${diskGrid[diskGrid.length - 1]!} GB` : ''} onChange={setDisk} />
          </div>
          <aside aria-live="polite" className="rounded-[22px] bg-s1 p-5 sm:p-6 lg:sticky lg:top-24">
            <p className="font-mono text-[12px] uppercase tracking-[0.1em] text-ink3">{product ? product.name : 'Your instance'}</p>
            <div aria-hidden="true" className="mt-4 grid gap-2.5">
              <div className="grid grid-cols-8 gap-1.5">{Array.from({ length: 16 }, (_, i) => <i key={i} className={cn('h-6 rounded-lg transition-colors duration-[180ms]', i < cells ? 'bg-acc' : 'bg-s3')} />)}</div>
              <div className="grid grid-cols-8 gap-1.5">{Array.from({ length: 8 }, (_, i) => <i key={i} className={cn('h-6 rounded-lg transition-colors duration-[180ms]', i < (configuration?.cpu ?? 0) ? 'bg-ink' : 'bg-s3')} />)}</div>
              <div className="h-6 overflow-hidden rounded-lg bg-s3"><i className="block h-full rounded-lg bg-acc/50 transition-[width] duration-[220ms]" style={{ width: `${Math.min(100, ((configuration?.disk ?? 0) / Math.max(1, product?.maxDisk ?? 1)) * 100)}%` }} /></div>
            </div>
            <div className="mt-5 grid gap-0 font-mono text-[14px]">
              {([['Memory', configuration ? memLabel(configuration.ram) : '—'], ['CPU', configuration ? `${configuration.cpu} vCPU` : '—'], ['Storage', configuration ? `${configuration.disk} GB` : '—']] as const).map(([k, v]) => <div key={k} className="flex justify-between rounded-xl px-3 py-2.5 odd:bg-s2"><span className="text-ink2">{k}</span><span>{v}</span></div>)}
            </div>
            <div className="max-lg:hidden">
              <div className="flex items-baseline justify-between px-3 pb-5 pt-5"><span className="text-ink2">Per month</span><b className="font-mono text-[44px] font-semibold leading-none tracking-[-0.05em] tabular-nums">{price === null ? '—' : eur(shown)}</b></div>
              <Button full size="lg" icon="arrowUR" onClick={() => scrollToId('apps')}>Choose an app to continue</Button>
            </div>
            <p className="mt-3 text-[12.5px] text-ink3">The price comes from the server and is the price of the configuration above.</p>
          </aside>
          <div className="sticky bottom-3 z-10 grid grid-cols-[auto_1fr] items-center gap-3 rounded-[22px] bg-s3 p-2.5 pl-5 lg:hidden">
            <div><p className="font-mono text-[11px] uppercase tracking-[0.08em] text-ink3">Per month</p><p className="font-mono text-[24px] font-semibold leading-none tracking-[-0.04em] tabular-nums">{price === null ? '—' : eur(shown)}</p></div>
            <Button full size="lg" onClick={() => scrollToId('apps')}>Choose app</Button>
          </div>
        </Reveal>
      </Wrap>
    </section>
  );
}

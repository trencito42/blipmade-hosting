import { useId, useRef, useState, type CSSProperties } from 'react';
import { orderableOf, useProducts } from './catalog';
import { breakdownOfResources, eur, fmtDisk, fmtRam, type Rates, type Resources } from './pricing';
import { Btn, cx } from './ui';

/**
 * The configurator of the price.
 *
 * It is the centre of the public site: the visitor moves three sliders and
 * sees what the configuration costs before they order anything. The product
 * is a radio group, so it is reachable with the keyboard and it says what is
 * chosen.
 *
 * Only a product that can be ordered is offered here. The catalog holds every
 * product the platform lists, and a product that is still coming cannot be
 * sized, so it is not a choice of this control.
 *
 * The price is the arithmetic of the platform, written for the browser: the
 * same card of rates, the same rounding. The test of the repository checks
 * that the two agree for every product of the catalog.
 */

/** The four colours of the bar of the cost. */
const SEG = ['#46e58f', '#2fb673', '#1d8556', '#4b5d51'];

interface SliderProps {
  label: string;
  value: number;
  min: number;
  max: number;
  step: number;
  text: string;
  onChange: (value: number) => void;
  hint: string;
}

/** One slider of a resource, with its value and the two ends of its track. */
function Slider({ label, value, min, max, step, text, onChange, hint }: SliderProps) {
  const id = useId();
  const p = max === min ? 100 : ((value - min) / (max - min)) * 100;
  return (
    <div className="grid gap-1">
      <div className="flex items-baseline justify-between gap-3">
        <label htmlFor={id} className="font-display text-[17px] font-semibold">{label}</label>
        <output htmlFor={id} className="num text-[17px] text-mint">{text}</output>
      </div>
      <input
        id={id}
        type="range"
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(event) => onChange(Number(event.target.value))}
        style={{ '--p': `${p}%` } as CSSProperties}
        aria-valuetext={text}
        disabled={min === max}
      />
      <p className="num -mt-0.5 flex justify-between text-[12.5px] text-snow-2">
        <span>{hint.split('|')[0]}</span>
        <span>{hint.split('|')[1]}</span>
      </p>
    </div>
  );
}

export interface ConfiguratorProps {
  /** The product that is chosen when the page opens. */
  slug?: string;
  /** The product cannot be changed: the page is about one product. */
  lock?: boolean;
  className?: string;
}

export function Configurator({ slug = 'discord-bot', lock = false, className }: ConfiguratorProps) {
  // The control prices an order, so it only carries the products that can be
  // ordered today.
  const products = orderableOf(useProducts());
  const minecraft = products.find((product) => product.slug === 'minecraft-paper') ?? products.find((product) => product.slug.startsWith('minecraft-'));
  const choices = products.filter((product) => !product.slug.startsWith('minecraft-'));
  if (minecraft) choices.push(minecraft);
  const [selected, setSelected] = useState(slug);
  const current = products.find((product) => product.slug === selected) ?? products[0];
  const [raw, setResources] = useState<Resources | null>(null);
  // The name of the radio group. It is read before the page decides that it
  // has no product to show, so the hooks are always called in the same order.
  const name = useId();
  const choicesRef = useRef<HTMLDetailsElement>(null);

  if (!current) return null;

  const clamp = (key: keyof Resources, value: number) => Math.min(current.max[key], Math.max(current.min[key], value));
  const base = raw ?? current.def;
  const resources: Resources = {
    ram: clamp('ram', base.ram),
    cpu: clamp('cpu', base.cpu),
    disk: clamp('disk', base.disk),
  };
  const pick = (productSlug: string) => {
    setSelected(productSlug);
    setResources(null);
    choicesRef.current?.removeAttribute('open');
  };
  const choiceSelected = (productSlug: string) => productSlug.startsWith('minecraft-') ? current.slug.startsWith('minecraft-') : current.slug === productSlug;
  const set = (key: keyof Resources) => (value: number) => setResources({ ...resources, [key]: value });
  const rates: Rates = current.rates;
  const b = breakdownOfResources(resources, rates);
  const parts = [b.ram, b.cpu, b.disk, b.base];
  const query = new URLSearchParams({
    app: current.slug,
    ram: String(resources.ram),
    cpu: String(resources.cpu),
    disk: String(resources.disk),
  }).toString();
  const diskStep = current.max.disk > 50 ? 5 : 1;
  const rows: [string, string, number, string][] = [
    ['RAM', `${fmtRam(resources.ram)} × ${eur(rates.ramPerGb)} per GB`, b.ram, SEG[0]],
    ['vCPU', `${resources.cpu} × ${eur(rates.cpuPerUnit)}`, b.cpu, SEG[1]],
    ['Disk', `${fmtDisk(resources.disk)} × ${eur(rates.diskPerGb)} per GB`, b.disk, SEG[2]],
    ['Base fee', 'every instance', b.base, SEG[3]],
  ];

  return (
    <section aria-label="Price configurator" className={cx('on-night rounded-[28px] bg-night p-5 text-snow sm:rounded-[32px] sm:p-8', className)}>
      {lock ? (
        <h2 className="font-display text-[26px] leading-tight font-semibold tracking-[-0.03em]">Size your {current.name} instance</h2>
      ) : (
        <fieldset className="grid gap-3">
          <legend className="font-display text-[26px] leading-tight font-semibold tracking-[-0.03em]">What are you running?</legend>
          <details ref={choicesRef} className="group rounded-2xl border border-night-line bg-night-2">
            <summary className="flex min-h-12 cursor-pointer list-none items-center justify-between gap-3 px-4 py-3 text-[15px] font-semibold focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint [&::-webkit-details-marker]:hidden">
              <span className="min-w-0 truncate">{current.slug.startsWith('minecraft-') ? 'Minecraft' : current.name}</span>
              <span className="flex shrink-0 items-center gap-2 text-[12px] font-medium text-snow-2">
                Change app <span aria-hidden="true" className="transition-transform group-open:rotate-180">⌄</span>
              </span>
            </summary>
            <div className="max-h-60 overflow-y-auto overscroll-contain border-t border-night-line p-2" role="radiogroup" aria-label="Choose an app">
              {choices.map((product) => (
                <label
                  key={product.slug}
                  className={cx(
                    'flex min-h-11 cursor-pointer items-center justify-between rounded-xl px-3 py-2 text-[14px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-mint',
                    choiceSelected(product.slug) ? 'bg-mint text-night' : 'text-snow hover:bg-night-3',
                  )}
                >
                  <span>{product.slug.startsWith('minecraft-') ? 'Minecraft' : product.name}</span>
                  {choiceSelected(product.slug) && <span aria-hidden="true">✓</span>}
                  <input type="radio" name={name} className="sr-only" checked={choiceSelected(product.slug)} onChange={() => pick(product.slug)} />
                </label>
              ))}
            </div>
          </details>
        </fieldset>
      )}
      {!lock && current.slug.startsWith('minecraft-') && (
        <div className="mt-4 grid gap-2">
          <label htmlFor={`${name}-edition`} className="text-[14px] font-semibold text-snow">Minecraft edition</label>
          <select id={`${name}-edition`} value={current.slug} onChange={(event) => pick(event.target.value)} className="min-h-11 rounded-xl border border-night-line bg-night-2 px-3 text-[14px] text-snow focus-visible:outline-2 focus-visible:outline-mint">
            {[
              ['minecraft-paper', 'Paper'], ['minecraft-forge', 'Forge'], ['minecraft-vanilla', 'Vanilla'],
              ['minecraft-bedrock', 'Bedrock'], ['minecraft-folia', 'Folia'],
            ].map(([value, label]) => (
              <option key={value} value={value} disabled={!products.some((product) => product.slug === value)}>{label}{products.some((product) => product.slug === value) ? '' : ' — coming soon'}</option>
            ))}
          </select>
        </div>
      )}
      <div className="mt-7 grid gap-5">
        <Slider
          label="RAM"
          value={resources.ram}
          min={current.min.ram}
          max={current.max.ram}
          step={256}
          text={fmtRam(resources.ram)}
          onChange={set('ram')}
          hint={`${fmtRam(current.min.ram)}|${fmtRam(current.max.ram)}`}
        />
        <Slider
          label="vCPU"
          value={resources.cpu}
          min={current.min.cpu}
          max={current.max.cpu}
          step={1}
          text={String(resources.cpu)}
          onChange={set('cpu')}
          hint={`${current.min.cpu}|${current.max.cpu}`}
        />
        <Slider
          label="Disk"
          value={resources.disk}
          min={current.min.disk}
          max={current.max.disk}
          step={diskStep}
          text={fmtDisk(resources.disk)}
          onChange={set('disk')}
          hint={`${current.min.disk} GB|${current.max.disk} GB`}
        />
      </div>
      <div
        className="mt-8 flex h-3 overflow-hidden rounded-full bg-night-3"
        role="img"
        aria-label={`Where the price goes: RAM ${eur(b.ram)}, vCPU ${eur(b.cpu)}, disk ${eur(b.disk)}, base fee ${eur(b.base)}`}
      >
        {parts.map((value, index) => (
          <span key={index} className="h-full transition-[width] duration-300 ease-out" style={{ width: `${(value / b.total) * 100}%`, background: SEG[index] }} />
        ))}
      </div>
      <dl className="mt-5 grid gap-3">
        {rows.map(([k, d, v, c], index) => (
          <div key={k} className="rise grid grid-cols-[1fr_auto] items-baseline gap-4" style={{ '--i': index } as CSSProperties}>
            <dt className="flex items-baseline gap-2.5">
              <span aria-hidden="true" className="size-2.5 translate-y-px rounded-full" style={{ background: c }} />
              <span className="font-medium">{k}</span>
              <span className="num text-[13px] text-snow-2">{d}</span>
            </dt>
            <dd className="num text-[16px]">{eur(v)}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-6 flex items-end justify-between gap-4 border-t border-night-line pt-5">
        <p className="font-display text-[17px] font-semibold">Total per month</p>
        <p className="big text-[44px] sm:text-[52px]" role="status" aria-live="polite">{eur(b.total)}</p>
      </div>
      <Btn to={`/register?${query}`} variant="mint" size="lg" className="mt-6 w-full">Create account and deploy</Btn>
      <p className="mt-4 text-[13.5px] leading-relaxed text-snow-2">
        Euros per month. During launch, payment is completed with our team after you place the order.
      </p>
    </section>
  );
}

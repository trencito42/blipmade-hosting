import { useState } from 'react';
import { APPS, CATEGORIES, minLabel, slug, type Category } from '../data';
import { Icon } from '../icons';
import { cn, eur } from '../lib';
import { AppMark, Button, Eyebrow, Headline, Reveal, Wrap } from '../ui';
import { Link } from '../router';

const POP = [['WordPress', 'bg-acc text-on-acc'], ['PostgreSQL', 'bg-ink text-bg'], ['Uptime Kuma', 'bg-s2 text-ink']] as const;

export function Catalog({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  const [q, setQ] = useState('');
  const needle = q.trim().toLowerCase();
  const list = APPS.filter((a) => (cat === 'All' || a.cat === cat) && (!needle || `${a.name} ${a.cat} ${a.blurb}`.toLowerCase().includes(needle)));
  return (
    <section id="apps" className="scroll-mt-24 py-16 sm:py-28">
      <Wrap>
        <div className="mb-8 grid max-w-3xl gap-4 sm:mb-10">
          <Eyebrow>Catalog</Eyebrow>
          <Headline lines={['Explore', 'the catalog.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" />
          <Reveal as="p" className="text-[17px] text-ink2 sm:text-[18px]">Search, filter, pick. Every app shows its starting price up front.</Reveal>
        </div>

        <div className="-mx-4 mb-3.5 flex snap-x gap-3 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:grid sm:grid-cols-3 sm:overflow-visible sm:px-0 sm:pb-0">
          {POP.map(([n, tone], i) => {
            const a = APPS.find((x) => x.name === n)!;
            return (
              <Reveal key={n} delay={i * 60} className={cn('group grid min-h-[250px] w-[82vw] max-w-[360px] shrink-0 snap-start content-between gap-8 rounded-[28px] p-6 sm:w-auto sm:max-w-none sm:min-h-[270px]', tone)}>
                <div className="flex items-start justify-between"><AppMark icon={a.icon} size={52} tone={i === 0 ? 'acc' : i === 1 ? 'lit' : 'dark'} /><span className="font-mono text-[12px] uppercase tracking-[0.1em] opacity-60">Popular</span></div>
                <div>
                  <p className="text-[clamp(34px,3.4vw,46px)] font-extrabold leading-none tracking-[-0.06em]">{a.name}</p>
                  <p className="mt-2 max-w-[22em] opacity-70">{a.blurb}</p>
                  <div className="mt-5 flex items-center justify-between"><span className="font-mono text-[15px]">{eur(a.from)}<span className="opacity-60">/mo</span></span>
                    <Link to={`/login?next=${encodeURIComponent('/deploy/' + slug(a.name))}`} className={cn('inline-flex h-11 items-center gap-1.5 rounded-full px-5 text-[14.5px] font-bold transition-transform duration-[180ms] group-hover:translate-x-0.5', i === 0 ? 'bg-on-acc text-acc' : i === 1 ? 'bg-bg text-acc' : 'bg-acc text-on-acc')}>Deploy<Icon name="arrowUR" size={15} /></Link></div>
                </div>
              </Reveal>
            );
          })}
        </div>

        <div className="mb-5 mt-8 grid gap-3 sm:mt-10 lg:grid-cols-[minmax(260px,380px)_1fr] lg:items-center">
          <label className="flex h-12 items-center gap-2.5 rounded-full bg-s1 px-4 text-ink3 transition-colors duration-[180ms] focus-within:bg-s2">
            <Icon name="search" />
            <span className="sr-only">Search apps and databases</span>
            <input type="search" value={q} onChange={(e) => setQ(e.target.value)} placeholder="Search apps and databases" autoComplete="off" className="min-w-0 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3" />
          </label>
          <div role="group" aria-label="Categories" className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 [scrollbar-width:none] sm:mx-0 sm:flex-wrap sm:px-0">
            {CATEGORIES.map((c) => (
              <button key={c} type="button" aria-pressed={cat === c} onClick={() => setCat(c)} className={cn('h-11 shrink-0 rounded-full px-5 text-[14.5px] font-bold transition-colors duration-[180ms]', cat === c ? 'bg-ink text-bg' : 'bg-s1 text-ink2 hover:bg-s2 hover:text-ink')}>{c}</button>
            ))}
          </div>
        </div>

        <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4" aria-live="polite">
          {list.map((a) => (
            <Link key={a.name} to={`/login?next=${encodeURIComponent('/deploy/' + slug(a.name))}`} className="group grid content-between gap-5 rounded-[24px] bg-s1 p-5 outline-none transition-colors duration-[180ms] hover:bg-s2 focus-visible:ring-2 focus-visible:ring-acc active:scale-[0.99]">
              <div className="flex items-center gap-3">
                <AppMark icon={a.icon} size={46} />
                <div className="min-w-0"><h3 className="truncate text-[18px] font-extrabold leading-tight tracking-[-0.035em]">{a.name}</h3><span className="font-mono text-[12px] text-ink3">{a.cat}</span></div>
              </div>
              <p className="text-[14.5px] text-ink2">{a.blurb}</p>
              <div className="flex items-end justify-between">
                <div><p className="font-mono text-[11.5px] text-ink3">Min. {minLabel(a)}</p><p className="mt-1 font-mono text-[16px] font-medium">{eur(a.from)}<span className="text-ink3">/mo</span></p></div>
                <span className="grid size-10 place-items-center rounded-full bg-s3 text-ink transition-colors duration-[180ms] group-hover:bg-acc group-hover:text-on-acc"><Icon name="arrowUR" size={17} /></span>
              </div>
            </Link>
          ))}
          {!list.length && <p className="col-span-full rounded-[24px] bg-s1 p-10 text-center text-ink2">No apps match your search.</p>}
        </div>

        <Reveal className="mt-4 flex flex-wrap items-center justify-between gap-5 rounded-[28px] bg-acc-bg p-6 sm:p-8">
          <div className="max-w-xl">
            <Eyebrow>Founding users offer</Eyebrow>
            <h3 className="mt-3 text-[clamp(26px,3vw,36px)] font-extrabold leading-none tracking-[-0.05em]">Your first deployment, for less.</h3>
            <p className="mt-2 text-ink2">Get 50% off your first month. Available for the first 50 eligible customers.</p>
          </div>
          <Button to="/login" icon="arrowUR">Claim at checkout</Button>
        </Reveal>
        <p className="mt-3 text-[12.5px] text-ink3">Campaign proposal. The offer and its limit go live only once checkout and promo caps are implemented.</p>
      </Wrap>
    </section>
  );
}

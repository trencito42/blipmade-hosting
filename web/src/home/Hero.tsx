import type { Category } from '../data';
import { Icon } from '../icons';
import { cn, clamp, useMediaQuery, useReducedMotion, useScrollY } from '../lib';
import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { Button, Eyebrow, Headline, Reveal, StatusDot, Wrap } from '../ui';
import { scrollToId } from '../router';
import { Studio } from './Studio';

/** Small flat cards that pop in around the headline, float, and straighten on hover. Illustrative content. */
function Stickers() {
  const base = 'bm-pop pointer-events-auto absolute rounded-[26px] transition-transform duration-[220ms] hover:z-10 hover:scale-105 hover:!rotate-0';
  const catalog = useCatalogSummary();
  return (
    <div aria-hidden="true" data-decorative className="pointer-events-none absolute right-0 top-2 hidden h-[470px] w-[420px] xl:block">
      <div className={cn(base, 'right-10 top-0 w-[255px] bg-acc p-4 text-on-acc')} style={{ rotate: '-4deg', animationDelay: '600ms' }}>
        <div className="bm-float">
          <div className="flex items-center gap-3"><span className="grid size-11 place-items-center rounded-2xl bg-on-acc/12"><Icon name="globe" size={22} /></span><div><p className="font-extrabold leading-tight">wordpress</p><p className="font-mono text-[11.5px] opacity-70">Web &amp; CMS · 1 GB</p></div></div>
          <div className="mt-3 flex h-8 items-end gap-1">{[40, 62, 48, 80, 55, 70, 38, 66, 52, 74].map((h, i) => <i key={i} className="w-full rounded-full bg-on-acc/70" style={{ height: `${h}%` }} />)}</div>
          <p className="mt-2 flex items-center gap-2 font-mono text-[12px] font-medium"><span className="size-2 rounded-full bg-on-acc" />online · 38% CPU</p>
        </div>
      </div>
      <div className={cn(base, 'right-[-4px] top-[190px] bg-s2 px-5 py-3.5')} style={{ rotate: '5deg', animationDelay: '800ms' }}>
        <div className="bm-float" style={{ animationDelay: '-2s' }}><p className="font-mono text-[11.5px] text-ink3">Starting at</p><p className="font-mono text-[32px] font-semibold leading-none tracking-[-0.05em]">{formatPrice(catalog.minAppPrice ?? catalog.minDatabasePrice, catalog.currency)}<span className="text-[13px] font-normal text-ink3">/mo</span></p></div>
      </div>
      <div className={cn(base, 'right-24 top-[300px] flex items-center gap-3 bg-ink px-4 py-3 text-bg')} style={{ rotate: '-2deg', animationDelay: '1000ms' }}>
        <span className="grid size-10 place-items-center rounded-full bg-bg text-acc"><Icon name="db" size={20} /></span>
        <div><p className="font-extrabold leading-tight">PostgreSQL</p><p className="font-mono text-[11.5px] opacity-60">ready · :5432</p></div>
      </div>
      <div className={cn(base, 'right-2 top-[395px] flex items-center gap-3 bg-s1 px-4 py-3')} style={{ rotate: '3deg', animationDelay: '1200ms' }}>
        <StatusDot /><p className="text-[14.5px]"><b className="font-extrabold">shop.example.com</b> <span className="text-ink2">connected</span></p>
      </div>
    </div>
  );
}

export function Hero({ cat, setCat }: { cat: Category; setCat: (c: Category) => void }) {
  const catalog = useCatalogSummary();
  const y = useScrollY();
  const reduced = useReducedMotion();
  const k = reduced ? 1 : clamp(y / 380);
  // The tilt of the panel is a picture for a wide screen. On a phone it is
  // not used: a picture that is turned in depth reaches past the edges of
  // the screen and makes the page wider than it should be.
  const wide = useMediaQuery('(min-width: 1024px)');
  const tilt = wide && !reduced ? (1 - k) * 8 : 0;
  const lg = 'leading-[0.88] tracking-[-0.065em]';
  return (
    <section aria-labelledby="hero-title" className="relative pt-[104px] sm:pt-[132px]">
      <Wrap className="relative">
        <Stickers />
        <Eyebrow>The simpler way to self-host</Eyebrow>
        <Headline as="h1" lines={['Pick an app.', <span key="d" className="text-acc">Deploy it.</span>]} className={cn('mt-5 hidden whitespace-nowrap text-[clamp(60px,13.4vw,176px)] sm:block', lg)} />
        <Headline as="div" hidden lines={['Pick an', 'app.', <span key="d" className="text-acc">Deploy it.</span>]} className={cn('mt-4 whitespace-nowrap text-[clamp(54px,18vw,110px)] sm:hidden', lg)} />
        <span className="sr-only sm:hidden">Pick an app. Deploy it.</span>
        <Reveal delay={300} className="mt-7 grid items-end gap-7 lg:mt-8 lg:grid-cols-[minmax(0,1fr)_auto]">
          <p id="hero-title" className="max-w-[30em] text-[clamp(17px,1.8vw,22px)] leading-snug text-ink2">Your favorite apps and databases, ready to run. No VPS setup, no complicated infrastructure. Start small and scale as you grow.</p>
          <div className="grid gap-2.5 sm:flex sm:flex-wrap sm:gap-3">
            <Button size="lg" icon="arrowUR" onClick={() => scrollToId('apps')}>Explore apps</Button>
            <Button size="lg" variant="soft" onClick={() => { setCat('Databases'); scrollToId('apps'); }}>Browse databases</Button>
          </div>
        </Reveal>
        <p className="mt-5 font-mono text-[12.5px] text-ink3 sm:text-[13px]">
          {catalog.loading
            ? 'Loading the current prices…'
            : `Apps from ${formatPrice(catalog.minAppPrice, catalog.currency)}/mo · Databases from ${formatPrice(catalog.minDatabasePrice, catalog.currency)}/mo`}
        </p>
        <Reveal delay={200} className="mt-10 [perspective:1600px] sm:mt-12">
          <div className="origin-top will-change-transform" style={{ transform: `rotateX(${tilt}deg) scale(${0.96 + k * 0.04})`, opacity: 0.85 + k * 0.15 }}>
            <Studio cat={cat} setCat={setCat} />
          </div>
          <p className="mt-3 px-1 text-[13px] text-ink3">Try it: pick an app, change the size and watch the server price it. Deploy takes you to the real configurator, and the start-up you see here is only a preview.</p>
        </Reveal>
      </Wrap>
    </section>
  );
}

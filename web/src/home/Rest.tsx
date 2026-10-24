import { FAQ } from '../data';
import { Icon } from '../icons';
import { Eyebrow, Headline, Logo, Reveal, Wrap } from '../ui';
import { formatPrice, useCatalogSummary } from '../lib/pricing';
import { scrollToId } from '../router';
import { useSession } from '../session';
import { homeOf } from '../auth-guard';
import { LegalFooter } from '../legal/LegalFooter';

function Plan({ title, price, items }: { title: string; price: string; items: string[] }) {
  return (
    <Reveal className="grid content-start gap-4 rounded-[28px] bg-s1 p-6 sm:p-8">
      <h3 className="text-[26px] font-extrabold tracking-[-0.045em]">{title}</h3>
      <p className="font-mono text-[48px] font-semibold leading-none tracking-[-0.05em]">{price}<span className="text-[15px] font-normal tracking-normal text-ink3"> /mo from</span></p>
      <ul className="grid gap-2.5">{items.map((t) => <li key={t} className="flex items-start gap-3 rounded-2xl bg-s2 px-4 py-3 text-ink2"><Icon name="check" className="mt-1 shrink-0 text-acc" />{t}</li>)}</ul>
    </Reveal>
  );
}

export function Pricing() {
  const catalog = useCatalogSummary();
  return (
    <section id="pricing" className="scroll-mt-24 pb-16 sm:pb-24">
      <Wrap>
        <div className="mb-10 grid max-w-2xl gap-4"><Eyebrow>Pricing</Eyebrow><Headline lines={['Transparent pricing.']} className="text-[clamp(40px,7vw,100px)] leading-[0.9]" /><Reveal as="p" className="text-[18px] text-ink2">You pay for the resources you choose. Nothing hidden.</Reveal></div>
        <div className="grid gap-3.5 md:grid-cols-2">
          <Plan title="Apps" price={formatPrice(catalog.minAppPrice, catalog.currency)} items={['Billed monthly for the resources you pick', 'Upgrade resources any time', 'Files, logs and domains included']} />
          <Plan title="Databases" price={formatPrice(catalog.minDatabasePrice, catalog.currency)} items={['PostgreSQL, MySQL, Redis and more', 'Storage scales with your data', 'Support by ticket']} />
        </div>
        <div className="mt-6 grid gap-2">
          {FAQ.map(([q, a]) => (
            <details key={q} className="group rounded-[22px] bg-s1 transition-colors duration-[180ms] open:bg-s2">
              <summary className="flex cursor-pointer list-none items-center justify-between gap-3 px-5 py-[18px] font-extrabold tracking-[-0.02em] [&::-webkit-details-marker]:hidden">{q}<span aria-hidden="true" className="font-mono grid size-8 place-items-center rounded-full bg-s3 text-[18px] leading-none text-ink group-open:hidden">+</span><span aria-hidden="true" className="hidden size-8 place-items-center rounded-full bg-acc text-[18px] leading-none text-on-acc group-open:grid">−</span></summary>
              <p className="max-w-[46em] px-5 pb-4 text-ink2">{a}</p>
            </details>
          ))}
        </div>
      </Wrap>
    </section>
  );
}

export function FinalCta() {
  return (
    <section className="pb-16 sm:pb-24">
      <Wrap>
        <Reveal className="relative grid justify-items-start gap-8 overflow-hidden rounded-[32px] bg-acc px-6 py-14 text-on-acc sm:px-12 sm:py-24">
          <span className="font-mono text-[12px] font-medium uppercase tracking-[0.12em] opacity-70">Ready when you are</span>
          <h2 className="text-[clamp(44px,9.6vw,148px)] font-extrabold leading-[0.88] tracking-[-0.07em]">Your next app<br />is waiting.</h2>
          <button type="button" onClick={() => scrollToId('apps')} className="group inline-flex h-14 items-center gap-2 rounded-full bg-on-acc px-7 text-[16px] font-semibold text-acc transition-transform duration-[180ms] active:scale-[0.98]">Explore apps<Icon name="arrow" size={18} className="transition-transform duration-[180ms] group-hover:translate-x-0.5" /></button>
        </Reveal>
      </Wrap>
    </section>
  );
}

export function Footer() {
  // The links of the footer are pressed with a finger, so they keep the
  // height of a touch target.
  const a = 'inline-flex min-h-11 items-center transition-colors duration-[180ms] hover:text-ink';
  const { user } = useSession();
  return (
    <footer className="py-10 text-[14px] text-ink3">
      <Wrap className="flex flex-wrap items-center justify-between gap-x-8 gap-y-4">
        <div className="flex items-center gap-4"><Logo className="!text-[17px] text-ink" /><span>© {new Date().getFullYear()}</span></div>
        <nav className="flex flex-wrap gap-5"><button type="button" className={a} onClick={() => scrollToId('apps')}>Apps</button><button type="button" className={a} onClick={() => scrollToId('pricing')}>Pricing</button><a className={a} href="/docs">Docs</a><a className={a} href="/status">Status</a>{user ? <a className={a} href={homeOf(user.role)}>Dashboard</a> : <a className={a} href="/login">Log in</a>}</nav>
      </Wrap>
      <Wrap className="mt-8">
        <LegalFooter />
      </Wrap>
    </footer>
  );
}

import { useEffect, useRef, useState } from 'react';
import { CATEGORIES, type Category } from '../data';
import { useCatalogSummary } from '../lib/pricing';

/** The number shown while the catalog is still loading. */
const APPS_COUNT = 12;
import { Icon, type IconName } from '../icons';
import { cn, useScrollY } from '../lib';
import { scrollToId, useRouter } from '../router';
import { Button, Logo } from '../ui';

const CATS: Record<string, [IconName, string]> = {
  'Web & CMS': ['globe', 'WordPress, Ghost and other site builders'],
  'Developer Tools': ['code', 'Git forges and cloud editors'],
  Monitoring: ['mon', 'Uptime, metrics and dashboards'],
  Automation: ['flow', 'Workflows that run themselves'],
  Bots: ['bot', 'Discord and chat bots, always on'],
  Databases: ['db', 'PostgreSQL, MySQL, Redis, MongoDB'],
};

export function Nav({ setCat }: { setCat: (c: Category) => void }) {
  const catalog = useCatalogSummary();
  const y = useScrollY();
  const { path, navigate } = useRouter();
  const [menu, setMenu] = useState(false);
  const [sheet, setSheet] = useState(false);
  const root = useRef<HTMLElement>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => { if (e.key === 'Escape') { setMenu(false); setSheet(false); } };
    const out = (e: MouseEvent) => { if (root.current && !root.current.contains(e.target as Node)) setMenu(false); };
    addEventListener('keydown', esc); addEventListener('mousedown', out);
    return () => { removeEventListener('keydown', esc); removeEventListener('mousedown', out); };
  }, []);
  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [sheet]);

  const hover = (v: boolean) => { clearTimeout(timer.current); if (v) setMenu(true); else timer.current = window.setTimeout(() => setMenu(false), 160); };
  const go = (id: string, c?: Category) => {
    setSheet(false); setMenu(false);
    const run = () => { if (c) setCat(c); scrollToId(id); };
    if (path === '/') setTimeout(run, sheet ? 60 : 0); else { navigate('/'); setTimeout(run, 140); }
  };
  const link = 'relative inline-flex h-10 items-center gap-1.5 rounded-full px-4 text-[15px] font-bold text-ink2 outline-none transition-colors duration-[180ms] hover:text-ink focus-visible:ring-2 focus-visible:ring-acc';
  const scrolled = y > 24;

  return (
    <header ref={root} className="pointer-events-auto fixed inset-x-0 top-0 z-40 bg-bg px-3 pb-2 sm:px-6" onMouseLeave={() => hover(false)}>
      <div className={cn('mx-auto max-w-[1280px] transition-[padding] duration-[220ms]', scrolled ? 'pt-2' : 'pt-3 sm:pt-4')}>
        <div className="relative overflow-hidden rounded-[28px] bg-s1">
          <nav aria-label="Main" className="flex h-[60px] items-center gap-2 pl-5 pr-2">
            <Logo className="mr-2" />
            <ul className="mx-auto hidden items-center gap-1 lg:flex">
              <li onMouseEnter={() => hover(true)}>
                <button type="button" aria-expanded={menu} className={cn(link, menu && 'text-ink')} onClick={() => setMenu(!menu)}>Apps<Icon name="arrow" size={13} className={cn('transition-transform duration-[180ms]', menu ? '-rotate-90' : 'rotate-90')} />
                  <span aria-hidden="true" className={cn('absolute inset-x-4 -bottom-0.5 h-0.5 origin-left rounded-full bg-acc transition-transform duration-[220ms]', menu ? 'scale-x-100' : 'scale-x-0')} />
                </button>
              </li>
              <li onMouseEnter={() => hover(false)}><button type="button" className={link} onClick={() => go('apps', 'Databases')}>Databases</button></li>
              <li><button type="button" className={link} onClick={() => go('pricing')}>Pricing</button></li>
              <li><a className={link} href="/docs">Docs</a></li>
              <li><a className={link} href="/status">Status</a></li>
            </ul>
            <div className="ml-auto flex items-center gap-1.5 lg:ml-0">
              <a href="/login" onClick={(e) => { e.preventDefault(); navigate('/login'); }} className="hidden h-11 items-center rounded-full px-4 text-[15px] font-bold text-ink2 hover:text-ink sm:inline-flex">Log in</a>
              <Button icon="arrowUR" className="max-sm:hidden" onClick={() => go('apps', 'All')}>Get started</Button>
              <button type="button" aria-label={sheet ? 'Close menu' : 'Open menu'} aria-expanded={sheet} onClick={() => setSheet(!sheet)} className="grid size-11 place-items-center rounded-full bg-s3 text-ink transition-transform duration-[180ms] active:scale-95 lg:hidden"><Icon name={sheet ? 'close' : 'menu'} size={20} /></button>
            </div>
          </nav>

          <div aria-hidden={!menu} className={cn('hidden grid-rows-[0fr] transition-[grid-template-rows] duration-[220ms] lg:grid', menu && 'grid-rows-[1fr]')}>
            <div className="overflow-hidden">
              <div className="grid grid-cols-[minmax(0,1.5fr)_minmax(0,1fr)] gap-6 px-6 pb-6 pt-3">
                <ul className="grid grid-cols-2 gap-x-6 gap-y-1">
                  {CATEGORIES.filter((c) => c !== 'All').map((c) => (
                    <li key={c}>
                      <button type="button" tabIndex={menu ? 0 : -1} onClick={() => go('apps', c)} className="group grid w-full grid-cols-[44px_minmax(0,1fr)] items-center gap-4 rounded-2xl p-3 text-left outline-none transition-colors duration-[180ms] hover:bg-s2 focus-visible:ring-2 focus-visible:ring-acc">
                        <span className="grid size-11 place-items-center rounded-xl bg-s3 text-acc transition-transform duration-[180ms] group-hover:scale-105"><Icon name={CATS[c][0]} size={20} /></span>
                        <span className="min-w-0"><span className="block text-[18px] font-extrabold leading-tight tracking-[-0.03em]">{c}</span><span className="block text-[13.5px] text-ink2">{CATS[c][1]}</span></span>
                      </button>
                    </li>
                  ))}
                </ul>
                <div className="grid content-between gap-6 rounded-[22px] bg-acc p-7 text-on-acc">
                  <div><p className="font-mono text-[11.5px] uppercase tracking-[0.1em] opacity-70">{catalog.count ?? APPS_COUNT} apps and databases</p><p className="mt-2 text-[30px] font-extrabold leading-[1] tracking-[-0.055em]">Skip the server setup.</p></div>
                  <button type="button" tabIndex={menu ? 0 : -1} onClick={() => go('apps', 'All')} className="inline-flex h-11 w-fit items-center gap-1.5 rounded-full bg-on-acc px-5 text-[14.5px] font-bold text-acc">Explore apps<Icon name="arrowUR" size={15} /></button>
                </div>
              </div>
            </div>
          </div>
        </div>
      </div>

      {sheet && (
        <div className="pointer-events-auto fixed inset-0 -z-10 overflow-y-auto bg-bg px-4 pb-8 pt-[84px] lg:hidden" role="dialog" aria-modal="true" aria-label="Menu">
          <div className="bm-in grid gap-3">
            <div className="rounded-[24px] bg-s1 p-2">
              <p className="px-4 pb-1 pt-3 font-mono text-[12px] uppercase tracking-[0.1em] text-ink3">Browse</p>
              <ul>
                {CATEGORIES.map((c) => (
                  <li key={c}><button type="button" onClick={() => go('apps', c)} className="flex min-h-[52px] w-full items-center gap-3 rounded-2xl px-4 text-left text-[20px] font-extrabold tracking-[-0.035em] active:bg-s2"><Icon name={c === 'All' ? 'box' : CATS[c][0]} size={20} className="text-acc" />{c === 'All' ? 'All apps' : c}</button></li>
                ))}
              </ul>
            </div>
            <div className="grid grid-cols-3 gap-2">
              <button type="button" onClick={() => go('pricing')} className="grid h-14 place-items-center rounded-2xl bg-s1 text-[16px] font-extrabold active:bg-s2">Pricing</button>
              <a href="/docs" className="grid h-14 place-items-center rounded-2xl bg-s1 text-[16px] font-extrabold active:bg-s2">Docs</a>
              <a href="/status" className="grid h-14 place-items-center rounded-2xl bg-s1 text-[16px] font-extrabold active:bg-s2">Status</a>
            </div>
            <div className="mt-1 grid gap-2"><Button size="lg" icon="arrowUR" onClick={() => go('apps', 'All')}>Get started</Button><Button size="lg" variant="soft" to="/login">Log in</Button></div>
          </div>
        </div>
      )}
    </header>
  );
}

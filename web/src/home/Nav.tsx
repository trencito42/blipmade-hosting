import { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons';
import { cn, useScrollY } from '../lib';
import { scrollToId, useRouter } from '../router';
import { Button, Logo } from '../ui';
import { useSession } from '../session';
import { homeOf } from '../auth-guard';

/**
 * The navigation of the public site.
 *
 * The bar is fixed and it becomes solid when the page is scrolled. The links
 * of the sections of the home page are here, and the sheet of the phone
 * carries every one of them, because a link that only exists on a wide
 * screen is a link that a phone cannot use.
 */
export function Nav() {
  const y = useScrollY();
  const { path, navigate } = useRouter();
  const { user } = useSession();
  const [sheet, setSheet] = useState(false);
  const root = useRef<HTMLElement>(null);
  const sheetPanel = useRef<HTMLDivElement>(null);
  const menuButton = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    const esc = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || !sheet) return;
      setSheet(false);
      menuButton.current?.focus();
    };
    addEventListener('keydown', esc);
    return () => removeEventListener('keydown', esc);
  }, [sheet]);

  useEffect(() => { document.body.style.overflow = sheet ? 'hidden' : ''; return () => { document.body.style.overflow = ''; }; }, [sheet]);

  // While the sheet is open the focus stays inside it.
  useEffect(() => {
    if (!sheet) return;
    sheetPanel.current?.querySelector<HTMLElement>('a, button')?.focus();
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== 'Tab') return;
      const panel = sheetPanel.current;
      if (!panel) return;
      const focusable = panel.querySelectorAll<HTMLElement>('a[href], button:not([disabled])');
      if (!focusable.length) return;
      const first = focusable[0];
      const last = focusable[focusable.length - 1];
      const active = document.activeElement;
      if (e.shiftKey && (active === first || !panel.contains(active))) {
        e.preventDefault();
        last.focus();
      } else if (!e.shiftKey && active === last) {
        e.preventDefault();
        first.focus();
      }
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [sheet]);

  const solid = y > 12;
  const link = 'rounded-lg px-3 py-2 text-[14px] text-ink2 transition-colors hover:text-ink';

  /** A section of the home page. The page is scrolled to it when it is the one that is open. */
  const go = (id: string) => {
    const hadSheet = sheet;
    setSheet(false);
    if (hadSheet) menuButton.current?.focus();
    if (path === '/') scrollToId(id);
    else {
      navigate('/');
      setTimeout(() => scrollToId(id), 160);
    }
  };

  /** The links of the sheet of the phone. The same ones the wide bar holds. */
  const sections: { label: string; id: string }[] = [
    { label: 'Plans', id: 'plans' },
    { label: 'Why Blipmade', id: 'why' },
    { label: 'Panel', id: 'panel' },
    { label: 'FAQ', id: 'faq' },
  ];

  return (
    <header
      ref={root}
      className={cn(
        'fixed inset-x-0 top-0 z-40 transition-[background-color,border-color] duration-300',
        solid ? 'border-b border-line bg-bg/85 backdrop-blur-md' : 'border-b border-transparent',
      )}
    >
      <div className="mx-auto flex h-16 w-full max-w-[1200px] items-center gap-2 px-5 sm:px-8">
        <Logo className="mr-4" />
        <nav aria-label="Main" className="hidden items-center md:flex">
          {sections.map((section) => (
            <button key={section.id} type="button" onClick={() => go(section.id)} className={link}>
              {section.label}
            </button>
          ))}
          <button type="button" onClick={() => navigate('/apps')} className={link}>Apps</button>
          <button type="button" onClick={() => navigate('/docs')} className={link}>Docs</button>
        </nav>
        <div className="ml-auto flex items-center gap-1.5">
          <a
            href={user ? homeOf(user.role) : '/login'}
            onClick={(e) => {
              e.preventDefault();
              navigate(user ? homeOf(user.role) : '/login');
            }}
            className="hidden h-10 items-center rounded-xl px-3 text-[14px] font-medium text-ink2 transition-colors hover:text-ink sm:inline-flex"
          >
            {user ? 'Dashboard' : 'Sign in'}
          </a>
          <Button onClick={() => navigate(user ? homeOf(user.role) : '/register')}>Get started</Button>
          <button
            ref={menuButton}
            type="button"
            aria-label={sheet ? 'Close menu' : 'Open menu'}
            aria-expanded={sheet}
            onClick={() => setSheet(!sheet)}
            className="grid size-11 place-items-center rounded-xl text-ink transition-transform duration-200 active:scale-95 md:hidden"
          >
            <Icon name={sheet ? 'close' : 'menu'} size={20} />
          </button>
        </div>
      </div>

      {sheet && (
        <div
          ref={sheetPanel}
          className="fixed inset-0 top-16 z-40 overflow-y-auto bg-bg px-5 pb-[max(2rem,env(safe-area-inset-bottom))] pt-6 md:hidden"
          role="dialog"
          aria-modal="true"
          aria-label="Menu"
        >
          <div className="bm-in grid gap-2">
            {sections.map((section) => (
              <button key={section.id} type="button" onClick={() => go(section.id)} className="flex min-h-[52px] w-full items-center rounded-xl px-3 text-left text-[18px] font-semibold tracking-tight text-ink active:bg-s2">
                {section.label}
              </button>
            ))}
            <button type="button" onClick={() => { setSheet(false); navigate('/apps'); }} className="flex min-h-[52px] w-full items-center rounded-xl px-3 text-left text-[18px] font-semibold tracking-tight text-ink active:bg-s2">
              Apps
            </button>
            <button type="button" onClick={() => { setSheet(false); navigate('/docs'); }} className="flex min-h-[52px] w-full items-center rounded-xl px-3 text-left text-[18px] font-semibold tracking-tight text-ink active:bg-s2">
              Docs
            </button>
            <div className="mt-2 grid gap-2">
              <Button size="lg" full onClick={() => { setSheet(false); navigate(user ? homeOf(user.role) : '/register'); }}>
                {user ? 'Dashboard' : 'Get started'}
              </Button>
              <Button size="lg" variant="soft" full onClick={() => { setSheet(false); navigate(user ? homeOf(user.role) : '/login'); }}>
                {user ? 'Dashboard' : 'Sign in'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </header>
  );
}

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { get } from './lib/api';
import { useRouter } from './router';
import { Icon } from './icons';

/**
 * Search from anywhere in the dashboard: press Ctrl+K (or Cmd+K), or use the button in the bar.
 * It finds the pages, and the things the account has (services, servers, tickets, domains); in the
 * staff area it also finds customers by name or address. Arrows move, Enter opens, Escape closes.
 */
interface Item { id: string; label: string; hint: string; to: string }

interface Entry { to: string; label: string }

export function CommandPalette({ area, pages }: { area: 'customer' | 'admin'; pages: Entry[] }) {
  const { navigate } = useRouter();
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [things, setThings] = useState<Item[]>([]);
  const [found, setFound] = useState<Item[]>([]);
  const [active, setActive] = useState(0);
  const input = useRef<HTMLInputElement>(null);
  const opener = useRef<HTMLElement | null>(null);

  const show = useCallback(() => {
    opener.current = document.activeElement as HTMLElement | null;
    setOpen(true);
  }, []);
  const hide = useCallback(() => {
    setOpen(false);
    setQuery('');
    opener.current?.focus();
  }, []);

  useEffect(() => {
    const onKey = (event: KeyboardEvent) => {
      if ((event.ctrlKey || event.metaKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        open ? hide() : show();
      } else if (event.key === 'Escape' && open) hide();
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [open, hide, show]);
  useEffect(() => {
    (window as unknown as { __openSearch?: () => void }).__openSearch = show;
  }, [show]);

  // The things of the account are read once, when the palette is first opened.
  useEffect(() => {
    if (!open || things.length > 0 || area !== 'customer') return;
    let alive = true;
    Promise.all([
      get<{ instances: { id: string; name: string; product: { name: string } }[] }>('/instances').catch(() => ({ instances: [] })),
      get<{ servers: { id: string; name: string }[] }>('/vps').catch(() => ({ servers: [] })),
      get<{ tickets: { id: string; number: number; subject: string }[] }>('/tickets').catch(() => ({ tickets: [] })),
      get<{ domains: { id: string; hostname: string }[] }>('/domains').catch(() => ({ domains: [] })),
    ]).then(([instances, servers, tickets, domains]) => {
      if (!alive) return;
      setThings([
        ...instances.instances.map((entry) => ({ id: `i${entry.id}`, label: entry.name, hint: entry.product.name, to: `/app/instances/${entry.id}` })),
        ...servers.servers.map((entry) => ({ id: `v${entry.id}`, label: entry.name, hint: 'Server', to: `/app/vps/${entry.id}` })),
        ...tickets.tickets.map((entry) => ({ id: `t${entry.id}`, label: entry.subject, hint: `Ticket #${entry.number}`, to: `/app/tickets/${entry.id}` })),
        ...domains.domains.map((entry) => ({ id: `d${entry.id}`, label: entry.hostname, hint: 'Domain', to: '/app/domains' })),
      ]);
    });
    return () => {
      alive = false;
    };
  }, [open, things.length, area]);

  // In the staff area, customers are searched on the server as the person types.
  useEffect(() => {
    if (!open || area !== 'admin' || query.trim().length < 2) {
      setFound([]);
      return;
    }
    let alive = true;
    const timer = setTimeout(() => {
      get<{ customers: { id: string; email: string; name: string | null }[] }>('/admin/customers', { search: query.trim(), role: 'all', limit: 8 })
        .then((answer) => alive && setFound(answer.customers.map((entry) => ({ id: `c${entry.id}`, label: entry.name || entry.email, hint: entry.email, to: `/admin/customers/${entry.id}` }))))
        .catch(() => alive && setFound([]));
    }, 250);
    return () => {
      alive = false;
      clearTimeout(timer);
    };
  }, [open, area, query]);

  useEffect(() => {
    if (open) setTimeout(() => input.current?.focus(), 0);
  }, [open]);

  const items = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const pageItems: Item[] = pages.map((page) => ({ id: `p${page.to}`, label: page.label, hint: 'Page', to: page.to }));
    const pool = [...pageItems, ...things, ...found];
    const seen = new Set<string>();
    return pool
      .filter((item) => (needle ? `${item.label} ${item.hint}`.toLowerCase().includes(needle) || found.includes(item) : true))
      .filter((item) => (seen.has(item.id) ? false : (seen.add(item.id), true)))
      .slice(0, 12);
  }, [pages, things, found, query]);

  useEffect(() => setActive(0), [query]);

  if (!open) return null;
  const go = (item: Item | undefined) => {
    if (!item) return;
    hide();
    navigate(item.to);
  };
  return (
    <div className="fixed inset-0 z-50 grid place-items-start justify-items-center bg-black/60 px-4 pt-[12vh]" onMouseDown={(event) => event.target === event.currentTarget && hide()}>
      <div role="dialog" aria-modal="true" aria-label="Search" className="w-full max-w-[560px] overflow-hidden rounded-2xl border border-line bg-s1 shadow-2xl">
        <div className="flex items-center gap-3 border-b border-line px-4">
          <Icon name="search" size={16} className="text-ink3" />
          <input
            ref={input}
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === 'ArrowDown') { event.preventDefault(); setActive((value) => Math.min(value + 1, items.length - 1)); }
              else if (event.key === 'ArrowUp') { event.preventDefault(); setActive((value) => Math.max(value - 1, 0)); }
              else if (event.key === 'Enter') { event.preventDefault(); go(items[active]); }
            }}
            placeholder={area === 'admin' ? 'Search pages and customers' : 'Search pages, services, tickets and domains'}
            aria-label="Search"
            aria-controls="palette-results"
            autoComplete="off"
            className="h-14 flex-1 bg-transparent text-[16px] text-ink outline-none placeholder:text-ink3"
          />
          <kbd className="rounded-md border border-line px-1.5 py-0.5 font-mono text-[11px] text-ink3">Esc</kbd>
        </div>
        <ul id="palette-results" role="listbox" className="max-h-[50vh] overflow-y-auto p-2">
          {items.length === 0 ? (
            <li className="px-3 py-6 text-center text-[14px] text-ink3">Nothing matches “{query}”.</li>
          ) : (
            items.map((item, index) => (
              <li key={item.id} role="option" aria-selected={index === active}>
                <button
                  type="button"
                  onMouseEnter={() => setActive(index)}
                  onClick={() => go(item)}
                  className={`flex w-full items-center justify-between gap-3 rounded-xl px-3 py-2.5 text-left ${index === active ? 'bg-s3' : ''}`}
                >
                  <span className="min-w-0 truncate text-[14.5px] font-medium text-ink">{item.label}</span>
                  <span className="shrink-0 text-[12.5px] text-ink3">{item.hint}</span>
                </button>
              </li>
            ))
          )}
        </ul>
      </div>
    </div>
  );
}

/** The button for the bar: it opens the palette, and says the shortcut. */
export function SearchButton() {
  return (
    <button
      type="button"
      onClick={() => (window as unknown as { __openSearch?: () => void }).__openSearch?.()}
      aria-label="Search (Ctrl+K)"
      title="Search (Ctrl+K)"
      className="grid size-10 place-items-center rounded-xl text-ink3 hover:bg-s2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
    >
      <Icon name="search" size={17} />
    </button>
  );
}

/** Switches between the theme of the system, light and dark. */
export function ThemeButton({ choice, cycle }: { choice: 'system' | 'light' | 'dark'; cycle: () => void }) {
  const label = choice === 'system' ? 'Theme: system' : choice === 'light' ? 'Theme: light' : 'Theme: dark';
  return (
    <button
      type="button"
      onClick={cycle}
      aria-label={`${label}. Press to change.`}
      title={label}
      className="grid size-10 place-items-center rounded-xl text-ink3 hover:bg-s2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
    >
      <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        {choice === 'light' ? (
          <>
            <circle cx="12" cy="12" r="4" />
            <path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4" />
          </>
        ) : choice === 'dark' ? (
          <path d="M21 12.8A8.5 8.5 0 1 1 11.2 3a6.6 6.6 0 0 0 9.8 9.8z" />
        ) : (
          <>
            <rect x="3" y="4" width="18" height="12" rx="2" />
            <path d="M8 20h8M12 16v4" />
          </>
        )}
      </svg>
    </button>
  );
}

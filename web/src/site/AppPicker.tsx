import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { Icon } from '../icons';
import type { Product } from './catalog';
import { categoryOf, categoryOrder } from './categories';
import { eur } from './pricing';
import { cx } from './ui';

/**
 * The choice of the product in the configurator.
 *
 * A button shows what is chosen and opens a panel under it. The panel has a
 * search field and the products grouped by category, so a visitor finds a
 * game or a database without walking a list of fifty names. Every product is
 * a radio of one group, so the keyboard keeps the arrows, and the panel closes
 * with Escape, with a click outside of it and when a product is chosen.
 */

export interface PickerOption {
  slug: string;
  label: string;
  product: Product;
}

export interface AppPickerProps {
  options: PickerOption[];
  /** The slug of the option that is chosen. */
  selected: string;
  onPick: (slug: string) => void;
}

export function AppPicker({ options, selected, onPick }: AppPickerProps) {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const root = useRef<HTMLDivElement>(null);
  const trigger = useRef<HTMLButtonElement>(null);
  const search = useRef<HTMLInputElement>(null);
  const name = useId();
  const panelId = useId();

  const current = options.find((option) => option.slug === selected) ?? options[0];

  const close = (restore: boolean) => {
    setOpen(false);
    setQuery('');
    if (restore) trigger.current?.focus();
  };

  useEffect(() => {
    if (!open) return;
    search.current?.focus();
    const outside = (event: MouseEvent) => {
      if (root.current && !root.current.contains(event.target as Node)) close(false);
    };
    document.addEventListener('mousedown', outside);
    return () => document.removeEventListener('mousedown', outside);
  }, [open]);

  const groups = useMemo(() => {
    const needle = query.trim().toLowerCase();
    const matching = needle ? options.filter((option) => option.label.toLowerCase().includes(needle)) : options;
    const byCategory = new Map<string, PickerOption[]>();
    for (const option of matching) {
      const list = byCategory.get(option.product.category) ?? [];
      list.push(option);
      byCategory.set(option.product.category, list);
    }
    return [...byCategory.entries()]
      .sort(([a], [b]) => categoryOrder(a) - categoryOrder(b))
      .map(([id, list]) => ({ meta: categoryOf(id), list }));
  }, [options, query]);

  if (!current) return null;
  const currentCategory = categoryOf(current.product.category);

  return (
    <div ref={root} className="relative" onKeyDown={(event) => { if (event.key === 'Escape' && open) { event.stopPropagation(); close(true); } }}>
      <button
        ref={trigger}
        type="button"
        aria-haspopup="true"
        aria-expanded={open}
        aria-controls={panelId}
        onClick={() => (open ? close(false) : setOpen(true))}
        className="flex min-h-[60px] w-full items-center gap-3 rounded-2xl border border-night-line bg-night-2 px-3 py-2.5 text-left transition-colors hover:border-snow/30 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-mint"
      >
        <span aria-hidden="true" className="grid size-10 shrink-0 place-items-center rounded-xl bg-night-3 text-[17px] text-mint">
          <Icon name={currentCategory.icon} size={17} />
        </span>
        <span className="grid min-w-0 flex-1">
          <span className="truncate text-[16px] font-semibold">{current.label}</span>
          <span className="truncate text-[13px] text-snow-2">{currentCategory.label} · from {eur(current.product.minPrice)}/month</span>
        </span>
        <span className="flex shrink-0 items-center gap-2 text-[13px] font-medium text-snow-2">
          <span className="hidden sm:inline">Change</span>
          <Icon name="chevronDown" size={14} className={cx('transition-transform duration-200', open && 'rotate-180')} />
        </span>
      </button>
      {/* The panel is in the page when it is closed, so the products are in the HTML that the server writes. */}
      {(
        <div id={panelId} hidden={!open} className="absolute inset-x-0 top-full z-20 mt-2 overflow-hidden rounded-2xl border border-night-line bg-night shadow-[0_28px_56px_-16px_rgba(0,0,0,0.75)]">
          <div className="relative border-b border-night-line p-2">
            <Icon name="search" size={14} className="pointer-events-none absolute top-1/2 left-5 -translate-y-1/2 text-snow-2" />
            <input
              ref={search}
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              aria-label="Search the apps"
              placeholder="Search games, databases, tools"
              className="h-11 w-full rounded-xl bg-night-2 pr-3 pl-10 text-[15px] text-snow placeholder:text-snow-2 focus-visible:outline-2 focus-visible:outline-mint"
            />
          </div>
          <div className="max-h-[320px] overflow-y-auto overscroll-contain p-2" role="radiogroup" aria-label="Choose an app">
            {groups.length === 0 && <p className="px-3 py-6 text-center text-[14px] text-snow-2">Nothing matches “{query}”.</p>}
            {groups.map(({ meta, list }) => (
              <div key={meta.id} role="group" aria-label={meta.label} className="mb-1 last:mb-0">
                <p aria-hidden="true" className="sticky top-0 z-10 flex items-center gap-2 bg-night px-3 py-2 text-[12.5px] font-semibold text-snow-2">
                  <Icon name={meta.icon} size={12} />
                  {meta.label}
                  <span className="num ml-auto font-medium">{list.length}</span>
                </p>
                {list.map((option) => {
                  const active = option.slug === current.slug;
                  return (
                    <label
                      key={option.slug}
                      className={cx(
                        'flex min-h-11 cursor-pointer items-center gap-3 rounded-xl px-3 py-2 text-[14.5px] font-medium transition-colors has-[:focus-visible]:outline-2 has-[:focus-visible]:outline-mint',
                        active ? 'bg-mint text-night' : 'text-snow hover:bg-night-3',
                      )}
                    >
                      <span className="min-w-0 flex-1 truncate">{option.label}</span>
                      <span className={cx('num shrink-0 text-[12.5px]', active ? 'text-night/70' : 'text-snow-2')}>{eur(option.product.minPrice)}</span>
                      {active && <Icon name="check" size={13} />}
                      <input
                        type="radio"
                        name={name}
                        className="sr-only"
                        checked={active}
                        onChange={() => {
                          onPick(option.slug);
                          close(true);
                        }}
                      />
                    </label>
                  );
                })}
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

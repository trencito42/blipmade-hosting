import { useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon, type IconName } from '../../../icons';

/** An entry of the context menu. */
export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** A key that does the same thing, shown at the right of the entry. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** A line is drawn above the entry. */
  separated?: boolean;
  onSelect: () => void;
}

/**
 * The menu of the right click.
 *
 * It opens where the pointer is and it stays inside the window. Escape, a click
 * outside, a scroll and a resize close it. The arrow keys walk the entries.
 */
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });

  // The menu is measured once it is drawn, so it can be moved back inside the window.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    const { width, height } = element.getBoundingClientRect();
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>('button:not([disabled])')?.focus();
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp') return;
      event.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>('button:not([disabled])') ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      const next = event.key === 'ArrowDown' ? (index + 1) % buttons.length : (index - 1 + buttons.length) % buttons.length;
      buttons[next]?.focus();
    };
    const onDown = (event: MouseEvent) => {
      if (!ref.current?.contains(event.target as Node)) onClose();
    };
    addEventListener('keydown', onKey);
    addEventListener('mousedown', onDown);
    addEventListener('resize', close);
    addEventListener('scroll', close, true);
    addEventListener('blur', close);
    return () => {
      removeEventListener('keydown', onKey);
      removeEventListener('mousedown', onDown);
      removeEventListener('resize', close);
      removeEventListener('scroll', close, true);
      removeEventListener('blur', close);
    };
  }, [onClose]);

  return (
    <div
      ref={ref}
      role="menu"
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-50 min-w-[220px] max-w-[280px] rounded-2xl border border-line bg-card p-1.5 shadow-2xl"
    >
      {items.map((item) => (
        <div key={item.key}>
          {item.separated && <div role="separator" className="my-1 h-px bg-line" />}
          <button
            type="button"
            role="menuitem"
            disabled={item.disabled}
            onClick={() => {
              onClose();
              item.onSelect();
            }}
            className={`flex h-10 w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
              item.danger ? 'text-bad hover:bg-bad/10 focus-visible:bg-bad/10' : 'text-ink hover:bg-s2 focus-visible:bg-s2'
            }`}
          >
            <span className="grid size-5 shrink-0 place-items-center text-ink3">{item.icon && <Icon name={item.icon} size={14} />}</span>
            <span className="min-w-0 flex-1 truncate">{item.label}</span>
            {item.hint && <span className="shrink-0 font-mono text-[11.5px] text-ink3">{item.hint}</span>}
          </button>
        </div>
      ))}
    </div>
  );
}

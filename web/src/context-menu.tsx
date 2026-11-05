import { useCallback, useEffect, useLayoutEffect, useRef, useState, type KeyboardEvent as ReactKeyboardEvent, type MouseEvent as ReactMouseEvent } from 'react';
import { createPortal } from 'react-dom';
import { Icon, type IconName } from './icons';
import { useRouter } from './router';

/**
 * The context menu of the platform: the one the File Manager has always had, shared by every list.
 *
 * Three pieces:
 * - {@link ContextMenu} draws the menu (cursor position, kept inside the window, arrows, Home, End, Escape).
 * - {@link useContextMenu} owns the state of one menu: where it is, whose it is, where the focus goes back to.
 * - {@link RowMenuButton} is the three dots of the same actions, for the phone and for the keyboard.
 *
 * The entries are plain objects ({@link MenuItem}). A page builds them once from the same handlers its buttons use, so
 * a right click never has business logic of its own.
 */

/** An entry of the context menu. */
export interface MenuItem {
  key: string;
  label: string;
  icon?: IconName;
  /** A key that does the same thing, shown at the right of the entry. Only for a key that really does it. */
  hint?: string;
  danger?: boolean;
  disabled?: boolean;
  /** Why the entry cannot be used now. Shown under the label of a disabled entry. */
  reason?: string;
  /** A line is drawn above the entry. */
  separated?: boolean;
  /** An async handler keeps the menu open with a spinner until it ends. A plain one closes the menu first. */
  onSelect: () => void | Promise<unknown>;
}

/** A list of entries for one record. An empty list means: no menu, the browser keeps its own. */
export type RowActions<T> = (row: T) => MenuItem[];

const FOCUSABLE = 'button[role="menuitem"]:not([disabled])';

/** The browser keeps its own menu where it matters: fields, editable text, a selected text, a link to another site. */
export function keepsNativeMenu(event: { target: EventTarget | null }): boolean {
  const target = event.target;
  if (!(target instanceof Element)) return false;
  if (target.closest('input,textarea,select,[contenteditable=""],[contenteditable="true"]')) return true;
  const link = target.closest('a[href]');
  if (link instanceof HTMLAnchorElement && (link.target === '_blank' || /^https?:\/\//i.test(link.getAttribute('href') ?? ''))) return true;
  const selection = typeof window !== 'undefined' ? window.getSelection() : null;
  if (selection && !selection.isCollapsed && selection.toString().trim() !== '' && selection.anchorNode && target.contains(selection.anchorNode)) return true;
  return false;
}

/**
 * The menu of the right click.
 *
 * It opens where the pointer is and stays inside the window. Escape, a click outside, a scroll, a resize and a tab
 * close it. The arrows, Home and End walk the entries. It is drawn in a portal, so a scrolling table or a sticky
 * header never cuts it, and one menu exists at a time.
 */
export default function ContextMenu({
  x,
  y,
  items,
  onClose,
  label = 'Actions',
}: {
  x: number;
  y: number;
  items: MenuItem[];
  onClose: () => void;
  label?: string;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const [position, setPosition] = useState({ left: x, top: y });
  const [pending, setPending] = useState<string | null>(null);

  // The menu is measured once it is drawn, so it can be moved back inside the window.
  useLayoutEffect(() => {
    const element = ref.current;
    if (!element) return;
    // The layout size, not the drawn one: the entrance animation scales the box a little while it is measured.
    const width = element.offsetWidth;
    const height = element.offsetHeight;
    setPosition({
      left: Math.max(8, Math.min(x, window.innerWidth - width - 8)),
      top: Math.max(8, Math.min(y, window.innerHeight - height - 8)),
    });
  }, [x, y, items.length]);

  useEffect(() => {
    ref.current?.querySelector<HTMLButtonElement>(FOCUSABLE)?.focus();
    const close = () => onClose();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onClose();
        return;
      }
      if (event.key === 'Tab') {
        onClose();
        return;
      }
      if (event.key !== 'ArrowDown' && event.key !== 'ArrowUp' && event.key !== 'Home' && event.key !== 'End') return;
      event.preventDefault();
      const buttons = Array.from(ref.current?.querySelectorAll<HTMLButtonElement>(FOCUSABLE) ?? []);
      if (!buttons.length) return;
      const index = buttons.indexOf(document.activeElement as HTMLButtonElement);
      let next = 0;
      if (event.key === 'ArrowDown') next = (index + 1) % buttons.length;
      else if (event.key === 'ArrowUp') next = (index - 1 + buttons.length) % buttons.length;
      else if (event.key === 'End') next = buttons.length - 1;
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

  const choose = (item: MenuItem) => {
    if (item.disabled || pending) return;
    const result = item.onSelect();
    if (result && typeof (result as Promise<unknown>).then === 'function') {
      // The menu stays, with a spinner on the entry, until the work ends. The handler tells its own errors.
      setPending(item.key);
      void (result as Promise<unknown>).then(
        () => onClose(),
        () => onClose(),
      );
      return;
    }
    onClose();
  };

  const menu = (
    <div
      ref={ref}
      role="menu"
      aria-label={label}
      aria-busy={pending !== null}
      style={{ left: position.left, top: position.top }}
      onContextMenu={(event) => event.preventDefault()}
      className="fixed z-[70] min-w-[220px] max-w-[300px] rounded-2xl border border-line bg-card p-1.5 shadow-2xl motion-safe:animate-[bm-menu-in_120ms_ease-out]"
    >
      {items.map((item) => {
        const blocked = Boolean(item.disabled) || (pending !== null && pending !== item.key);
        return (
          <div key={item.key}>
            {item.separated && <div role="separator" className="my-1 h-px bg-line" />}
            <button
              type="button"
              role="menuitem"
              disabled={blocked}
              aria-disabled={blocked || undefined}
              aria-busy={pending === item.key || undefined}
              title={item.disabled ? item.reason : undefined}
              onClick={() => choose(item)}
              className={`flex w-full items-center gap-3 rounded-xl px-3 text-left text-[14px] transition-colors focus-visible:outline-none disabled:cursor-not-allowed disabled:opacity-40 ${
                item.disabled && item.reason ? 'min-h-[52px] py-1.5' : 'h-10'
              } ${item.danger ? 'text-bad hover:bg-bad/10 focus-visible:bg-bad/10' : 'text-ink hover:bg-s2 focus-visible:bg-s2'}`}
            >
              <span className="grid size-5 shrink-0 place-items-center text-ink3">
                {pending === item.key ? (
                  <span aria-hidden className="size-3.5 animate-spin rounded-full border-2 border-ink3 border-t-transparent" />
                ) : (
                  item.icon && <Icon name={item.icon} size={14} />
                )}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate">{item.label}</span>
                {item.disabled && item.reason ? <span className="block truncate text-[12px] text-ink3">{item.reason}</span> : null}
              </span>
              {item.hint && <span className="shrink-0 font-mono text-[11.5px] text-ink3">{item.hint}</span>}
            </button>
          </div>
        );
      })}
    </div>
  );
  return typeof document === 'undefined' ? menu : createPortal(menu, document.body);
}

interface OpenMenu {
  x: number;
  y: number;
  items: MenuItem[];
  /** The key of the record the menu belongs to. */
  owner: string | null;
  trigger: HTMLElement | null;
}

/**
 * The state of one menu. `open` takes the pointer event (or a point), the entries of the record the pointer is on and
 * the key of that record; the entries are built at that moment, so a menu never carries the data of another record.
 *
 * It closes by itself on a change of page, and `element` is the menu to draw once, at the end of the component.
 */
export function useContextMenu() {
  const [state, setState] = useState<OpenMenu | null>(null);
  const { path } = useRouter();
  const lastTrigger = useRef<HTMLElement | null>(null);

  const close = useCallback(() => {
    setState((current) => {
      lastTrigger.current = current?.trigger ?? null;
      return null;
    });
  }, []);

  // The focus goes back to the thing the menu was opened from.
  useEffect(() => {
    if (state === null && lastTrigger.current) {
      const trigger = lastTrigger.current;
      lastTrigger.current = null;
      if (trigger.isConnected) trigger.focus({ preventScroll: true });
    }
  }, [state]);

  useEffect(() => close(), [path, close]);

  const open = useCallback((point: { x: number; y: number }, items: MenuItem[], owner: string | null = null, trigger: HTMLElement | null = null) => {
    if (!items.length) return false;
    setState({ x: point.x, y: point.y, items, owner, trigger: trigger ?? (document.activeElement instanceof HTMLElement ? document.activeElement : null) });
    return true;
  }, []);

  /** Opens the menu where an element is: the way of the keyboard and of the three dots. */
  const openAt = useCallback(
    (element: HTMLElement, items: MenuItem[], owner: string | null = null) => {
      const box = element.getBoundingClientRect();
      return open({ x: box.left + Math.min(box.width, 24), y: box.bottom }, items, owner, element);
    },
    [open],
  );

  const element = state ? <ContextMenu x={state.x} y={state.y} items={state.items} onClose={close} /> : null;
  return { open, openAt, close, owner: state?.owner ?? null, isOpen: state !== null, element };
}

/** Is this the key press that asks for the menu: the Menu key or Shift+F10. */
export function isMenuKey(event: ReactKeyboardEvent | KeyboardEvent): boolean {
  return event.key === 'ContextMenu' || (event.shiftKey && event.key === 'F10');
}

/** The handler of the right click for a record. It gives the browser back its own menu where it matters. */
export function onRecordContextMenu(
  event: ReactMouseEvent,
  menu: Pick<ReturnType<typeof useContextMenu>, 'open'>,
  items: MenuItem[],
  owner: string,
): void {
  if (keepsNativeMenu(event) || !items.length) return;
  event.preventDefault();
  menu.open({ x: event.clientX, y: event.clientY }, items, owner);
}

/** The three dots of a record: the same actions as the right click, for a finger and for the keyboard. */
export function RowMenuButton({
  items,
  owner,
  menu,
  label,
  className = '',
}: {
  items: MenuItem[];
  owner: string;
  menu: Pick<ReturnType<typeof useContextMenu>, 'openAt' | 'owner' | 'close' | 'isOpen'>;
  label: string;
  className?: string;
}) {
  if (!items.length) return null;
  const opened = menu.isOpen && menu.owner === owner;
  return (
    <button
      type="button"
      aria-haspopup="menu"
      aria-expanded={opened}
      aria-label={`Actions for ${label}`}
      data-row-menu=""
      onClick={(event) => {
        event.stopPropagation();
        if (opened) menu.close();
        else menu.openAt(event.currentTarget, items, owner);
      }}
      className={`grid size-10 shrink-0 place-items-center rounded-xl text-ink3 transition-colors hover:bg-s2 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc ${className}`}
    >
      <Icon name="ellipsis" size={16} />
    </button>
  );
}

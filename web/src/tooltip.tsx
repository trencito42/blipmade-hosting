import { createContext, useContext, useEffect, useLayoutEffect, useRef, useState } from 'react';
import { Icon } from './icons';

/**
 * Tooltips of the interface.
 *
 * An element that carries `data-tip="..."` shows that text in a bubble of the design, on hover and on keyboard focus.
 * There is one layer for the whole page, so a bubble is never cut by a table, a card or a scrolling box, and the
 * native tooltip of the browser (which cannot be styled) is not used for the hints of the app.
 *
 * A touch screen has no hover, and a tap runs the action of a button, so the bubble is for a pointer and a keyboard.
 * The info mark (`InfoTip`) is a real button: a tap opens its bubble.
 */

const TIP_ID = 'bm-tooltip';
const SHOW_DELAY = 220;
const GAP = 8;

/** `quiet` is the mode of the customer area: the explanations live in tooltips and not in paragraphs. */
const QuietContext = createContext(false);
export const QuietProvider = QuietContext.Provider;
export const useQuiet = () => useContext(QuietContext);

/** The attributes that make an element show a tip. Spread them on the element. */
export const tip = (text: string | undefined) => (text ? { 'data-tip': text } : {});

interface Shown {
  text: string;
  rect: DOMRect;
}

/** The one bubble of the page. Mounted once, by the shell. */
export function TooltipLayer() {
  const [shown, setShown] = useState<Shown | null>(null);
  const [place, setPlace] = useState<{ left: number; top: number; above: boolean } | null>(null);
  const bubble = useRef<HTMLDivElement>(null);
  const target = useRef<Element | null>(null);
  const timer = useRef<number | undefined>(undefined);

  useEffect(() => {
    const clear = () => window.clearTimeout(timer.current);
    const hide = () => {
      clear();
      target.current?.removeAttribute('aria-describedby');
      target.current = null;
      setShown(null);
      setPlace(null);
    };
    const open = (element: Element, delay: number) => {
      const text = element.getAttribute('data-tip');
      if (!text) return;
      clear();
      const show = () => {
        target.current = element;
        element.setAttribute('aria-describedby', TIP_ID);
        setShown({ text, rect: element.getBoundingClientRect() });
      };
      if (delay === 0) show();
      else timer.current = window.setTimeout(show, delay);
    };
    const tipOf = (node: EventTarget | null) => (node instanceof Element ? node.closest('[data-tip]') : null);

    const onOver = (event: PointerEvent) => {
      if (event.pointerType === 'touch') return;
      const element = tipOf(event.target);
      if (!element) {
        if (target.current || timer.current) hide();
        return;
      }
      if (element === target.current) return;
      hide();
      open(element, SHOW_DELAY);
    };
    const onLeaveWindow = () => hide();
    const onFocusIn = (event: FocusEvent) => {
      const element = tipOf(event.target);
      // Only the keyboard opens a bubble on focus: a click focuses a button too and must not leave one behind.
      if (element && (event.target as Element).matches?.(':focus-visible')) {
        hide();
        open(element, 0);
      }
    };
    const onFocusOut = () => hide();
    const onKey = (event: KeyboardEvent) => {
      if (event.key === 'Escape') hide();
    };
    const onDown = (event: PointerEvent) => {
      // A press ends the hover bubble, so it never stays over a button that was just used.
      const element = tipOf(event.target);
      if (!element || !(element as HTMLElement).dataset.tipToggle) hide();
    };
    const onClick = (event: MouseEvent) => {
      const element = tipOf(event.target);
      if (!element || !(element as HTMLElement).dataset.tipToggle) return;
      if (target.current === element) hide();
      else {
        hide();
        open(element, 0);
      }
    };
    document.addEventListener('pointerover', onOver);
    document.addEventListener('pointerdown', onDown, true);
    document.addEventListener('click', onClick);
    document.addEventListener('focusin', onFocusIn);
    document.addEventListener('focusout', onFocusOut);
    document.addEventListener('keydown', onKey);
    window.addEventListener('scroll', hide, true);
    window.addEventListener('resize', hide);
    document.documentElement.addEventListener('pointerleave', onLeaveWindow);
    return () => {
      clear();
      document.removeEventListener('pointerover', onOver);
      document.removeEventListener('pointerdown', onDown, true);
      document.removeEventListener('click', onClick);
      document.removeEventListener('focusin', onFocusIn);
      document.removeEventListener('focusout', onFocusOut);
      document.removeEventListener('keydown', onKey);
      window.removeEventListener('scroll', hide, true);
      window.removeEventListener('resize', hide);
      document.documentElement.removeEventListener('pointerleave', onLeaveWindow);
    };
  }, []);

  // The bubble is placed under the element, or above it when there is no room, and kept inside the screen.
  useLayoutEffect(() => {
    if (!shown || !bubble.current) return;
    const box = bubble.current.getBoundingClientRect();
    const { rect } = shown;
    const above = rect.bottom + GAP + box.height > window.innerHeight && rect.top - GAP - box.height > 0;
    const centre = rect.left + rect.width / 2 - box.width / 2;
    const left = Math.min(Math.max(8, centre), window.innerWidth - box.width - 8);
    const top = above ? rect.top - GAP - box.height : rect.bottom + GAP;
    setPlace({ left, top, above });
  }, [shown]);

  if (!shown) return null;
  return (
    <div
      ref={bubble}
      id={TIP_ID}
      role="tooltip"
      style={{ left: place?.left ?? -9999, top: place?.top ?? -9999 }}
      className="pointer-events-none fixed z-[80] max-w-[17rem] rounded-xl border border-line bg-s1 px-3 py-2 text-[12.5px] font-medium leading-snug text-ink shadow-[0_8px_24px_rgba(0,0,0,0.35)]"
    >
      {shown.text}
    </div>
  );
}

/** The mark of a hint: small, quiet, and a real button, so a keyboard and a tap reach the text too. */
export function InfoTip({ text, label = 'More information' }: { text: string; label?: string }) {
  return (
    <button
      type="button"
      data-tip={text}
      data-tip-toggle="true"
      aria-label={label}
      className="inline-grid size-5 shrink-0 place-items-center rounded-full text-ink3 transition-colors duration-150 hover:text-ink focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-acc"
    >
      <Icon name="info" size={13} />
    </button>
  );
}

import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * A row that scrolls sideways, with an arrow at each end that shows when there is more to see.
 * The arrows are for the mouse: a phone swipes, so they are hidden below the small breakpoint.
 * The row stays a landmark with its own name, and the arrows are plain buttons with names.
 */
export function ScrollRow({ label, children, className = '' }: { label: string; children: ReactNode; className?: string }) {
  const scroller = useRef<HTMLElement>(null);
  const [edges, setEdges] = useState({ start: false, end: false });

  const measure = useCallback(() => {
    const el = scroller.current;
    if (!el) return;
    setEdges({ start: el.scrollLeft > 2, end: el.scrollLeft + el.clientWidth < el.scrollWidth - 2 });
  }, []);

  useEffect(() => {
    const el = scroller.current;
    if (!el) return;
    measure();
    el.addEventListener('scroll', measure, { passive: true });
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(el);
    if (el.firstElementChild) observer?.observe(el.firstElementChild);
    return () => {
      el.removeEventListener('scroll', measure);
      observer?.disconnect();
    };
  }, [measure]);

  const go = (direction: 1 | -1) => {
    const el = scroller.current;
    if (el) el.scrollBy({ left: direction * Math.max(el.clientWidth * 0.7, 160), behavior: 'smooth' });
  };

  const arrow = (direction: 1 | -1, visible: boolean) => (
    <button
      type="button"
      tabIndex={visible ? 0 : -1}
      aria-label={direction === 1 ? 'Scroll right' : 'Scroll left'}
      aria-hidden={!visible}
      onClick={() => go(direction)}
      className={`absolute top-1/2 z-10 hidden size-9 -translate-y-1/2 place-items-center rounded-full border border-line bg-card text-ink shadow-md transition-opacity hover:border-ink/40 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green sm:grid ${direction === 1 ? 'right-0' : 'left-0'} ${
        visible ? 'opacity-100' : 'pointer-events-none opacity-0'
      }`}
    >
      <svg width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" aria-hidden="true">
        <path d={direction === 1 ? 'M6 3l5 5-5 5' : 'M10 3L5 8l5 5'} />
      </svg>
    </button>
  );

  return (
    <div className={`relative min-w-0 ${className}`}>
      {arrow(-1, edges.start)}
      <nav ref={scroller} aria-label={label} className="no-scrollbar overflow-x-auto">
        {children}
      </nav>
      {arrow(1, edges.end)}
    </div>
  );
}

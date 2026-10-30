import { useEffect, useRef, type RefObject } from 'react';

/**
 * Brings the top of a view back into sight when what it shows changes.
 *
 * A filter, a tab or a search changes the content under the reader. If the
 * reader had scrolled down, the new content starts above the window and the
 * page looks as if it were stuck in the middle. When the top of the view is
 * above the window, this scrolls to it, leaving `offset` pixels for the bars
 * that stay on top. A view that is already in sight is not moved. The first
 * render does nothing: opening a page is the router's job.
 */
export function useRevealOnChange(ref: RefObject<HTMLElement | null>, deps: readonly unknown[], offset = 96) {
  const first = useRef(true);
  useEffect(() => {
    if (first.current) {
      first.current = false;
      return;
    }
    const element = ref.current;
    if (!element) return;
    const top = element.getBoundingClientRect().top;
    if (top >= offset) return;
    const reduce = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
    window.scrollTo({ top: window.scrollY + top - offset, behavior: reduce ? 'auto' : 'smooth' });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, deps);
}

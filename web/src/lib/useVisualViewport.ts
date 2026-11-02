import { useEffect, useState } from 'react';

/**
 * The part of the screen that is really visible on a phone while the keyboard is open.
 *
 * On iOS the keyboard does not shrink the layout viewport, so a panel pinned to the whole screen is pushed up and its header
 * leaves the screen. The visual viewport is the visible part: the panel takes its height and its top edge. Returns null when
 * the panel should keep its own layout (a wide screen, or a browser without the API). While the panel is open on a phone the
 * page behind it does not scroll.
 */
export function useVisualViewport(active: boolean): { height: number; top: number } | null {
  const [box, setBox] = useState<{ height: number; top: number } | null>(null);
  useEffect(() => {
    const viewport = typeof window === 'undefined' ? null : window.visualViewport;
    if (!active || !viewport || window.innerWidth >= 640) {
      setBox(null);
      return;
    }
    const update = () => setBox({ height: Math.round(viewport.height), top: Math.round(viewport.offsetTop) });
    update();
    viewport.addEventListener('resize', update);
    viewport.addEventListener('scroll', update);
    const previous = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      viewport.removeEventListener('resize', update);
      viewport.removeEventListener('scroll', update);
      document.body.style.overflow = previous;
      setBox(null);
    };
  }, [active]);
  return box;
}

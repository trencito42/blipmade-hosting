import { useEffect, useRef, useState, type RefObject } from 'react';

export const cn = (...a: (string | false | null | undefined)[]) => a.filter(Boolean).join(' ');

export function useReducedMotion(): boolean {
  const [r, setR] = useState(() => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches);
  useEffect(() => {
    const q = matchMedia('(prefers-reduced-motion: reduce)');
    const on = () => setR(q.matches);
    q.addEventListener('change', on);
    return () => q.removeEventListener('change', on);
  }, []);
  return r;
}

/** Becomes true once the element has entered the viewport. */
export function useInView<T extends HTMLElement>(margin = '0px 0px -10% 0px'): [RefObject<T | null>, boolean] {
  const ref = useRef<T | null>(null);
  const [seen, setSeen] = useState(false);
  useEffect(() => {
    const el = ref.current;
    if (!el || seen) return;
    if (typeof IntersectionObserver !== 'function') { setSeen(true); return; }
    const io = new IntersectionObserver((e) => { if (e.some((x) => x.isIntersecting)) { setSeen(true); io.disconnect(); } }, { rootMargin: margin });
    io.observe(el);
    return () => io.disconnect();
  }, [margin, seen]);
  return [ref, seen];
}

export function useScrollY(): number {
  const [y, setY] = useState(0);
  useEffect(() => {
    let raf = 0;
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(() => setY(window.scrollY)); };
    on();
    addEventListener('scroll', on, { passive: true });
    return () => { removeEventListener('scroll', on); cancelAnimationFrame(raf); };
  }, []);
  return y;
}

export const eur = (n: number) => `€${n.toFixed(2)}`;

export const clamp = (n: number, a = 0, b = 1) => Math.min(b, Math.max(a, n));
export const ease = (t: number) => 1 - Math.pow(1 - clamp(t), 3);

/** 0 to 1 progress of scrolling through a tall element that contains a sticky child. */
export function useStickyProgress<T extends HTMLElement>(): [RefObject<T | null>, number] {
  const ref = useRef<T | null>(null);
  const [p, setP] = useState(0);
  useEffect(() => {
    let raf = 0;
    const calc = () => {
      const el = ref.current;
      if (!el) return;
      const r = el.getBoundingClientRect();
      setP(clamp(-r.top / Math.max(1, r.height - innerHeight)));
    };
    const on = () => { cancelAnimationFrame(raf); raf = requestAnimationFrame(calc); };
    calc();
    addEventListener('scroll', on, { passive: true });
    addEventListener('resize', on);
    return () => { removeEventListener('scroll', on); removeEventListener('resize', on); cancelAnimationFrame(raf); };
  }, []);
  return [ref, p];
}

/** Eases a displayed number toward `value` whenever it changes. */
export function useTween(value: number, ms = 320): number {
  const reduced = useReducedMotion();
  const [v, setV] = useState(value);
  const from = useRef(value);
  useEffect(() => {
    if (reduced) { setV(value); from.current = value; return; }
    const a = from.current, t0 = performance.now();
    let raf = 0;
    const tick = (t: number) => {
      const k = clamp((t - t0) / ms);
      const cur = a + (value - a) * ease(k);
      from.current = cur; setV(cur);
      if (k < 1) raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [value, ms, reduced]);
  return v;
}

export function useMediaQuery(q: string): boolean {
  const [m, setM] = useState(() => typeof matchMedia === 'function' && matchMedia(q).matches);
  useEffect(() => {
    const mq = matchMedia(q);
    const on = () => setM(mq.matches);
    on();
    mq.addEventListener('change', on);
    return () => mq.removeEventListener('change', on);
  }, [q]);
  return m;
}

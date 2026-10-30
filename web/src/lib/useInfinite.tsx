import { useCallback, useEffect, useRef, useState } from 'react';

export interface InfinitePage<T, C> {
  items: T[];
  /** Where the next page starts. Null when this was the last page. */
  next: C | null;
}

/**
 * A list that loads the next page when the reader reaches its end.
 *
 * The first page is read when the filters change (the dependencies), and every following page
 * is read with the cursor the last page gave. A failure of a later page keeps what is already
 * on the screen and offers a retry. `sentinel` is the ref of an element at the end of the
 * list: when it comes into view, the next page is read. A button does the same for the keyboard.
 */
export function useInfiniteList<T, C>(
  load: (cursor: C | null, signal: AbortSignal) => Promise<InfinitePage<T, C>>,
  deps: unknown[],
) {
  const [items, setItems] = useState<T[]>([]);
  const [next, setNext] = useState<C | null>(null);
  const [started, setStarted] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadingMore, setLoadingMore] = useState(false);
  const [error, setError] = useState<Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const loadRef = useRef(load);
  loadRef.current = load;
  const busy = useRef(false);
  const generation = useRef(0);
  const sentinel = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const controller = new AbortController();
    const mine = ++generation.current;
    busy.current = true;
    setLoading(true);
    setError(null);
    loadRef
      .current(null, controller.signal)
      .then((page) => {
        if (mine !== generation.current) return;
        setItems(page.items);
        setNext(page.next);
        setStarted(true);
      })
      .catch((failure: unknown) => {
        if (mine !== generation.current || controller.signal.aborted) return;
        setError(failure instanceof Error ? failure : new Error(String(failure)));
      })
      .finally(() => {
        if (mine !== generation.current) return;
        busy.current = false;
        setLoading(false);
      });
    return () => controller.abort();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const loadMore = useCallback(() => {
    if (busy.current || next === null) return;
    busy.current = true;
    setLoadingMore(true);
    setError(null);
    const mine = generation.current;
    const controller = new AbortController();
    loadRef
      .current(next, controller.signal)
      .then((page) => {
        if (mine !== generation.current) return;
        setItems((current) => [...current, ...page.items]);
        setNext(page.next);
      })
      .catch((failure: unknown) => {
        if (mine !== generation.current) return;
        setError(failure instanceof Error ? failure : new Error(String(failure)));
      })
      .finally(() => {
        busy.current = false;
        setLoadingMore(false);
      });
  }, [next]);

  useEffect(() => {
    const el = sentinel.current;
    if (!el || next === null || typeof IntersectionObserver === 'undefined') return;
    const observer = new IntersectionObserver((entries) => {
      if (entries.some((entry) => entry.isIntersecting)) loadMore();
    }, { rootMargin: '240px' });
    observer.observe(el);
    return () => observer.disconnect();
  }, [next, loadMore, items.length]);

  return {
    items,
    loading: loading && !started,
    refreshing: loading && started,
    loadingMore,
    error,
    hasMore: next !== null,
    loadMore,
    reload: () => setNonce((n) => n + 1),
    sentinel,
  };
}

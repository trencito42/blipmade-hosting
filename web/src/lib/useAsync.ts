import { useCallback, useEffect, useRef, useState } from 'react';
import { ApiError } from './api';

export interface AsyncState<T> {
  data: T | undefined;
  loading: boolean;
  error: ApiError | Error | null;
  reload: () => void;
  setData: (value: T) => void;
}

/**
 * Small request helper that gives every data region the four states the design
 * system requires: loading, empty, error and populated.
 */
export function useAsync<T>(fn: (signal: AbortSignal) => Promise<T>, deps: unknown[] = []): AsyncState<T> {
  const [data, setData] = useState<T | undefined>(undefined);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<ApiError | Error | null>(null);
  const [nonce, setNonce] = useState(0);
  const fnRef = useRef(fn);
  fnRef.current = fn;

  useEffect(() => {
    const controller = new AbortController();
    let active = true;
    setLoading(true);
    setError(null);
    fnRef
      .current(controller.signal)
      .then((value) => {
        if (!active) return;
        setData(value);
        setLoading(false);
      })
      .catch((err: unknown) => {
        if (!active || controller.signal.aborted) return;
        setError(err instanceof Error ? err : new Error(String(err)));
        setLoading(false);
      });
    return () => {
      active = false;
      controller.abort();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [...deps, nonce]);

  const reload = useCallback(() => setNonce((n) => n + 1), []);
  return { data, loading, error, reload, setData };
}

/** Wraps a mutation with pending state and an optional error message. */
export function useAction<TArgs extends unknown[], TResult>(
  fn: (...args: TArgs) => Promise<TResult>,
): {
  run: (...args: TArgs) => Promise<TResult | undefined>;
  pending: boolean;
  error: string | null;
  /** What the API said about each field that was wrong, by the name of the field. */
  fieldErrors: Record<string, string>;
  clearError: () => void;
} {
  const [pending, setPending] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [fieldErrors, setFieldErrors] = useState<Record<string, string>>({});

  const run = useCallback(
    async (...args: TArgs) => {
      setPending(true);
      setError(null);
      setFieldErrors({});
      try {
        return await fn(...args);
      } catch (err) {
        if (err instanceof ApiError && err.fields) {
          // The key of a nested field is its last part: "billingAddress.city" is "city" for the form.
          const flat: Record<string, string> = {};
          for (const [key, text] of Object.entries(err.fields)) flat[key.split('.').pop() ?? key] = text;
          setFieldErrors(flat);
        }
        setError(err instanceof ApiError ? err.message : err instanceof Error ? err.message : 'Request failed.');
        return undefined;
      } finally {
        setPending(false);
      }
    },
    [fn],
  );

  return { run, pending, error, fieldErrors, clearError: () => { setError(null); setFieldErrors({}); } };
}

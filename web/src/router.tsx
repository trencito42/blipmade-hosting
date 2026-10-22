import { createContext, useContext, useEffect, useMemo, useState, type AnchorHTMLAttributes, type MouseEvent, type ReactNode } from 'react';

export interface RouterState {
  /** Pathname only, without query or hash. */
  path: string;
  /** Raw query string, without the leading `?`. */
  search: string;
  /** Parsed query parameters. */
  query: Record<string, string>;
  navigate: (to: string, options?: { replace?: boolean }) => void;
}

const Ctx = createContext<RouterState>({ path: '/', search: '', query: {}, navigate: () => {} });
export const useRouter = () => useContext(Ctx);

/** Route parameters of the currently matched route. */
const ParamsCtx = createContext<Record<string, string>>({});
export const useParams = () => useContext(ParamsCtx);
export const ParamsProvider = ParamsCtx.Provider;

function readLocation() {
  return { path: location.pathname, search: location.search.replace(/^\?/, '') };
}

export function Router({ children }: { children: ReactNode }) {
  const [state, setState] = useState(readLocation);

  useEffect(() => {
    const on = () => setState(readLocation());
    addEventListener('popstate', on);
    // Keep the router in sync with programmatic history calls from any module.
    const push = history.pushState.bind(history);
    const replace = history.replaceState.bind(history);
    history.pushState = (...args: Parameters<History['pushState']>) => {
      push(...args);
      on();
    };
    history.replaceState = (...args: Parameters<History['replaceState']>) => {
      replace(...args);
      on();
    };
    return () => {
      removeEventListener('popstate', on);
      history.pushState = push;
      history.replaceState = replace;
    };
  }, []);

  const value = useMemo<RouterState>(() => {
    const query: Record<string, string> = {};
    for (const [key, val] of new URLSearchParams(state.search)) query[key] = val;
    const navigate = (to: string, options?: { replace?: boolean }) => {
      const url = new URL(to, location.origin);
      if (options?.replace) history.replaceState(null, '', url.pathname + url.search + url.hash);
      else history.pushState(null, '', url.pathname + url.search + url.hash);
      setState(readLocation());
      scrollTo(0, 0);
    };
    return { path: state.path, search: state.search, query, navigate };
  }, [state.path, state.search]);

  return <Ctx.Provider value={value}>{children}</Ctx.Provider>;
}

export function Link({ to, onClick, ...rest }: { to: string } & AnchorHTMLAttributes<HTMLAnchorElement>) {
  const { navigate } = useRouter();
  const click = (e: MouseEvent<HTMLAnchorElement>) => {
    onClick?.(e);
    if (e.defaultPrevented || e.metaKey || e.ctrlKey || e.shiftKey || e.button !== 0) return;
    e.preventDefault();
    navigate(to);
  };
  return <a href={to} onClick={click} {...rest} />;
}

/**
 * Matches a path against a route pattern such as `/app/instances/:id`.
 * Returns the extracted parameters, or null when the pattern does not apply.
 */
export function matchPath(pattern: string, path: string): Record<string, string> | null {
  const patternParts = pattern.split('/').filter(Boolean);
  const pathParts = path.split('/').filter(Boolean);
  if (patternParts.length !== pathParts.length) return null;
  const params: Record<string, string> = {};
  for (let i = 0; i < patternParts.length; i++) {
    const expected = patternParts[i]!;
    const actual = pathParts[i]!;
    if (expected.startsWith(':')) params[expected.slice(1)] = decodeURIComponent(actual);
    else if (expected !== actual) return null;
  }
  return params;
}

export function scrollToId(id: string) {
  const el = document.getElementById(id);
  if (!el) return;
  el.scrollIntoView({ behavior: matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth', block: 'start' });
}

/** Only same-site relative paths are safe as post-login redirects. */
export function safeNext(value: string | undefined | null): string | null {
  if (!value) return null;
  if (!value.startsWith('/') || value.startsWith('//')) return null;
  return value;
}

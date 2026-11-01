import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { get } from './api';

/** The public key of the human check, or null when the platform does not use one. */
export function useTurnstileKey(): string | null {
  const [key, setKey] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    get<{ turnstileSiteKey: string | null }>('/config/public')
      .then((result) => { if (alive) setKey(result.turnstileSiteKey); })
      .catch(() => undefined);
    return () => { alive = false; };
  }, []);
  return key;
}

declare global {
  interface Window {
    turnstile?: {
      render: (element: HTMLElement, options: Record<string, unknown>) => string;
      remove: (id: string) => void;
    };
  }
}

const SCRIPT = 'https://challenges.cloudflare.com/turnstile/v0/api.js?render=explicit';

function loadScript(): Promise<void> {
  if (window.turnstile) return Promise.resolve();
  return new Promise((resolve, reject) => {
    const existing = document.querySelector<HTMLScriptElement>(`script[src="${SCRIPT}"]`);
    const script = existing ?? Object.assign(document.createElement('script'), { src: SCRIPT, async: true });
    script.addEventListener('load', () => resolve());
    script.addEventListener('error', () => reject(new Error('The human check could not be loaded.')));
    if (!existing) document.head.appendChild(script);
  });
}

/** The human check of Cloudflare. It is loaded only where it is shown, and reports a token. */
export function Turnstile({ siteKey, onToken }: { siteKey: string; onToken: (token: string | null) => void }) {
  const box = useRef<HTMLDivElement>(null);
  useEffect(() => {
    let widget: string | null = null;
    let gone = false;
    loadScript()
      .then(() => {
        if (gone || !box.current || !window.turnstile) return;
        widget = window.turnstile.render(box.current, {
          sitekey: siteKey,
          // Fills the width of the form, in the theme of the page.
          size: 'flexible',
          theme: document.documentElement.getAttribute('data-theme') === 'light' ? 'light' : 'dark',
          callback: (token: string) => onToken(token),
          'expired-callback': () => onToken(null),
          'error-callback': () => onToken(null),
        });
      })
      .catch(() => onToken(null));
    return () => {
      gone = true;
      if (widget && window.turnstile) window.turnstile.remove(widget);
    };
  }, [siteKey, onToken]);
  return <div ref={box} className="w-full" />;
}

/**
 * The human check of a form. `widget` is empty when the platform does not use one, `ready` says whether the
 * form may be sent, and `reset` asks for a new check: a token works once, so every attempt uses it up.
 */
export function useHumanCheck(): { token: string | null; ready: boolean; widget: ReactNode; reset: () => void } {
  const siteKey = useTurnstileKey();
  const [token, setToken] = useState<string | null>(null);
  const [round, setRound] = useState(0);
  const onToken = useCallback((value: string | null) => setToken(value), []);
  const reset = useCallback(() => {
    setToken(null);
    setRound((value) => value + 1);
  }, []);
  return {
    token,
    ready: siteKey === null || token !== null,
    widget: siteKey ? <Turnstile key={round} siteKey={siteKey} onToken={onToken} /> : null,
    reset,
  };
}

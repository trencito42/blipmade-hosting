import { useCallback, useEffect, useState } from 'react';

/**
 * The theme of the dashboard: the system's choice, light or dark. It is kept in this browser only,
 * and it is applied to <html> while the dashboard or the staff area is open; the public site keeps
 * its own look.
 */
export type ThemeChoice = 'system' | 'light' | 'dark';
const KEY = 'bm-theme';

export function readTheme(): ThemeChoice {
  try {
    const value = localStorage.getItem(KEY);
    return value === 'light' || value === 'dark' ? value : 'system';
  } catch {
    return 'system';
  }
}

function resolved(choice: ThemeChoice): 'light' | 'dark' {
  if (choice !== 'system') return choice;
  return typeof window !== 'undefined' && window.matchMedia?.('(prefers-color-scheme: light)').matches ? 'light' : 'dark';
}

export function applyTheme(choice: ThemeChoice): void {
  const root = document.documentElement;
  if (resolved(choice) === 'light') root.setAttribute('data-theme', 'light');
  else root.removeAttribute('data-theme');
}

export function clearTheme(): void {
  document.documentElement.removeAttribute('data-theme');
}

export function useTheme(): { choice: ThemeChoice; cycle: () => void } {
  const [choice, setChoice] = useState<ThemeChoice>(readTheme);
  useEffect(() => {
    applyTheme(choice);
    if (choice !== 'system' || !window.matchMedia) return;
    const media = window.matchMedia('(prefers-color-scheme: light)');
    const onChange = () => applyTheme('system');
    media.addEventListener('change', onChange);
    return () => media.removeEventListener('change', onChange);
  }, [choice]);
  useEffect(() => clearTheme, []);
  const cycle = useCallback(() => {
    setChoice((current) => {
      const next: ThemeChoice = current === 'system' ? 'light' : current === 'light' ? 'dark' : 'system';
      try {
        localStorage.setItem(KEY, next);
      } catch {
        /* the choice lasts until the page is closed */
      }
      return next;
    });
  }, []);
  return { choice, cycle };
}

import { useMemo, type ReactNode } from 'react';
import { useAsync } from '../lib/useAsync';
import { get } from '../lib/api';
import { useRouter } from '../router';
import { socialIconClasses } from '../icon-map';

const NAME: Record<string, string> = { github: 'GitHub', google: 'Google', discord: 'Discord', apple: 'Apple' };

export const SOCIAL_BUTTON =
  'flex min-h-12 min-w-0 items-center justify-center gap-2.5 rounded-full border border-line bg-night-2 px-4 text-[15px] font-semibold text-ink transition-colors hover:bg-night-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green disabled:opacity-60';

/**
 * The other ways in: the button of the page itself (the passkey) on its own
 * row, then the providers side by side on one row under a divider.
 */
export function SocialAuthSection({ intent = 'login', leading, label = 'or continue with' }: { intent?: 'login' | 'link'; leading?: ReactNode; label?: string }) {
  const { query } = useRouter();
  const { data } = useAsync(async (signal) => get<{ providers: { id: string; label: string; enabled: boolean }[] }>('/oauth/providers', undefined, signal), []);
  const enabled = useMemo(() => (data?.providers ?? []).filter((p) => p.enabled), [data]);
  if (enabled.length === 0 && !leading) return null;

  const returnTo = typeof query.next === 'string' ? query.next : undefined;

  const columns = enabled.length <= 3 ? Math.max(enabled.length, 1) : 2;

  return (
    <div className="grid gap-4">
      {leading}
      {enabled.length > 0 ? (
        <>
          <p aria-hidden="true" className="flex items-center gap-3 text-[13px] text-ink-3">
            <span className="h-px flex-1 bg-line" />
            {label}
            <span className="h-px flex-1 bg-line" />
          </p>
          <div className="grid gap-2.5" style={{ gridTemplateColumns: `repeat(${columns}, minmax(0, 1fr))` }}>
            {enabled.map((provider) => {
              const mark = socialIconClasses(provider.id);
              const name = NAME[provider.id] ?? provider.label;
              return (
                <a
                  key={provider.id}
                  href={`/api/oauth/${provider.id}/start?intent=${intent}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}
                  aria-label={`Continue with ${name}`}
                  title={`Continue with ${name}`}
                  className={SOCIAL_BUTTON}
                >
                  {mark ? <i aria-hidden="true" className={`${mark} text-[19px]`} /> : null}
                  <span className="truncate">{name}</span>
                </a>
              );
            })}
          </div>
        </>
      ) : null}
    </div>
  );
}

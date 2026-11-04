import { useMemo } from 'react';
import { useAsync } from '../lib/useAsync';
import { get } from '../lib/api';
import { useRouter } from '../router';

const ICON: Record<string, string> = {
  github: 'Continue with GitHub',
  google: 'Continue with Google',
  discord: 'Continue with Discord',
  apple: 'Continue with Apple',
};

export function SocialAuthSection({ intent = 'login' }: { intent?: 'login' | 'link' }) {
  const { query } = useRouter();
  const { data } = useAsync(async (signal) => get<{ providers: { id: string; label: string; enabled: boolean }[] }>('/oauth/providers', undefined, signal), []);
  const enabled = useMemo(() => (data?.providers ?? []).filter((p) => p.enabled), [data]);
  if (enabled.length === 0) return null;

  const returnTo = typeof query.next === 'string' ? query.next : undefined;

  return (
    <div className="grid gap-3">
      <p aria-hidden="true" className="flex items-center gap-3 text-[13px] text-ink-3">
        <span className="h-px flex-1 bg-line" />
        or continue with
        <span className="h-px flex-1 bg-line" />
      </p>
      <div className="grid gap-2">
        {enabled.map((provider) => (
          <a
            key={provider.id}
            href={`/api/oauth/${provider.id}/start?intent=${intent}${returnTo ? `&returnTo=${encodeURIComponent(returnTo)}` : ''}`}
            className="flex min-h-12 items-center justify-center rounded-full border border-line bg-night-2 px-5 text-[15px] font-semibold text-ink transition-colors hover:bg-night-3 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-green"
          >
            {ICON[provider.id] ?? `Continue with ${provider.label}`}
          </a>
        ))}
      </div>
    </div>
  );
}

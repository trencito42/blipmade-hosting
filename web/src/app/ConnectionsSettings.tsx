import { useMemo, useState } from 'react';
import { ApiError, del, get, post } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { Link, useRouter } from '../router';
import {
  ButtonLink,
  ConfirmDialog,
  ErrorState,
  ListRow,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  StatusPill,
  TextInput,
  useToast,
} from '../ui-app';

interface ConnectionsResponse {
  providers: { id: string; label: string; enabled: boolean }[];
  identities: {
    provider: string;
    displayName: string | null;
    avatarUrl: string | null;
    connectedAt: string;
    lastUsedAt: string | null;
  }[];
  githubInstallations: {
    id: string;
    accountLogin: string;
    accountType: string;
    repositoryCount: number;
    connectedAt: string;
  }[];
  discordCommunity: { syncState: string; joinedAt: string | null; lastError: string | null } | null;
}

const PROVIDER_META: Record<string, { title: string; blurb: string; initial: string }> = {
  github: { title: 'GitHub', blurb: 'Sign in with GitHub.', initial: 'GH' },
  google: { title: 'Google', blurb: 'Sign in with Google.', initial: 'G' },
  discord: { title: 'Discord', blurb: 'Sign in with Discord.', initial: 'D' },
  apple: { title: 'Apple', blurb: 'Sign in with Apple.', initial: 'A' },
};

function ProviderAvatar({ linked, initial }: { linked: ConnectionsResponse['identities'][number] | undefined; initial: string }) {
  const [broken, setBroken] = useState(false);
  if (linked?.avatarUrl && !broken) {
    return (
      <img
        src={linked.avatarUrl}
        alt=""
        width={44}
        height={44}
        className="size-11 shrink-0 rounded-full bg-night-3 object-cover ring-1 ring-line/80"
        onError={() => setBroken(true)}
      />
    );
  }
  return (
    <div
      aria-hidden
      className="flex size-11 shrink-0 items-center justify-center rounded-full bg-night-3 text-[12px] font-bold tracking-wide text-ink2 ring-1 ring-line/80"
    >
      {initial}
    </div>
  );
}

export function ConnectionsSettings() {
  const toast = useToast();
  const { query } = useRouter();
  const [password, setPassword] = useState('');
  const [disconnectProvider, setDisconnectProvider] = useState<string | null>(null);
  const { data, error, loading, reload } = useAsync(async (signal) => get<ConnectionsResponse>('/account/connections', undefined, signal), []);
  const link = useAction(async (provider: string) => {
    const answer = await post<{ url: string }>(`/account/connections/${provider}/link`, { returnTo: '/app/settings/connections' });
    window.location.href = answer.url;
  });
  const unlink = useAction(async (provider: string) => {
    await del(`/account/connections/${provider}`, { password: password || undefined });
    setPassword('');
    setDisconnectProvider(null);
    toast.push('Disconnected', 'ok');
    reload();
  });
  const installGithub = useAction(async () => {
    const answer = await post<{ url: string }>('/integrations/github/install', {});
    window.location.href = answer.url;
  });
  const syncGithub = useAction(async (installationId: string) => {
    await post(`/integrations/github/installations/${installationId}/sync`, {});
    toast.push('Repositories refreshed', 'ok');
    reload();
  });

  const banner = useMemo(() => {
    if (query.linked === '1') return { tone: 'good' as const, text: 'Provider linked successfully.' };
    if (query.github === 'connected') return { tone: 'good' as const, text: 'GitHub App connected. Refresh repositories below.' };
    if (query.error === 'linked_elsewhere') return { tone: 'bad' as const, text: 'That provider account is already linked to another Blipmade account.' };
    return null;
  }, [query]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message="Could not load connections." onRetry={reload} />;

  const identityMap = new Map(data.identities.map((row) => [row.provider, row]));
  const enabledProviders = data.providers.filter((p) => p.enabled);

  return (
    <div className="mx-auto grid max-w-3xl gap-6">
      {banner ? (
        <p
          role="status"
          className={`rounded-2xl px-4 py-3 text-[14px] ${banner.tone === 'good' ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}
        >
          {banner.text}
        </p>
      ) : null}

      <Panel
        title="Sign-in providers"
        description="Use these to sign in. They do not grant access to your repositories or Discord server roles."
      >
        <ul className="grid gap-2">
          {enabledProviders.map((provider) => {
            const linked = identityMap.get(provider.id);
            const meta = PROVIDER_META[provider.id] ?? { title: provider.label, blurb: '', initial: provider.label.slice(0, 2).toUpperCase() };
            return (
              <li key={provider.id}>
                <div className="flex min-w-0 items-center gap-3 rounded-xl border border-line bg-card p-3.5">
                  <ProviderAvatar linked={linked} initial={meta.initial} />
                  <div className="w-0 min-w-0 flex-1">
                    <p className="truncate text-[15.5px] font-medium tracking-[-0.02em] text-ink">{meta.title}</p>
                    <p className="mt-0.5 truncate text-[13px] text-ink3">
                      {linked
                        ? `${linked.displayName ?? 'Connected'} · since ${new Date(linked.connectedAt).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' })}`
                        : meta.blurb}
                    </p>
                  </div>
                  <div className="shrink-0">
                    {linked ? (
                      <div className="flex flex-wrap items-center justify-end gap-2">
                        <StatusPill status="available" label="Connected" />
                        <SoftButton onClick={() => setDisconnectProvider(provider.id)}>Disconnect</SoftButton>
                      </div>
                    ) : (
                      <PrimaryButton disabled={link.pending} onClick={() => link.run(provider.id).catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start linking', 'error'))}>
                        Connect
                      </PrimaryButton>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel
        title="GitHub repositories"
        description="Install the Blipmade GitHub App to deploy private repositories. Signing in with GitHub is not enough."
        action={
          data.githubInstallations.length === 0 ? (
            <PrimaryButton disabled={installGithub.pending} onClick={() => installGithub.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Install failed', 'error'))}>
              Connect GitHub App
            </PrimaryButton>
          ) : null
        }
      >
        {data.githubInstallations.length === 0 ? (
          <p className="rounded-xl border border-dashed border-line/80 bg-night-2/30 px-4 py-5 text-[14px] leading-relaxed text-ink2">
            No installation yet. Connect the GitHub App above, choose repositories on GitHub, then{' '}
            <Link to="/app/import" className="font-semibold text-green underline underline-offset-4">
              import a project
            </Link>
            .
          </p>
        ) : (
          <ul className="grid gap-2">
            {data.githubInstallations.map((inst) => (
              <li key={inst.id}>
                <ListRow
                  title={inst.accountLogin}
                  meta={`${inst.accountType} · ${inst.repositoryCount} repo${inst.repositoryCount === 1 ? '' : 's'}`}
                  right={
                    <SoftButton disabled={syncGithub.pending} onClick={() => syncGithub.run(inst.id)}>
                      Refresh
                    </SoftButton>
                  }
                />
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Discord community" description="Optional server membership and role sync — separate from Discord sign-in.">
        {data.discordCommunity?.joinedAt ? (
          <p className="text-[14px] text-ink2">
            Member since {new Date(data.discordCommunity.joinedAt).toLocaleDateString('en-GB')}. Sync: {data.discordCommunity.syncState}.
          </p>
        ) : (
          <p className="text-[14px] text-ink2">Connect Discord under sign-in providers when community features are enabled for your environment.</p>
        )}
        {data.discordCommunity?.lastError ? <p className="mt-2 text-[13px] text-bad">{data.discordCommunity.lastError}</p> : null}
      </Panel>

      <ButtonLink to="/app/settings?tab=security" variant="soft">
        Back to settings
      </ButtonLink>

      <ConfirmDialog
        open={disconnectProvider !== null}
        title="Disconnect this provider?"
        description="You will not be able to sign in with it until you connect again. If your account has a password, enter it below."
        confirmLabel="Disconnect"
        busy={unlink.pending}
        onCancel={() => {
          setDisconnectProvider(null);
          setPassword('');
        }}
        onConfirm={() => {
          if (disconnectProvider) void unlink.run(disconnectProvider).catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not disconnect', 'error'));
        }}
      >
        <TextInput label="Current password (if you use one)" type="password" value={password} onChange={(e) => setPassword(e.target.value)} autoComplete="current-password" />
      </ConfirmDialog>
    </div>
  );
}

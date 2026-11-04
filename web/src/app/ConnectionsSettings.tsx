import { useMemo, useState } from 'react';
import { ApiError, del, get, post } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { Link, useRouter } from '../router';
import { ButtonLink, ErrorState, LoadingBlock, Panel, PrimaryButton, SoftButton, TextInput, useToast } from '../ui-app';

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

const PROVIDER_COPY: Record<string, { title: string; blurb: string }> = {
  github: { title: 'GitHub', blurb: 'Sign in with your GitHub account.' },
  google: { title: 'Google', blurb: 'Sign in with your Google account.' },
  discord: { title: 'Discord', blurb: 'Sign in with Discord (identify only).' },
  apple: { title: 'Apple', blurb: 'Sign in with Apple.' },
};

export function ConnectionsSettings() {
  const toast = useToast();
  const { query } = useRouter();
  const [password, setPassword] = useState('');
  const { data, error, loading, reload } = useAsync(async (signal) => get<ConnectionsResponse>('/account/connections', undefined, signal), []);
  const link = useAction(async (provider: string) => {
    const answer = await post<{ url: string }>(`/account/connections/${provider}/link`, { returnTo: '/app/settings/connections' });
    window.location.href = answer.url;
  });
  const unlink = useAction(async (provider: string) => {
    await del(`/account/connections/${provider}`, { password: password || undefined });
    setPassword('');
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
    if (query.linked === '1') return 'Provider linked successfully.';
    if (query.github === 'connected') return 'GitHub App connected. Refresh repositories below.';
    if (query.error === 'linked_elsewhere') return 'That provider account is already linked to another Blipmade account.';
    return null;
  }, [query]);

  if (loading) return <LoadingBlock />;
  if (error || !data) return <ErrorState message="Could not load connections." onRetry={reload} />;

  const identityMap = new Map(data.identities.map((row) => [row.provider, row]));

  return (
    <div className="grid gap-6">
      {banner ? <p className="rounded-2xl bg-good/10 px-4 py-3 text-[14px] text-good">{banner}</p> : null}
      <Panel title="Sign-in providers" description="Link social accounts to sign in. This is separate from granting repository access.">
        <ul className="grid gap-4">
          {data.providers
            .filter((p) => p.enabled)
            .map((provider) => {
              const linked = identityMap.get(provider.id);
              const copy = PROVIDER_COPY[provider.id] ?? { title: provider.label, blurb: '' };
              return (
                <li key={provider.id} className="flex flex-col gap-3 border-b border-line/70 pb-4 last:border-0 sm:flex-row sm:items-center sm:justify-between">
                  <div className="flex min-w-0 items-center gap-3">
                    {linked?.avatarUrl ? <img src={linked.avatarUrl} alt="" className="size-10 rounded-full" /> : <div className="size-10 rounded-full bg-night-3" />}
                    <div>
                      <p className="text-[15px] font-semibold text-ink">{copy.title}</p>
                      <p className="text-[13px] text-ink3">{linked ? linked.displayName ?? 'Connected' : copy.blurb}</p>
                      {linked ? <p className="text-[12px] text-ink3">Connected {new Date(linked.connectedAt).toLocaleDateString()}</p> : null}
                    </div>
                  </div>
                  <div className="flex flex-wrap gap-2">
                    {linked ? (
                      <>
                        <TextInput label="Password to confirm" type="password" value={password} onChange={(e) => setPassword(e.target.value)} className="max-w-xs" />
                        <SoftButton disabled={unlink.pending} onClick={() => unlink.run(provider.id).catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not disconnect', 'error'))}>
                          Disconnect
                        </SoftButton>
                      </>
                    ) : (
                      <PrimaryButton disabled={link.pending} onClick={() => link.run(provider.id).catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start linking', 'error'))}>
                        Connect
                      </PrimaryButton>
                    )}
                  </div>
                </li>
              );
            })}
        </ul>
      </Panel>

      <Panel
        title="GitHub repositories"
        description="Install the Blipmade GitHub App to deploy private repositories. Login with GitHub does not grant repo access."
        action={
          data.githubInstallations.length === 0 ? (
            <PrimaryButton disabled={installGithub.pending} onClick={() => installGithub.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Install failed', 'error'))}>
              Connect GitHub App
            </PrimaryButton>
          ) : null
        }
      >
        {data.githubInstallations.length === 0 ? (
          <p className="text-[14px] text-ink2">No GitHub App installation yet. Use Smart Deploy → Import from GitHub after connecting.</p>
        ) : (
          <ul className="grid gap-3">
            {data.githubInstallations.map((inst) => (
              <li key={inst.id} className="flex flex-wrap items-center justify-between gap-2 rounded-xl bg-night-2/40 px-4 py-3">
                <div>
                  <p className="font-semibold text-ink">{inst.accountLogin}</p>
                  <p className="text-[13px] text-ink3">
                    {inst.accountType} · {inst.repositoryCount} repositories · since {new Date(inst.connectedAt).toLocaleDateString()}
                  </p>
                </div>
                <SoftButton disabled={syncGithub.pending} onClick={() => syncGithub.run(inst.id)}>
                  Refresh repos
                </SoftButton>
              </li>
            ))}
          </ul>
        )}
        <p className="mt-4 text-[13px] text-ink3">
          <Link to="/app/import" className="text-green underline underline-offset-4">
            Import a project from GitHub
          </Link>
        </p>
      </Panel>

      <Panel title="Discord community" description="Optional: join the official Blipmade Discord server and sync community roles. Requires a connected Discord login.">
        {data.discordCommunity?.joinedAt ? (
          <p className="text-[14px] text-ink2">Member since {new Date(data.discordCommunity.joinedAt).toLocaleDateString()}. Sync state: {data.discordCommunity.syncState}.</p>
        ) : (
          <p className="text-[14px] text-ink2">Connect Discord above, then use the community join flow when it is enabled for your environment.</p>
        )}
        {data.discordCommunity?.lastError ? <p className="mt-2 text-[13px] text-bad">{data.discordCommunity.lastError}</p> : null}
      </Panel>

      <ButtonLink to="/app/settings" variant="soft">
        Back to settings
      </ButtonLink>
    </div>
  );
}

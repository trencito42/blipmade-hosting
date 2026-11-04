import { useEffect, useMemo, useState } from 'react';
import { ApiError, del, get, post } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { Link, useParams, useRouter } from '../router';
import { useUnsavedChangesGuard, PageEditorShell } from './components/premium';
import {
  ErrorState,
  LoadingBlock,
  Panel,
  PrimaryButton,
  SoftButton,
  ButtonLink,
  StatusPill,
  TextInput,
  useEditorBack,
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
  discordCommunity: {
    enabled: boolean;
    configured: boolean;
    discordLinked: boolean;
    discordUsername: string | null;
    guildName: string | null;
    inGuild: boolean;
    syncState: string;
    joinedAt: string | null;
    lastSyncAt: string | null;
    lastError: string | null;
    managedRoles: { ruleKey: string; label: string; roleId: string; active: boolean }[];
    operatorMessage: string | null;
  };
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

const BACK_TO = '/app/settings?tab=security';
const CONNECTIONS = '/app/settings/connections';
const since = (value: string) => new Date(value).toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
const ROW = 'flex min-w-0 items-center gap-3 border-t border-line py-3.5 first:border-t-0 first:pt-0 last:pb-0';

export function ConnectionsSettings() {
  const toast = useToast();
  const { query } = useRouter();
  useEditorBack({ to: BACK_TO, label: 'Back to security', context: 'Security' });
  const { data, error, loading, reload } = useAsync(async (signal) => get<ConnectionsResponse>('/account/connections', undefined, signal), []);
  const link = useAction(async (provider: string) => {
    const answer = await post<{ url: string }>(`/account/connections/${provider}/link`, { returnTo: CONNECTIONS });
    window.location.href = answer.url;
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

  const joinDiscord = useAction(async () => {
    const answer = await post<{ url: string }>('/integrations/discord/community/join/start', {});
    window.location.href = answer.url;
  });
  const syncDiscord = useAction(async () => {
    await post('/integrations/discord/community/sync', {});
    toast.push('Discord roles synced', 'ok');
    reload();
  });
  const refreshDiscord = useAction(async () => {
    await post('/integrations/discord/community/refresh', {});
    reload();
  });

  useEffect(() => {
    if (query.discord_join === '1') void refreshDiscord.run();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [query.discord_join]);

  const banner = useMemo(() => {
    if (query.linked === '1') return { tone: 'good' as const, text: 'Provider linked successfully.' };
    if (query.disconnected === '1') return { tone: 'good' as const, text: 'Provider disconnected.' };
    if (query.discord_join === '1') return { tone: 'good' as const, text: 'Discord community authorization finished. Role sync may take a minute.' };
    if (query.github === 'connected') return { tone: 'good' as const, text: 'GitHub App connected. Refresh repositories below.' };
    if (query.error === 'github_setup') return { tone: 'bad' as const, text: 'GitHub App setup expired or was started from another session. Try Connect GitHub App again.' };
    if (query.error === 'linked_elsewhere') return { tone: 'bad' as const, text: 'That provider account is already linked to another Blipmade account.' };
    return null;
  }, [query]);

  const identityMap = new Map((data?.identities ?? []).map((row) => [row.provider, row]));
  const enabledProviders = (data?.providers ?? []).filter((p) => p.enabled);

  return (
    <div className="mx-auto grid w-full max-w-3xl gap-5 pt-3 sm:pt-5">
      <header className="grid gap-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-acc">Security</p>
        <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.04em] text-ink">Connected accounts</h1>
      </header>

      {banner ? (
        <p role="status" className={`rounded-2xl px-4 py-3 text-[14px] ${banner.tone === 'good' ? 'bg-good/10 text-good' : 'bg-bad/10 text-bad'}`}>
          {banner.text}
        </p>
      ) : null}

      {loading ? (
        <LoadingBlock />
      ) : error || !data ? (
        <ErrorState message="Could not load connections." onRetry={reload} />
      ) : (
        <>
          <Panel title="Sign-in providers" description="Use these to sign in. They do not grant access to your repositories or Discord server roles.">
            <ul>
              {enabledProviders.map((provider) => {
                const linked = identityMap.get(provider.id);
                const meta = PROVIDER_META[provider.id] ?? { title: provider.label, blurb: '', initial: provider.label.slice(0, 2).toUpperCase() };
                return (
                  <li key={provider.id} className={ROW}>
                    <ProviderAvatar linked={linked} initial={meta.initial} />
                    <div className="w-0 min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-medium tracking-[-0.02em] text-ink">{meta.title}</p>
                      <p className="mt-0.5 truncate text-[13px] text-ink3">
                        {linked ? `${linked.displayName ?? 'Connected'} · since ${since(linked.connectedAt)}` : meta.blurb}
                      </p>
                    </div>
                    <div className="flex shrink-0 items-center gap-2">
                      {linked ? (
                        <>
                          <span className="hidden sm:inline-flex"><StatusPill status="available" label="Connected" /></span>
                          <ButtonLink to={`${CONNECTIONS}/${provider.id}/disconnect`} variant="soft" title={`Stop signing in with ${meta.title}`}>
                            Disconnect
                          </ButtonLink>
                        </>
                      ) : (
                        <PrimaryButton
                          disabled={link.pending}
                          title={`Link your ${meta.title} account for sign-in`}
                          onClick={() => link.run(provider.id).catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start linking', 'error'))}
                        >
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
              <p className="text-[14px] leading-relaxed text-ink2">
                No installation yet. Connect the GitHub App, choose repositories on GitHub, then{' '}
                <Link to="/app/import" className="font-semibold text-acc underline underline-offset-4">import a project</Link>.
              </p>
            ) : (
              <ul>
                {data.githubInstallations.map((inst) => (
                  <li key={inst.id} className={ROW}>
                    <div className="w-0 min-w-0 flex-1">
                      <p className="truncate text-[15.5px] font-medium tracking-[-0.02em] text-ink">{inst.accountLogin}</p>
                      <p className="mt-0.5 truncate text-[13px] text-ink3">{inst.accountType} · {inst.repositoryCount} repo{inst.repositoryCount === 1 ? '' : 's'}</p>
                    </div>
                    <SoftButton disabled={syncGithub.pending} title="Read the list of repositories again from GitHub" onClick={() => syncGithub.run(inst.id)}>
                      Refresh
                    </SoftButton>
                  </li>
                ))}
              </ul>
            )}
          </Panel>

          <Panel title="Discord community" description="Optional membership in the Blipmade Discord server and automatic roles from your account — not required for hosting.">
            <DiscordCommunityPanel
              community={data.discordCommunity}
              discordConnectPending={link.pending}
              onConnectDiscord={() => link.run('discord').catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start linking', 'error'))}
              joinPending={joinDiscord.pending}
              onJoin={() => joinDiscord.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start join', 'error'))}
              syncPending={syncDiscord.pending}
              onSync={() => syncDiscord.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Sync failed', 'error'))}
              refreshPending={refreshDiscord.pending}
              onRefresh={() => refreshDiscord.run().catch(() => reload())}
            />
          </Panel>
        </>
      )}
    </div>
  );
}

function syncLabel(state: string): string {
  if (state === 'synced') return 'Roles up to date';
  if (state === 'error') return 'Sync error';
  if (state === 'not_member') return 'Not in server';
  if (state === 'joined') return 'Member — roles pending sync';
  return state.replaceAll('_', ' ');
}

function DiscordCommunityPanel({
  community,
  discordConnectPending,
  onConnectDiscord,
  joinPending,
  onJoin,
  syncPending,
  onSync,
  refreshPending,
  onRefresh,
}: {
  community: ConnectionsResponse['discordCommunity'];
  discordConnectPending: boolean;
  onConnectDiscord: () => void;
  joinPending: boolean;
  onJoin: () => void;
  syncPending: boolean;
  onSync: () => void;
  refreshPending: boolean;
  onRefresh: () => void;
}) {
  if (!community.enabled) {
    return <p className="text-[14px] text-ink2">{community.operatorMessage ?? 'Community server integration is not available on this environment.'}</p>;
  }

  if (community.operatorMessage && !community.discordLinked) {
    return (
      <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-[14px] text-bad">
        {community.operatorMessage}
      </p>
    );
  }

  if (!community.discordLinked) {
    return (
      <div className="grid gap-3">
        <p className="text-[14px] leading-relaxed text-ink2">
          Link Discord under <strong className="font-semibold text-ink">Sign-in providers</strong> first. That only covers login — joining the community server is a separate step.
        </p>
        <PrimaryButton disabled={discordConnectPending} onClick={onConnectDiscord}>
          Connect Discord for sign-in
        </PrimaryButton>
      </div>
    );
  }

  return (
    <div className="grid gap-4">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="text-[15px] font-medium text-ink">{community.discordUsername ?? 'Discord connected'}</p>
          <p className="mt-0.5 text-[13px] text-ink3">
            {community.guildName ? `Server: ${community.guildName}` : 'Community server'}
            {community.inGuild && community.joinedAt ? ` · member since ${since(community.joinedAt)}` : community.inGuild ? ' · member' : ' · not joined yet'}
          </p>
        </div>
        <StatusPill
          status={community.syncState === 'synced' ? 'available' : community.syncState === 'error' ? 'failed' : 'pending'}
          label={syncLabel(community.syncState)}
        />
      </div>

      {community.operatorMessage ? (
        <p role="alert" className="rounded-xl bg-bad/10 px-4 py-3 text-[13.5px] text-bad">{community.operatorMessage}</p>
      ) : null}

      {!community.inGuild ? (
        <div className="grid gap-2">
          <p className="text-[14px] text-ink2">
            You are not in the Blipmade Discord server yet. One consent step adds you with <span className="font-mono text-[13px]">guilds.join</span> — your login scopes stay minimal.
          </p>
          <PrimaryButton disabled={joinPending || Boolean(community.operatorMessage)} onClick={onJoin}>
            {joinPending ? 'Redirecting…' : 'Join Blipmade Discord'}
          </PrimaryButton>
        </div>
      ) : (
        <>
          {community.managedRoles.length > 0 ? (
            <ul className="grid gap-2">
              {community.managedRoles.map((role) => (
                <li key={role.ruleKey} className="flex items-center justify-between gap-2 rounded-xl border border-line/80 px-3 py-2 text-[13.5px]">
                  <span className="text-ink2">{role.label}</span>
                  <StatusPill status={role.active ? 'available' : 'unavailable'} label={role.active ? 'Active' : 'Not eligible'} />
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-[13px] text-ink3">No community roles are mapped yet. Operators configure mappings in Admin → Integrations → Discord.</p>
          )}
          <p className="text-[12.5px] text-ink3">
            Last sync: {community.lastSyncAt ? new Date(community.lastSyncAt).toLocaleString() : 'Never'}
          </p>
          <div className="flex flex-wrap gap-2">
            <SoftButton disabled={syncPending} onClick={onSync}>
              {syncPending ? 'Syncing…' : 'Sync roles now'}
            </SoftButton>
            <SoftButton disabled={refreshPending} onClick={onRefresh}>
              Refresh membership
            </SoftButton>
          </div>
        </>
      )}

      {community.lastError ? <p role="alert" className="text-[13px] font-medium text-bad">{community.lastError}</p> : null}
    </div>
  );
}

/** Disconnecting a provider is its own page: it can need the password, and it should not be one click away from a list. */
export function DisconnectProvider() {
  const { provider = '' } = useParams();
  const { navigate } = useRouter();
  const toast = useToast();
  const [password, setPassword] = useState('');
  const title = PROVIDER_META[provider]?.title ?? provider;
  const dirty = Boolean(password);
  useUnsavedChangesGuard(dirty, 'Discard this confirmation?');

  const unlink = useAction(async () => {
    await del(`/account/connections/${encodeURIComponent(provider)}`, { password: password || undefined });
    return true;
  });
  const submit = async () => {
    const done = await unlink.run().catch(() => false);
    if (!done) return;
    toast.push(`${title} was disconnected.`, 'ok');
    navigate(`${CONNECTIONS}?disconnected=1`, { replace: true });
  };
  const discard = () => {
    if (!dirty || window.confirm('Discard this confirmation?')) navigate(CONNECTIONS);
  };

  return (
    <PageEditorShell
      eyebrow="Connected accounts"
      title={`Disconnect ${title}`}
      description="You will not be able to sign in with it until you connect it again."
      backTo={CONNECTIONS}
      backLabel="Back to connected accounts"
      dirty={dirty}
      actions={
        <>
          <SoftButton type="button" onClick={discard} disabled={unlink.pending}>Discard</SoftButton>
          <PrimaryButton type="button" onClick={() => void submit()} disabled={unlink.pending}>
            {unlink.pending ? 'Working…' : 'Disconnect'}
          </PrimaryButton>
        </>
      }
    >
      <form noValidate onSubmit={(event) => { event.preventDefault(); void submit(); }} className="grid gap-4">
        <TextInput
          label="Current password (if you use one)"
          type="password"
          value={password}
          onChange={(event) => setPassword(event.target.value)}
          autoComplete="current-password"
          error={unlink.fieldErrors.password}
        />
        {unlink.error && !unlink.fieldErrors.password && (
          <p role="alert" className="rounded-2xl bg-bad/10 px-4 py-3 text-[13.5px] font-medium text-bad">{unlink.error}</p>
        )}
      </form>
    </PageEditorShell>
  );
}

import { useMemo, useState } from 'react';
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

          <Panel title="Discord community" description="Optional server membership and role sync, separate from Discord sign-in.">
            {data.discordCommunity?.joinedAt ? (
              <div className="grid gap-3">
                <p className="text-[14px] text-ink2">
                  Member since {since(data.discordCommunity.joinedAt)}. Sync: {data.discordCommunity.syncState}.
                </p>
                <SoftButton disabled={syncDiscord.pending} onClick={() => syncDiscord.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Sync failed', 'error'))}>
                  Sync roles now
                </SoftButton>
              </div>
            ) : identityMap.has('discord') ? (
              <div className="grid gap-3">
                <p className="text-[14px] text-ink2">Connect Discord above, then authorize joining the Blipmade community server (consent for guilds.join).</p>
                <PrimaryButton disabled={joinDiscord.pending} onClick={() => joinDiscord.run().catch((e) => toast.push(e instanceof ApiError ? e.message : 'Could not start join', 'error'))}>
                  Join community server
                </PrimaryButton>
              </div>
            ) : (
              <p className="text-[14px] text-ink2">Connect Discord under sign-in providers first.</p>
            )}
            {data.discordCommunity?.lastError ? <p className="mt-2 text-[13px] text-bad">{data.discordCommunity.lastError}</p> : null}
          </Panel>
        </>
      )}
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

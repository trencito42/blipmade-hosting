import { get } from '../lib/api';
import { useAsync } from '../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, StatusPill } from '../ui-app';
import { can, useAdminSession } from './Overview';

interface IntegrationsPayload {
  oauth: Record<string, { enabled: boolean; linkedAccounts: number }>;
  githubApp: {
    enabled: boolean;
    activeInstallations: number;
    slug: string | null;
    suspendedInstallations: { installationId: string; accountLogin: string; suspendedAt: string | null }[];
  };
  discordCommunity: {
    enabled: boolean;
    guildConfigured: boolean;
    guildName: string | null;
    botHealth: { ok: boolean; message: string | null } | null;
    membersJoined: number;
    syncErrors: number;
  };
}

export default function AdminIntegrations() {
  const session = useAdminSession();
  const mayRead = can(session.staff, 'settings.read');
  const state = useAsync<IntegrationsPayload>((signal) => get('/admin/integrations', undefined, signal), []);

  if (session.loading || state.loading) return <LoadingBlock label="Loading integrations" />;
  if (!mayRead) return <ErrorState title="No access" message="You need settings.read to view integrations." />;
  if (state.error || !state.data) return <ErrorState title="Integrations unavailable" message={state.error?.message ?? 'Unknown error'} onRetry={state.reload} />;

  const data = state.data;

  return (
    <div className="grid gap-6">
      <Panel title="OAuth providers" description="What is configured on this environment and how many accounts are linked. Apple stays off until credentials are set.">
        <ul className="grid gap-2 sm:grid-cols-2">
          {Object.entries(data.oauth).map(([id, row]) => (
            <li key={id} className="flex items-center justify-between rounded-2xl bg-s2 px-4 py-3 text-[14px]">
              <span className="font-semibold capitalize text-ink">{id}</span>
              <span className="flex items-center gap-2 text-ink2">
                <StatusPill status={row.enabled ? 'available' : 'unavailable'} label={row.enabled ? 'Enabled' : 'Off'} />
                {row.linkedAccounts} linked
              </span>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="GitHub App" description="Installations used for private repository deploys.">
        <p className="text-[14px] text-ink2">
          App slug: <span className="font-mono">{data.githubApp.slug ?? 'not configured'}</span> · {data.githubApp.activeInstallations} active installation
          {data.githubApp.activeInstallations === 1 ? '' : 's'}
        </p>
        {data.githubApp.suspendedInstallations.length === 0 ? (
          <EmptyState title="No suspended installations" description="Recent uninstalls and suspensions appear here." />
        ) : (
          <ul className="mt-3 grid gap-2 text-[13px]">
            {data.githubApp.suspendedInstallations.map((row) => (
              <li key={row.installationId} className="rounded-xl bg-s2 px-3 py-2 text-ink2">
                <span className="font-semibold text-ink">{row.accountLogin}</span> · installation {row.installationId}
                {row.suspendedAt ? ` · since ${new Date(row.suspendedAt).toLocaleString()}` : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Discord community" description="Optional Blipmade Discord server — separate from Discord sign-in.">
        <p className="text-[14px] text-ink2">
          {data.discordCommunity.enabled ? 'Community features enabled' : 'Community not configured'} · guild{' '}
          {data.discordCommunity.guildName ? `“${data.discordCommunity.guildName}”` : data.discordCommunity.guildConfigured ? 'configured' : 'missing'} ·{' '}
          {data.discordCommunity.membersJoined} members tracked · {data.discordCommunity.syncErrors} sync error
          {data.discordCommunity.syncErrors === 1 ? '' : 's'}
        </p>
        {data.discordCommunity.botHealth?.message ? (
          <p role="alert" className="mt-2 rounded-xl bg-bad/10 px-3 py-2 text-[13px] text-bad">
            {data.discordCommunity.botHealth.message}
          </p>
        ) : null}
        <ButtonLink to="/admin/settings/integrations/discord" variant="soft" className="mt-3">
          Open Discord integration
        </ButtonLink>
      </Panel>

      <ButtonLink to="/admin/settings" variant="soft">
        Back to settings
      </ButtonLink>
    </div>
  );
}

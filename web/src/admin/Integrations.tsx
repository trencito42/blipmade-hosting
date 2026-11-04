import { useState } from 'react';
import { get, put } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, SoftButton, StatusPill, TextInput, useToast } from '../ui-app';
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
    membersJoined: number;
    syncErrors: number;
    recentFailures: { userId: string; syncState: string; lastError: string | null; lastSyncAt: string | null }[];
  };
}

interface RoleMapping {
  ruleKey: string;
  discordRoleId: string;
  enabled: boolean;
}

export default function AdminIntegrations() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'settings.write');
  const mayRead = can(session.staff, 'settings.read');
  const toast = useToast();
  const state = useAsync<IntegrationsPayload>((signal) => get('/admin/integrations', undefined, signal), []);
  const roles = useAsync<{ mappings: RoleMapping[] }>((signal) => get('/admin/integrations/discord/roles', undefined, signal), []);
  const [edits, setEdits] = useState<Record<string, { discordRoleId: string; enabled: boolean }>>({});
  const saveRole = useAction(async (ruleKey: string) => {
    const row = edits[ruleKey] ?? roles.data?.mappings.find((m) => m.ruleKey === ruleKey);
    if (!row) return;
    await put(`/admin/integrations/discord/roles/${encodeURIComponent(ruleKey)}`, row);
    toast.push('Role mapping saved.', 'ok');
    roles.reload();
  });

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

      <Panel
        title="GitHub App"
        description="Installations used for private repository deploys. Suspended rows usually mean uninstall or permission loss on GitHub."
      >
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

      <Panel title="Discord community" description="Guild join and role sync — separate from Discord sign-in OAuth.">
        <p className="text-[14px] text-ink2">
          {data.discordCommunity.enabled ? 'Community features enabled' : 'Community not configured'} · guild{' '}
          {data.discordCommunity.guildConfigured ? 'set' : 'missing'} · {data.discordCommunity.membersJoined} members joined ·{' '}
          {data.discordCommunity.syncErrors} sync error{data.discordCommunity.syncErrors === 1 ? '' : 's'}
        </p>
        {data.discordCommunity.recentFailures.length > 0 && (
          <ul className="mt-3 grid gap-2 text-[13px]">
            {data.discordCommunity.recentFailures.map((row) => (
              <li key={row.userId} className="rounded-xl bg-bad/5 px-3 py-2 text-bad">
                User {row.userId.slice(0, 8)}… · {row.syncState}
                {row.lastError ? ` — ${row.lastError}` : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <Panel title="Discord role mappings" description="Blipmade-managed roles are added or removed by rule. Other server roles are left unchanged during sync.">
        {roles.loading ? (
          <LoadingBlock rows={2} />
        ) : roles.error ? (
          <ErrorState message={roles.error.message} onRetry={roles.reload} />
        ) : (
          <ul className="grid gap-3">
            {(roles.data?.mappings ?? []).map((mapping) => {
              const draft = edits[mapping.ruleKey] ?? { discordRoleId: mapping.discordRoleId, enabled: mapping.enabled };
              return (
                <li key={mapping.ruleKey} className="grid gap-2 rounded-2xl bg-s2 p-3 sm:grid-cols-[10rem_1fr_auto] sm:items-end">
                  <span className="text-[13px] font-semibold text-ink">{mapping.ruleKey}</span>
                  <TextInput
                    label="Discord role ID"
                    value={draft.discordRoleId}
                    onChange={(event) =>
                      setEdits((current) => ({
                        ...current,
                        [mapping.ruleKey]: { ...draft, discordRoleId: event.target.value },
                      }))
                    }
                    disabled={!mayWrite}
                  />
                  <label className="flex items-center gap-2 text-[13px] text-ink2">
                    <input
                      type="checkbox"
                      checked={draft.enabled}
                      disabled={!mayWrite}
                      onChange={(event) =>
                        setEdits((current) => ({
                          ...current,
                          [mapping.ruleKey]: { ...draft, enabled: event.target.checked },
                        }))
                      }
                    />
                    Enabled
                  </label>
                  {mayWrite ? (
                    <SoftButton className="sm:col-span-3 sm:w-fit" disabled={saveRole.pending} onClick={() => void saveRole.run(mapping.ruleKey)}>
                      Save
                    </SoftButton>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </Panel>

      <ButtonLink to="/admin/settings" variant="soft">
        Back to settings
      </ButtonLink>
    </div>
  );
}

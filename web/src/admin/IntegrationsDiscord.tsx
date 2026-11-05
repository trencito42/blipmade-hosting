import { useState } from 'react';
import { get, post, put } from '../lib/api';
import { useAsync, useAction } from '../lib/useAsync';
import { ButtonLink, EmptyState, ErrorState, LoadingBlock, Panel, SoftButton, StatusPill, TextInput, useToast } from '../ui-app';
import { can, densePrimary, useAdminSession } from './Overview';

interface DiscordAdminPayload {
  health: {
    ok: boolean;
    botReachable: boolean;
    guild: { id: string; name: string } | null;
    botInGuild: boolean;
    canManageRoles: boolean;
    message: string | null;
  };
  guildRoles: { id: string; name: string; managed: boolean }[];
  ruleCatalog: Record<string, { label: string; description: string }>;
  mappings: { ruleKey: string; discordRoleId: string; enabled: boolean }[];
  failures: {
    userId: string;
    discordUserId: string;
    syncState: string;
    lastError: string | null;
    lastSyncAt: string | null;
    joinedAt: string | null;
  }[];
}

export default function AdminIntegrationsDiscord() {
  const session = useAdminSession();
  const mayWrite = can(session.staff, 'settings.write');
  const mayRead = can(session.staff, 'settings.read');
  const toast = useToast();
  const state = useAsync<DiscordAdminPayload>((signal) => get('/admin/integrations/discord', undefined, signal), []);
  const reconcile = useAction(async () => {
    const answer = await post<{ reconciled: number }>('/admin/integrations/discord/reconcile', { limit: 50 });
    toast.push(`Reconciled ${answer.reconciled} linked Discord accounts.`, 'ok');
    state.reload();
  });
  const importLive = useAction(async () => {
    const answer = await post<{ channelCount: number; bindingCount: number }>('/admin/integrations/discord/server/import-live', {});
    toast.push(`Imported live template: ${answer.channelCount} channels, ${answer.bindingCount} bindings.`, 'ok');
    state.reload();
  });
  const syncContent = useAction(async (replace: boolean) => {
    const answer = await post<{ posted: string[]; skipped: string[]; errors: { slot: string }[] }>(
      '/admin/integrations/discord/server/content-sync',
      { replace },
    );
    toast.push(`Content sync: ${answer.posted.length} posted, ${answer.skipped.length} skipped.`, answer.errors.length ? 'error' : 'ok');
  });
  const syncGuildDry = useAction(async () => {
    const answer = await post<{ diff: { createChannels: unknown[]; permissionPlan: { denyEveryone: boolean }[]; protectedChannelIds: string[] } }>(
      '/admin/integrations/discord/server/sync',
      { dryRun: true },
    );
    const hidden = answer.diff.permissionPlan.filter((row) => row.denyEveryone).length;
    toast.push(
      `Dry run: ${answer.diff.createChannels.length} channels would be created. ${hidden} channels deny @everyone. Protected: ${answer.diff.protectedChannelIds.join(', ')}.`,
      'ok',
    );
  });
  const syncGuildApply = useAction(async () => {
    const answer = await post<{ createdChannels: { key: string }[]; error: string | null }>('/admin/integrations/discord/server/sync', { apply: true });
    if (answer.error) toast.push(answer.error, 'error');
    else toast.push(`Applied: ${answer.createdChannels.length} new channels. Bot will post templates where mapped.`, 'ok');
  });
  const retryUser = useAction(async (userId: string) => {
    await post(`/admin/integrations/discord/users/${encodeURIComponent(userId)}/sync`, {});
    toast.push('Sync queued for that user.', 'ok');
    state.reload();
  });

  const [edits, setEdits] = useState<Record<string, { discordRoleId: string; enabled: boolean }>>({});

  const saveMapping = async (ruleKey: string) => {
    const draft = edits[ruleKey] ?? state.data?.mappings.find((m) => m.ruleKey === ruleKey);
    if (!draft) return;
    await put(`/admin/integrations/discord/roles/${encodeURIComponent(ruleKey)}`, draft);
    toast.push('Mapping saved.', 'ok');
    state.reload();
  };

  if (session.loading || state.loading) return <LoadingBlock label="Loading Discord integration" />;
  if (!mayRead) return <ErrorState title="No access" message="You need settings.read." />;
  if (state.error || !state.data) return <ErrorState title="Discord integration unavailable" message={state.error?.message ?? 'Unknown error'} onRetry={state.reload} />;

  const { health, guildRoles, ruleCatalog, mappings, failures } = state.data;

  return (
    <div className="grid gap-6">
      <header className="grid gap-1">
        <p className="text-[12px] font-bold uppercase tracking-[0.12em] text-acc">Integrations</p>
        <h1 className="text-[clamp(1.5rem,2.6vw,2rem)] font-semibold tracking-[-0.04em] text-ink">Discord community</h1>
        <p className="max-w-2xl text-[14px] text-ink2">Guild membership and entitlement roles — separate from Discord sign-in OAuth.</p>
      </header>

      <Panel title="Bot & guild health" description="Fix permission problems here before customers can join or receive roles.">
        <ul className="grid gap-2 text-[14px] text-ink2">
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>Bot token</span>
            <StatusPill status={health.botReachable ? 'available' : 'failed'} label={health.botReachable ? 'Valid' : 'Invalid'} />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>Guild {health.guild ? `“${health.guild.name}” (${health.guild.id})` : 'not reachable'}</span>
            <StatusPill status={health.guild ? 'available' : 'failed'} label={health.guild ? 'Found' : 'Missing'} />
          </li>
          <li className="flex flex-wrap items-center justify-between gap-2">
            <span>Bot in guild · Manage Roles</span>
            <StatusPill status={health.ok ? 'available' : 'failed'} label={health.ok ? 'Ready' : health.botInGuild ? 'Missing permission' : 'Not in guild'} />
          </li>
        </ul>
        {health.message ? (
          <p role="alert" className="mt-3 rounded-xl bg-bad/10 px-4 py-3 text-[13.5px] text-bad">
            {health.message} Invite the bot with the Manage Roles permission and place its role above the roles Blipmade assigns.
          </p>
        ) : null}
        {mayWrite ? (
          <SoftButton className="mt-3" disabled={reconcile.pending || !health.ok} onClick={() => void reconcile.run()}>
            {reconcile.pending ? 'Reconciling…' : 'Reconcile all linked accounts'}
          </SoftButton>
        ) : null}
      </Panel>

      <Panel title="Role mappings" description="Map Blipmade entitlements to Discord role IDs. Only these roles are added or removed during sync.">
        <ul className="grid gap-4">
          {mappings.map((mapping) => {
            const meta = ruleCatalog[mapping.ruleKey];
            const draft = edits[mapping.ruleKey] ?? { discordRoleId: mapping.discordRoleId, enabled: mapping.enabled };
            const roleName = guildRoles.find((r) => r.id === draft.discordRoleId)?.name;
            return (
              <li key={mapping.ruleKey} className="grid gap-2 rounded-2xl bg-s2 p-4">
                <div>
                  <p className="font-semibold text-ink">{meta?.label ?? mapping.ruleKey}</p>
                  <p className="mt-1 text-[13px] text-ink2">{meta?.description}</p>
                </div>
                <div className="grid gap-2 sm:grid-cols-[1fr_auto] sm:items-end">
                  <label className="grid gap-1 text-[13px] text-ink2">
                    Discord role
                    <select
                      className="h-11 rounded-xl border border-line bg-night-2 px-3 text-[14px] text-ink"
                      value={draft.discordRoleId}
                      disabled={!mayWrite}
                      onChange={(event) => setEdits((c) => ({ ...c, [mapping.ruleKey]: { ...draft, discordRoleId: event.target.value } }))}
                    >
                      <option value="">— Not mapped —</option>
                      {guildRoles.map((role) => (
                        <option key={role.id} value={role.id}>
                          {role.name}{role.managed ? ' (managed)' : ''}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="flex items-center gap-2 text-[13px]">
                    <input type="checkbox" checked={draft.enabled} disabled={!mayWrite} onChange={(e) => setEdits((c) => ({ ...c, [mapping.ruleKey]: { ...draft, enabled: e.target.checked } }))} />
                    Enabled
                  </label>
                </div>
                {roleName ? <p className="text-[12.5px] text-ink3">Maps to @{roleName}</p> : null}
                {mayWrite ? (
                  <SoftButton className="w-fit" onClick={() => void saveMapping(mapping.ruleKey).catch((e) => toast.push(e instanceof Error ? e.message : 'Save failed', 'error'))}>
                    Save mapping
                  </SoftButton>
                ) : null}
              </li>
            );
          })}
        </ul>
      </Panel>

      <Panel title="Server template & bot posts" description="Import the current Discord layout as the template, create missing planned channels, then let the Blipmade bot post welcome/rules/status and the support panel.">
        <div className="flex flex-wrap gap-2">
          {mayWrite ? (
            <>
              <SoftButton disabled={importLive.pending} onClick={() => void importLive.run()}>Import live server</SoftButton>
              <SoftButton disabled={syncGuildDry.pending} onClick={() => void syncGuildDry.run()}>Preview channel sync</SoftButton>
              <SoftButton disabled={syncGuildApply.pending} onClick={() => void syncGuildApply.run()}>Apply channel sync</SoftButton>
              <SoftButton disabled={syncContent.pending} onClick={() => void syncContent.run(false)}>Post bot templates</SoftButton>
              <SoftButton disabled={syncContent.pending} onClick={() => void syncContent.run(true)}>Refresh bot templates</SoftButton>
            </>
          ) : (
            <p className="text-[13px] text-ink3">Requires settings.write.</p>
          )}
        </div>
        <p className="mt-3 text-[12.5px] text-ink3">Protected channel 1565844667147493376 (#bugs) is never deleted. Announcements and incidents from Admin also post to mapped Discord channels.</p>
      </Panel>

      <Panel title="Recent sync failures" description="Customers still in the guild but role updates failed (hierarchy, rate limits, missing roles).">
        {failures.length === 0 ? (
          <EmptyState title="No recent failures" description="Failed syncs appear here with the Discord error message." />
        ) : (
          <ul className="grid gap-2 text-[13px]">
            {failures.map((row) => (
              <li key={row.userId} className="flex flex-wrap items-start justify-between gap-2 rounded-xl bg-bad/5 px-3 py-2">
                <span className="text-bad">
                  User {row.userId.slice(0, 10)}… · {row.syncState}
                  {row.lastError ? ` — ${row.lastError}` : ''}
                </span>
                {mayWrite ? (
                  <button type="button" className={densePrimary} disabled={retryUser.pending} onClick={() => void retryUser.run(row.userId)}>
                    Retry
                  </button>
                ) : null}
              </li>
            ))}
          </ul>
        )}
      </Panel>

      <ButtonLink to="/admin/settings/integrations" variant="soft">
        All integrations
      </ButtonLink>
    </div>
  );
}

import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';
import { prisma } from '../../db.js';
import { botFetch, parseDiscordError } from './http.js';
import { DESIRED_GUILD_STATE_V1, PROTECTED_DISCORD_CHANNEL_IDS, type DesiredGuildState } from './desired-state.js';
import { ensureDiscordServerConfig, setChannelBinding } from './server-config.js';

export type LiveGuildChannel = {
  id: string;
  name: string;
  type: number;
  parent_id: string | null;
  topic?: string | null;
};

export type GuildStructureDiff = {
  version: number;
  guildId: string | null;
  protectedChannelIds: string[];
  protectedPresent: boolean;
  protectedChannel: LiveGuildChannel | null;
  createCategories: { key: string; name: string }[];
  createChannels: { key: string; name: string; categoryKey: string; type: 'text' | 'announcement' | 'forum'; topic?: string }[];
  bindExisting: { key: string; channelId: string; name: string }[];
  renameOrMove: { channelId: string; key: string; fromName: string; toName: string; note: string }[];
  obsoleteChannels: { id: string; name: string; type: number; reason: string }[];
  warnings: string[];
};

const CHANNEL_TYPE: Record<'text' | 'announcement' | 'forum', number> = {
  text: 0,
  announcement: 5,
  forum: 15,
};

export async function fetchGuildChannelInventory(): Promise<LiveGuildChannel[]> {
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId || !env.DISCORD_BOT_TOKEN) return [];
  const res = await botFetch(`/guilds/${guildId}/channels`);
  if (!res.ok) return [];
  return (await res.json()) as LiveGuildChannel[];
}

function desiredStateFromConfig(raw: unknown): DesiredGuildState {
  if (raw && typeof raw === 'object' && 'channels' in raw) return raw as DesiredGuildState;
  return DESIRED_GUILD_STATE_V1;
}

export async function computeGuildStructureDiff(): Promise<GuildStructureDiff> {
  const guildId = env.DISCORD_GUILD_ID || null;
  const config = await ensureDiscordServerConfig();
  const desired = desiredStateFromConfig(config.desiredState);
  const bindings = config.channelBindings;
  const protectedIds = [...new Set([...PROTECTED_DISCORD_CHANNEL_IDS, ...config.protectedChannelIds])];
  const live = await fetchGuildChannelInventory();
  const liveById = new Map(live.map((c) => [c.id, c]));
  const protectedChannel = liveById.get(protectedIds[0] ?? '') ?? null;

  const diff: GuildStructureDiff = {
    version: desired.version,
    guildId,
    protectedChannelIds: protectedIds,
    protectedPresent: Boolean(protectedChannel),
    protectedChannel,
    createCategories: [],
    createChannels: [],
    bindExisting: [],
    renameOrMove: [],
    obsoleteChannels: [],
    warnings: [],
  };

  if (!guildId) diff.warnings.push('DISCORD_GUILD_ID is not configured.');
  if (!protectedChannel) diff.warnings.push(`Protected channel ${protectedIds.join(', ')} was not found in the guild.`);

  const categoryIdByKey = new Map<string, string>();
  for (const cat of desired.categories) {
    const match = live.find((c) => c.type === 4 && c.name.toLowerCase() === cat.name.toLowerCase());
    if (match) categoryIdByKey.set(cat.key, match.id);
    else diff.createCategories.push(cat);
  }

  const boundIds = new Set(Object.values(bindings));
  for (const ch of desired.channels) {
    if (ch.preserveOnly && ch.existingId) {
      const existing = liveById.get(ch.existingId);
      if (existing) {
        diff.bindExisting.push({ key: ch.key, channelId: existing.id, name: existing.name });
      } else {
        diff.warnings.push(`Protected channel ${ch.existingId} (${ch.name}) is missing from the guild.`);
      }
      continue;
    }

    const boundId = bindings[ch.key];
    if (boundId) {
      const existing = liveById.get(boundId);
      if (existing) {
        diff.bindExisting.push({ key: ch.key, channelId: existing.id, name: existing.name });
        continue;
      }
      diff.warnings.push(`Binding for ${ch.key} points to missing channel ${boundId}.`);
    }

    const nameMatch = live.find(
      (c) => c.name === ch.name && c.type === CHANNEL_TYPE[ch.type] && !boundIds.has(c.id) && !protectedIds.includes(c.id),
    );
    if (nameMatch) {
      diff.bindExisting.push({ key: ch.key, channelId: nameMatch.id, name: nameMatch.name });
      continue;
    }

    diff.createChannels.push({
      key: ch.key,
      name: ch.name,
      categoryKey: ch.categoryKey,
      type: ch.type,
      topic: ch.topic,
    });
  }

  const desiredNames = new Set(desired.channels.map((c) => c.name));
  for (const ch of live) {
    if (protectedIds.includes(ch.id)) continue;
    if (ch.type === 4) continue;
    if (desiredNames.has(ch.name)) continue;
    if (Object.values(bindings).includes(ch.id)) continue;
    diff.obsoleteChannels.push({
      id: ch.id,
      name: ch.name,
      type: ch.type,
      reason: 'Not referenced by desired-state bindings (not deleted automatically).',
    });
  }

  return diff;
}

export async function applyGuildStructureSync(options: { dryRun?: boolean } = {}): Promise<{
  dryRun: boolean;
  diff: GuildStructureDiff;
  createdCategories: { key: string; id: string }[];
  createdChannels: { key: string; id: string }[];
  bindingsUpdated: string[];
  error: string | null;
}> {
  const dryRun = options.dryRun !== false;
  const guildId = env.DISCORD_GUILD_ID;
  if (!guildId) throw badRequest('Discord guild is not configured.');

  const diff = await computeGuildStructureDiff();
  const createdCategories: { key: string; id: string }[] = [];
  const createdChannels: { key: string; id: string }[] = [];
  const bindingsUpdated: string[] = [];

  if (dryRun) {
    return { dryRun: true, diff, createdCategories, createdChannels, bindingsUpdated, error: null };
  }

  const config = await ensureDiscordServerConfig();
  const desired = desiredStateFromConfig(config.desiredState);
  const categoryIdByKey = new Map<string, string>();
  for (const cat of desired.categories) {
    const match = (await fetchGuildChannelInventory()).find((c) => c.type === 4 && c.name.toLowerCase() === cat.name.toLowerCase());
    if (match) categoryIdByKey.set(cat.key, match.id);
  }

  try {
    for (const cat of diff.createCategories) {
      const res = await botFetch(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify({ name: cat.name, type: 4 }),
      });
      if (!res.ok) throw new Error(parseDiscordError(await res.text()));
      const created = (await res.json()) as { id: string };
      categoryIdByKey.set(cat.key, created.id);
      createdCategories.push({ key: cat.key, id: created.id });
    }

    for (const bind of diff.bindExisting) {
      if (!config.channelBindings[bind.key]) {
        await setChannelBinding(bind.key, bind.channelId);
        bindingsUpdated.push(bind.key);
      }
    }

    for (const ch of diff.createChannels) {
      if (PROTECTED_DISCORD_CHANNEL_IDS.some((id) => bindingsUpdated.includes(id))) {
        /* no-op guard */
      }
      const parent = categoryIdByKey.get(ch.categoryKey) ?? null;
      const payload: Record<string, unknown> = {
        name: ch.name,
        type: CHANNEL_TYPE[ch.type],
        parent_id: parent,
      };
      if (ch.topic) payload.topic = ch.topic;
      const res = await botFetch(`/guilds/${guildId}/channels`, {
        method: 'POST',
        body: JSON.stringify(payload),
      });
      if (!res.ok) throw new Error(parseDiscordError(await res.text()));
      const created = (await res.json()) as { id: string };
      await setChannelBinding(ch.key, created.id);
      createdChannels.push({ key: ch.key, id: created.id });
      bindingsUpdated.push(ch.key);
    }

    await prisma.discordServerConfig.update({
      where: { id: 'default' },
      data: { lastGuildSyncAt: new Date(), lastGuildSyncError: null },
    });
    void import('./channel-content.js')
      .then(({ syncChannelContent }) => syncChannelContent({ replace: false }))
      .catch(() => undefined);
    return { dryRun: false, diff, createdCategories, createdChannels, bindingsUpdated, error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await prisma.discordServerConfig.update({
      where: { id: 'default' },
      data: { lastGuildSyncError: message.slice(0, 500) },
    });
    return { dryRun: false, diff, createdCategories, createdChannels, bindingsUpdated, error: message };
  }
}

export function exportGuildInventorySnapshot(channels: LiveGuildChannel[]): Record<string, unknown> {
  return {
    guildId: env.DISCORD_GUILD_ID,
    exportedAt: new Date().toISOString(),
    protectedChannelIds: [...PROTECTED_DISCORD_CHANNEL_IDS],
    channelCount: channels.length,
    channels: channels.map((c) => ({
      id: c.id,
      name: c.name,
      type: c.type,
      parent_id: c.parent_id,
      topic: c.topic ?? null,
    })),
  };
}

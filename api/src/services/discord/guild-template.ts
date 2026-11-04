import type { LiveGuildChannel } from './guild-sync.js';
import { PROTECTED_DISCORD_CHANNEL_IDS, type DesiredGuildState } from './desired-state.js';
import { prisma } from '../../db.js';
import { badRequest } from '../../lib/errors.js';

/** Semantic keys used for content posting and admin bindings. */
export const CHANNEL_NAME_TO_BINDING: Record<string, string> = {
  welcome: 'welcome_start',
  'start-here': 'welcome_start',
  rules: 'welcome_rules',
  announcements: 'welcome_announcements',
  'service-status': 'welcome_status',
  status: 'welcome_status',
  general: 'community_general',
  introductions: 'community_introductions',
  showcase: 'community_showcases',
  showcases: 'community_showcases',
  'development-help': 'community_dev_help',
  'community-help': 'community_dev_help',
  suggestions: 'community_suggestions',
  'getting-started': 'hosting_getting_started',
  guides: 'hosting_tutorials',
  'vps-hosting': 'hosting_platform_help',
  'game-servers': 'hosting_getting_started',
  'apps-and-bots': 'hosting_getting_started',
  'support-desk': 'support_desk',
  incidents: 'support_incidents',
  bugs: 'protected_bugs_forum',
  'staff-general': 'staff_general',
  'staff-chat': 'staff_general',
  'support-queue': 'staff_queue',
  escalations: 'staff_escalations',
  'staff-announcements': 'staff_announcements',
  'bot-operations': 'staff_bot_ops',
  'ops-alerts': 'staff_bot_ops',
};

/** Channels Blipmade should ensure exist even if missing from a live import. */
export const PLANNED_GUILD_OVERLAY: DesiredGuildState = {
  version: 1,
  categories: [
    { key: 'customer_support', name: 'CUSTOMER SUPPORT' },
    { key: 'staff_hub', name: 'STAFF HUB' },
  ],
  channels: [
    {
      key: 'support_desk',
      name: 'support-desk',
      categoryKey: 'customer_support',
      type: 'text',
      topic: 'Open a Blipmade support ticket — buttons below.',
    },
    {
      key: 'support_incidents',
      name: 'incidents',
      categoryKey: 'customer_support',
      type: 'announcement',
      topic: 'Platform incidents mirrored from Blipmade Admin.',
    },
    {
      key: 'staff_queue',
      name: 'support-queue',
      categoryKey: 'staff_hub',
      type: 'text',
      topic: 'Staff ticket queue summaries (bot).',
    },
    {
      key: 'staff_bot_ops',
      name: 'bot-operations',
      categoryKey: 'staff_hub',
      type: 'text',
      topic: 'Discord integration health and sync logs.',
    },
  ],
};

export function slugCategoryKey(name: string): string {
  return name
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '')
    .slice(0, 48);
}

function discordTypeToDesired(type: number): 'text' | 'announcement' | 'forum' | null {
  if (type === 0) return 'text';
  if (type === 5) return 'announcement';
  if (type === 15) return 'forum';
  return null;
}

export function inferBindingKey(channel: LiveGuildChannel): string {
  if (PROTECTED_DISCORD_CHANNEL_IDS.includes(channel.id as (typeof PROTECTED_DISCORD_CHANNEL_IDS)[number])) {
    return 'protected_bugs_forum';
  }
  const byName = CHANNEL_NAME_TO_BINDING[channel.name];
  if (byName) return byName;
  return `live_${channel.id}`;
}

export function buildDesiredStateFromLiveChannels(live: LiveGuildChannel[]): {
  desiredState: DesiredGuildState;
  bindings: Record<string, string>;
} {
  const categories = live
    .filter((c) => c.type === 4)
    .sort((a, b) => a.name.localeCompare(b.name))
    .map((c) => ({ key: slugCategoryKey(c.name), name: c.name }));

  const categoryKeyById = new Map<string, string>();
  for (const c of live.filter((x) => x.type === 4)) {
    categoryKeyById.set(c.id, slugCategoryKey(c.name));
  }

  const channels: DesiredGuildState['channels'] = [];
  const bindings: Record<string, string> = {};

  for (const ch of live) {
    if (ch.type === 4) continue;
    const desiredType = discordTypeToDesired(ch.type);
    if (!desiredType) continue;
    const key = inferBindingKey(ch);
    if (bindings[key] && bindings[key] !== ch.id) {
      const fallback = `live_${ch.id}`;
      bindings[fallback] = ch.id;
      channels.push({
        key: fallback,
        name: ch.name,
        categoryKey: ch.parent_id ? (categoryKeyById.get(ch.parent_id) ?? 'uncategorized') : 'uncategorized',
        type: desiredType,
        topic: ch.topic ?? undefined,
        ...(PROTECTED_DISCORD_CHANNEL_IDS.includes(ch.id as never)
          ? { existingId: ch.id, preserveOnly: true }
          : {}),
      });
      continue;
    }
    bindings[key] = ch.id;
    channels.push({
      key,
      name: ch.name,
      categoryKey: ch.parent_id ? (categoryKeyById.get(ch.parent_id) ?? 'uncategorized') : 'uncategorized',
      type: desiredType,
      topic: ch.topic ?? undefined,
      ...(PROTECTED_DISCORD_CHANNEL_IDS.includes(ch.id as never) ? { existingId: ch.id, preserveOnly: true } : {}),
    });
  }

  if (!categories.find((c) => c.key === 'uncategorized')) {
    categories.push({ key: 'uncategorized', name: 'Uncategorized' });
  }

  let desiredState: DesiredGuildState = {
    version: 2,
    categories,
    channels,
  };

  desiredState = mergePlannedOverlay(desiredState);
  for (const ch of PLANNED_GUILD_OVERLAY.channels) {
    if (!bindings[ch.key]) {
      /* binding filled when channel is created by apply sync */
    }
  }

  return { desiredState, bindings };
}

export function mergePlannedOverlay(base: DesiredGuildState): DesiredGuildState {
  const categories = [...base.categories];
  const channels = [...base.channels];
  for (const cat of PLANNED_GUILD_OVERLAY.categories) {
    if (!categories.some((c) => c.key === cat.key || c.name.toLowerCase() === cat.name.toLowerCase())) {
      categories.push(cat);
    }
  }
  for (const ch of PLANNED_GUILD_OVERLAY.channels) {
    if (!channels.some((c) => c.key === ch.key)) {
      channels.push(ch);
    }
  }
  return { ...base, categories, channels };
}

export async function importLiveGuildIntoConfig(): Promise<{
  channelCount: number;
  categoryCount: number;
  bindingCount: number;
}> {
  const { fetchGuildChannelInventory } = await import('./guild-sync.js');
  const live = await fetchGuildChannelInventory();
  if (!live.length) throw badRequest('Could not read guild channels. Check bot token and DISCORD_GUILD_ID.');

  const { desiredState, bindings } = buildDesiredStateFromLiveChannels(live);
  await prisma.discordServerConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      desiredStateVersion: desiredState.version,
      desiredState: desiredState as never,
      channelBindings: bindings as never,
    },
    update: {
      desiredStateVersion: desiredState.version,
      desiredState: desiredState as never,
      channelBindings: bindings as never,
      liveTemplateImportedAt: new Date(),
      lastGuildSyncError: null,
    },
  });

  return {
    channelCount: desiredState.channels.length,
    categoryCount: desiredState.categories.length,
    bindingCount: Object.keys(bindings).length,
  };
}

export function contentSlotForBinding(bindingKey: string, channelName: string): string | null {
  if (bindingKey.startsWith('live_')) {
    const byName = CHANNEL_NAME_TO_BINDING[channelName];
    return byName ?? null;
  }
  const contentKeys = new Set([
    'welcome_start',
    'welcome_rules',
    'welcome_announcements',
    'welcome_status',
    'hosting_getting_started',
    'support_desk',
  ]);
  if (contentKeys.has(bindingKey)) return bindingKey;
  const byName = CHANNEL_NAME_TO_BINDING[channelName];
  return byName && contentKeys.has(byName) ? byName : null;
}

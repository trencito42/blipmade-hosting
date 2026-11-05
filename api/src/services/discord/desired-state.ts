/** Channel that must never be deleted, recreated, or moved by automation. */
export const PROTECTED_DISCORD_CHANNEL_IDS = ['1565844667147493376'] as const;

export type DesiredChannelBindingKey = string;

/**
 * `full` creates and binds every planned channel. `protected_only` leaves the server as it is: only the protected
 * channels are known to Blipmade, so a sync creates nothing and the bot posts nowhere else.
 */
export type GuildSyncMode = 'full' | 'protected_only';

export interface DesiredGuildState {
  version: number;
  mode?: GuildSyncMode;
  categories: { key: string; name: string }[];
  channels: {
    key: string;
    name: string;
    categoryKey: string;
    type: 'text' | 'announcement' | 'forum';
    topic?: string;
    existingId?: string;
    preserveOnly?: boolean;
  }[];
}

export const DESIRED_GUILD_STATE_V1: DesiredGuildState = {
  version: 1,
  categories: [
    { key: 'welcome', name: 'WELCOME' },
    { key: 'community', name: 'COMMUNITY' },
    { key: 'hosting', name: 'HOSTING' },
    { key: 'customer_support', name: 'CUSTOMER SUPPORT' },
    { key: 'staff_hub', name: 'STAFF HUB' },
  ],
  channels: [
    { key: 'welcome_start', name: 'start-here', categoryKey: 'welcome', type: 'text', topic: 'How Blipmade Discord works and how to verify your account.' },
    { key: 'welcome_rules', name: 'rules', categoryKey: 'welcome', type: 'text' },
    { key: 'welcome_announcements', name: 'announcements', categoryKey: 'welcome', type: 'announcement' },
    { key: 'welcome_status', name: 'status', categoryKey: 'welcome', type: 'text', topic: 'Platform updates and incident summaries.' },
    { key: 'community_general', name: 'general', categoryKey: 'community', type: 'text' },
    { key: 'community_introductions', name: 'introductions', categoryKey: 'community', type: 'text' },
    { key: 'community_showcases', name: 'showcases', categoryKey: 'community', type: 'text' },
    { key: 'community_dev_help', name: 'development-help', categoryKey: 'community', type: 'text' },
    { key: 'community_suggestions', name: 'suggestions', categoryKey: 'community', type: 'text' },
    { key: 'hosting_getting_started', name: 'getting-started', categoryKey: 'hosting', type: 'text' },
    { key: 'hosting_platform_help', name: 'platform-help', categoryKey: 'hosting', type: 'text' },
    { key: 'hosting_tutorials', name: 'tutorials', categoryKey: 'hosting', type: 'text' },
    { key: 'hosting_service_updates', name: 'service-updates', categoryKey: 'hosting', type: 'text' },
    { key: 'support_desk', name: 'support-desk', categoryKey: 'customer_support', type: 'text', topic: 'Open a Blipmade support ticket with the panel below.' },
    { key: 'support_service_help', name: 'service-help', categoryKey: 'customer_support', type: 'text' },
    { key: 'support_incidents', name: 'incidents', categoryKey: 'customer_support', type: 'announcement' },
    {
      key: 'protected_bugs_forum',
      name: 'bugs',
      categoryKey: 'customer_support',
      type: 'forum',
      existingId: '1565844667147493376',
      preserveOnly: true,
    },
    { key: 'staff_general', name: 'staff-general', categoryKey: 'staff_hub', type: 'text' },
    { key: 'staff_queue', name: 'support-queue', categoryKey: 'staff_hub', type: 'text' },
    { key: 'staff_escalations', name: 'escalations', categoryKey: 'staff_hub', type: 'text' },
    { key: 'staff_announcements', name: 'staff-announcements', categoryKey: 'staff_hub', type: 'text' },
    { key: 'staff_bot_ops', name: 'bot-operations', categoryKey: 'staff_hub', type: 'text' },
  ],
};

export function defaultServerConfigJson(): { desiredState: DesiredGuildState; channelBindings: Record<string, string> } {
  const bindings: Record<string, string> = {};
  for (const ch of DESIRED_GUILD_STATE_V1.channels) {
    if (ch.existingId) bindings[ch.key] = ch.existingId;
  }
  return { desiredState: DESIRED_GUILD_STATE_V1, channelBindings: bindings };
}

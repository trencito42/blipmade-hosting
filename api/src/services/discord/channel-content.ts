import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';
import { prisma } from '../../db.js';
import { botFetch, parseDiscordError } from './http.js';
import { ensureDiscordServerConfig } from './server-config.js';
import { contentSlotForBinding } from './guild-template.js';
import { postSupportDeskPanel } from './support-panel.js';

export type ContentPost = {
  slot: string;
  content?: string;
  embed?: {
    title: string;
    description: string;
    color?: number;
    fields?: { name: string; value: string; inline?: boolean }[];
    footer?: { text: string };
  };
  components?: unknown[];
};

const BLIPMADE_RED = 0xe64a4a;

/** Default bot-authored channel templates (function over form — no Studio UI dependency). */
export const DEFAULT_CHANNEL_CONTENT: ContentPost[] = [
  {
    slot: 'welcome_start',
    embed: {
      title: 'Welcome to Blipmade',
      description: [
        'Hosting for VPS, game servers, apps, and bots.',
        '',
        `• Website: ${env.publicWebUrl}`,
        `• Docs: ${env.publicWebUrl}/docs`,
        `• Status: ${env.publicWebUrl}/status`,
        `• Account: ${env.publicWebUrl}/app`,
        '',
        'Use **Verify with Blipmade** in #support-desk (or Account → Connections) to unlock customer channels.',
      ].join('\n'),
      color: BLIPMADE_RED,
      footer: { text: 'Blipmade' },
    },
  },
  {
    slot: 'welcome_rules',
    embed: {
      title: 'Community rules',
      description: [
        '1. Be respectful — customers and staff included.',
        '2. No malware, stress tools, or credential sharing in public channels.',
        '3. Billing and account issues → Blipmade support tickets, not public chat.',
        '4. Use the right channel (hosting, community, support-desk).',
        '5. Follow Discord Terms of Service.',
      ].join('\n'),
      color: BLIPMADE_RED,
    },
  },
  {
    slot: 'welcome_status',
    content: `**Platform status**\nLive dashboard: ${env.publicWebUrl}/status\nThis channel receives incident and maintenance updates from Blipmade automatically.`,
  },
  {
    slot: 'welcome_announcements',
    content: '**Announcements**\nProduct and platform news from Blipmade will be posted here when published in Admin.',
  },
  {
    slot: 'hosting_getting_started',
    content: [
      '**Getting started with hosting**',
      'Order a service at blipmade.com, then use the panel for console, files, backups, and domains.',
      'Need help? #support-desk → open a ticket linked to your service.',
    ].join('\n'),
  },
];

function buildPayload(post: ContentPost): Record<string, unknown> {
  const payload: Record<string, unknown> = {};
  if (post.content) payload.content = post.content.slice(0, 2000);
  if (post.embed) payload.embeds = [post.embed];
  if (post.components) payload.components = post.components;
  return payload;
}

export async function syncChannelContent(options: { replace?: boolean; dryRun?: boolean } = {}): Promise<{
  dryRun: boolean;
  posted: string[];
  updated: string[];
  skipped: string[];
  errors: { slot: string; error: string }[];
}> {
  if (!env.discordCommunityEnabled) throw badRequest('Discord is not configured.');
  const replace = options.replace ?? false;
  const dryRun = options.dryRun ?? false;

  const config = await ensureDiscordServerConfig();
  const bindings = config.channelBindings;
  const anchors = { ...config.contentAnchors };
  const desired = config.desiredState as { channels?: { key: string; name: string }[] };
  const posts = DEFAULT_CHANNEL_CONTENT;

  function resolveChannelId(slot: string): string | null {
    if (bindings[slot]) return bindings[slot];
    for (const ch of desired.channels ?? []) {
      if (ch.key === slot || contentSlotForBinding(ch.key, ch.name) === slot) {
        if (bindings[ch.key]) return bindings[ch.key];
      }
    }
    for (const [key, id] of Object.entries(bindings)) {
      const ch = (desired.channels ?? []).find((c) => c.key === key);
      if (contentSlotForBinding(key, ch?.name ?? key) === slot) return id;
    }
    return null;
  }

  const posted: string[] = [];
  const updated: string[] = [];
  const skipped: string[] = [];
  const errors: { slot: string; error: string }[] = [];

  for (const post of posts) {
    const channelId = resolveChannelId(post.slot);
    if (!channelId) {
      skipped.push(post.slot);
      continue;
    }

    const existingId = anchors[post.slot] ?? (post.slot === 'support_desk' ? config.supportPanelMessageId : null);
    if (existingId && !replace) {
      skipped.push(post.slot);
      continue;
    }

    if (dryRun) {
      posted.push(post.slot);
      continue;
    }

    const payload = buildPayload(post);
    try {
      if (existingId && replace) {
        const res = await botFetch(`/channels/${channelId}/messages/${existingId}`, {
          method: 'PATCH',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(parseDiscordError(await res.text()));
        updated.push(post.slot);
      } else {
        const res = await botFetch(`/channels/${channelId}/messages`, {
          method: 'POST',
          body: JSON.stringify(payload),
        });
        if (!res.ok) throw new Error(parseDiscordError(await res.text()));
        const msg = (await res.json()) as { id: string };
        anchors[post.slot] = msg.id;
        posted.push(post.slot);
      }
    } catch (error) {
      errors.push({ slot: post.slot, error: error instanceof Error ? error.message : String(error) });
    }
  }

  if (!dryRun) {
    await prisma.discordServerConfig.update({
      where: { id: 'default' },
      data: { contentAnchors: anchors as never },
    });
  }

  await postSupportDeskPanel(replace).catch(() => undefined);

  return { dryRun, posted, updated, skipped, errors };
}

export async function publishDiscordAnnouncement(input: {
  title: string;
  body: string;
  severity: 'info' | 'warning' | 'maintenance';
}): Promise<{ ok: boolean; channelId?: string; error?: string }> {
  if (!env.discordCommunityEnabled) return { ok: false, error: 'not_configured' };
  const config = await ensureDiscordServerConfig();
  const bindings = config.channelBindings as Record<string, string>;
  const channelId =
    bindings.welcome_announcements ??
    Object.entries(bindings).find(([k]) => k === 'welcome_announcements' || k.includes('announcement'))?.[1];
  if (!channelId) return { ok: false, error: 'no_announcements_channel' };

  const color = input.severity === 'warning' ? 0xf59e0b : input.severity === 'maintenance' ? 0x3b82f6 : BLIPMADE_RED;
  const res = await botFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [
        {
          title: input.title.slice(0, 256),
          description: input.body.slice(0, 4000),
          color,
          footer: { text: 'Blipmade' },
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: parseDiscordError(await res.text()) };
  return { ok: true, channelId };
}

export async function publishDiscordIncidentUpdate(input: {
  title: string;
  status: string;
  message: string;
  impact?: string | null;
}): Promise<{ ok: boolean; error?: string }> {
  if (!env.discordCommunityEnabled) return { ok: false, error: 'not_configured' };
  const config = await ensureDiscordServerConfig();
  const bindings = config.channelBindings as Record<string, string>;
  const statusChannel =
    bindings.welcome_status ?? Object.entries(bindings).find(([k]) => k.includes('status'))?.[1];
  const incidentChannel = bindings.support_incidents ?? statusChannel;
  const channelId = incidentChannel ?? statusChannel;
  if (!channelId) return { ok: false, error: 'no_status_channel' };

  const res = await botFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({
      embeds: [
        {
          title: input.title.slice(0, 256),
          description: [`**Status:** ${input.status}`, input.impact ? `**Impact:** ${input.impact}` : '', '', input.message]
            .filter(Boolean)
            .join('\n')
            .slice(0, 4000),
          color: 0xef4444,
          footer: { text: 'Blipmade incident' },
        },
      ],
    }),
  });
  if (!res.ok) return { ok: false, error: parseDiscordError(await res.text()) };
  return { ok: true };
}

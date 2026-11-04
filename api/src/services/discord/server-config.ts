import { prisma } from '../../db.js';
import { defaultServerConfigJson } from './desired-state.js';

export async function ensureDiscordServerConfig(): Promise<{
  id: string;
  desiredStateVersion: number;
  desiredState: unknown;
  channelBindings: Record<string, string>;
  protectedChannelIds: string[];
  supportPanelMessageId: string | null;
  contentAnchors: Record<string, string>;
  liveTemplateImportedAt: Date | null;
}> {
  const defaults = defaultServerConfigJson();
  const row = await prisma.discordServerConfig.upsert({
    where: { id: 'default' },
    create: {
      id: 'default',
      desiredStateVersion: defaults.desiredState.version,
      desiredState: defaults.desiredState as never,
      channelBindings: defaults.channelBindings as never,
    },
    update: {},
  });
  return {
    id: row.id,
    desiredStateVersion: row.desiredStateVersion,
    desiredState: row.desiredState,
    channelBindings: (row.channelBindings ?? {}) as Record<string, string>,
    protectedChannelIds: row.protectedChannelIds,
    supportPanelMessageId: row.supportPanelMessageId,
    contentAnchors: (row.contentAnchors ?? {}) as Record<string, string>,
    liveTemplateImportedAt: row.liveTemplateImportedAt,
  };
}

export async function getChannelBinding(key: string): Promise<string | null> {
  const config = await ensureDiscordServerConfig();
  return config.channelBindings[key] ?? null;
}

export async function setChannelBinding(key: string, channelId: string): Promise<void> {
  const config = await ensureDiscordServerConfig();
  const next = { ...config.channelBindings, [key]: channelId };
  await prisma.discordServerConfig.update({
    where: { id: 'default' },
    data: { channelBindings: next as never },
  });
}

import { env } from '../../env.js';
import { badRequest } from '../../lib/errors.js';
import { botFetch, parseDiscordError } from './http.js';
import { ensureDiscordServerConfig, getChannelBinding } from './server-config.js';

const PANEL_CONTENT = [
  '**Blipmade support desk**',
  '',
  'Link your Blipmade account to access customer channels and open tickets tied to your services.',
  'Staff replies sync with the Blipmade helpdesk. Internal notes stay in Admin only.',
].join('\n');

function panelComponents(): unknown[] {
  const verifyUrl = `${env.publicWebUrl}/app/settings/connections`;
  return [
    {
      type: 1,
      components: [
        { type: 2, style: 5, label: 'Verify with Blipmade', url: verifyUrl },
        { type: 2, style: 1, custom_id: 'bm:support:service', label: 'Help with a service' },
        { type: 2, style: 1, custom_id: 'bm:support:billing', label: 'Billing question' },
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 1, custom_id: 'bm:support:technical', label: 'Technical issue' },
        { type: 2, style: 1, custom_id: 'bm:support:outage', label: 'Report outage' },
        { type: 2, style: 1, custom_id: 'bm:support:general', label: 'General question' },
        { type: 2, style: 2, custom_id: 'bm:support:my_tickets', label: 'My tickets' },
      ],
    },
  ];
}

export async function postSupportDeskPanel(replaceExisting = false): Promise<boolean> {
  if (!env.discordCommunityEnabled) throw badRequest('Discord is not configured.');
  const channelId = await getChannelBinding('support_desk');
  if (!channelId) throw badRequest('Map the support-desk channel in Admin → Integrations → Discord first.');

  const config = await ensureDiscordServerConfig();
  if (config.supportPanelMessageId && !replaceExisting) return true;

  if (config.supportPanelMessageId && replaceExisting) {
    const edit = await botFetch(`/channels/${channelId}/messages/${config.supportPanelMessageId}`, {
      method: 'PATCH',
      body: JSON.stringify({ content: PANEL_CONTENT, components: panelComponents() }),
    });
    return edit.ok;
  }

  const res = await botFetch(`/channels/${channelId}/messages`, {
    method: 'POST',
    body: JSON.stringify({ content: PANEL_CONTENT, components: panelComponents() }),
  });
  if (!res.ok) throw badRequest(parseDiscordError(await res.text()));
  const msg = (await res.json()) as { id: string };
  const { prisma } = await import('../../db.js');
  await prisma.discordServerConfig.update({
    where: { id: 'default' },
    data: { supportPanelMessageId: msg.id },
  });
  return true;
}

export async function registerDiscordSlashCommands(): Promise<{ ok: boolean; error?: string }> {
  const appId = env.DISCORD_APPLICATION_ID;
  if (!appId || !env.DISCORD_BOT_TOKEN) return { ok: false, error: 'DISCORD_APPLICATION_ID or bot token missing.' };
  const commands = [
    { name: 'support', description: 'Open the Blipmade support panel', type: 1 },
    { name: 'account', description: 'Check Blipmade account link status', type: 1 },
    { name: 'tickets', description: 'List your recent Discord support tickets', type: 1 },
    { name: 'services', description: 'List your active Blipmade services', type: 1 },
  ];
  const res = await botFetch(`/applications/${appId}/commands`, {
    method: 'PUT',
    body: JSON.stringify(commands),
  });
  if (!res.ok) return { ok: false, error: parseDiscordError(await res.text()) };
  return { ok: true };
}

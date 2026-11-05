import { env } from '../../env.js';
import { resolveWebAppUrl } from '../oauth/providers.js';
import { listAuthorizedInstances, resolveBlipmadeUserFromDiscord } from '../support/tickets-core.js';
import {
  ephemeral,
  interactionJsonResponse,
  modal,
  updateMessage,
  verifyDiscordInteractionSignature,
} from './interaction-util.js';
import { listDiscordTicketsForUser, openDiscordSupportTicket, staffDiscordAction } from './support-bridge.js';
import { getCustomerCommunityStatus, syncDiscordRolesForUser } from './community.js';
import { ensureDiscordServerConfig } from './server-config.js';
import { postSupportDeskPanel } from './support-panel.js';

type Interaction = {
  type: number;
  id: string;
  token: string;
  data?: {
    custom_id?: string;
    component_type?: number;
    values?: string[];
    components?: { components: { custom_id: string; value: string }[] }[];
  };
  member?: { user: { id: string; username: string } };
  user?: { id: string; username: string };
  message?: { id: string; channel_id: string };
  channel_id?: string;
};

function openedTicketText(result: { ticketNumber: number; threadId: string | null; bridgeError: string | null }): string {
  if (result.threadId) return `Ticket #${result.ticketNumber} opened. Continue in <#${result.threadId}>.`;
  return `Ticket #${result.ticketNumber} is open in Blipmade. Discord did not create the thread: ${result.bridgeError ?? 'unknown error'}.`;
}

function discordUserId(interaction: Interaction): string | null {
  return interaction.member?.user.id ?? interaction.user?.id ?? null;
}

function supportPanelComponents(): unknown[] {
  const verifyUrl = resolveWebAppUrl('/app/settings/connections');
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
      ],
    },
    {
      type: 1,
      components: [
        { type: 2, style: 2, custom_id: 'bm:support:my_tickets', label: 'View my tickets' },
        { type: 2, style: 2, custom_id: 'bm:support:sync_roles', label: 'Refresh my roles' },
      ],
    },
  ];
}

export async function handleDiscordInteraction(rawBody: string, headers: Record<string, string | undefined>): Promise<Response> {
  const signature = headers['x-signature-ed25519'];
  const timestamp = headers['x-signature-timestamp'];
  if (!env.DISCORD_PUBLIC_KEY || !signature || !timestamp) {
    return interactionJsonResponse({ error: 'Discord interactions are not configured.' }, 401);
  }
  if (!verifyDiscordInteractionSignature(rawBody, signature, timestamp, env.DISCORD_PUBLIC_KEY)) {
    return interactionJsonResponse({ error: 'Invalid signature.' }, 401);
  }

  const interaction = JSON.parse(rawBody) as Interaction;
  if (interaction.type === 1) {
    return interactionJsonResponse({ type: 1 });
  }

  const userId = discordUserId(interaction);
  if (!userId) {
    return interactionJsonResponse(ephemeral('Could not resolve your Discord identity.'));
  }

  try {
    if (interaction.type === 2) {
      const name = (interaction as { data?: { name?: string } }).data?.name;
      if (name === 'support') {
        return interactionJsonResponse({
          type: 4,
          data: {
            content: '**Blipmade support**\nChoose an action below.',
            components: supportPanelComponents(),
            flags: 64,
          },
        });
      }
      if (name === 'account') {
        const linked = await resolveBlipmadeUserFromDiscord(userId);
        return interactionJsonResponse(
          ephemeral(linked ? 'Your Discord is linked to a Blipmade account.' : 'Discord is not linked yet. Use **Verify with Blipmade** in #support-desk.'),
        );
      }
      if (name === 'tickets') {
        const rows = await listDiscordTicketsForUser(userId);
        if (!rows.length) return interactionJsonResponse(ephemeral('You have no Discord support tickets yet.'));
        const lines = rows.map((t) => `#${t.number} · ${t.status} · ${t.subject}`).join('\n');
        return interactionJsonResponse(ephemeral(lines.slice(0, 1900)));
      }
      if (name === 'services') {
        const linked = await resolveBlipmadeUserFromDiscord(userId);
        if (!linked) return interactionJsonResponse(ephemeral('Link Discord to Blipmade first (Account → Connections).'));
        const services = await listAuthorizedInstances(linked.userId);
        if (!services.length) return interactionJsonResponse(ephemeral('No active services on your account.'));
        return interactionJsonResponse(ephemeral(services.map((s) => `• ${s.name} (${s.productSlug})`).join('\n').slice(0, 1900)));
      }
    }

    if (interaction.type === 3 && interaction.data?.custom_id) {
      const id = interaction.data.custom_id;
      if (id.startsWith('bm:staff:')) {
        const [, , action, ticketId] = id.split(':');
        if (action !== 'claim' && action !== 'resolve' && action !== 'reopen') {
          return interactionJsonResponse(ephemeral('Unknown staff action.'));
        }
        const result = await staffDiscordAction(userId, action, ticketId ?? '');
        return interactionJsonResponse(ephemeral(result));
      }
      if (id === 'bm:support:sync_roles') {
        const linked = await resolveBlipmadeUserFromDiscord(userId);
        if (!linked) return interactionJsonResponse(ephemeral('Connect Discord to Blipmade under Account → Connections first.'));
        await syncDiscordRolesForUser(linked.userId);
        const status = await getCustomerCommunityStatus(linked.userId);
        return interactionJsonResponse(ephemeral(status.lastError ? `Sync failed: ${status.lastError}` : 'Roles refreshed. Check your channels.'));
      }
      if (id === 'bm:support:my_tickets') {
        const rows = await listDiscordTicketsForUser(userId);
        if (!rows.length) return interactionJsonResponse(ephemeral('No tickets yet. Use the buttons above to open one.'));
        return interactionJsonResponse(ephemeral(rows.map((t) => `#${t.number} [${t.status}] ${t.subject}`).join('\n').slice(0, 1900)));
      }
      if (id.startsWith('bm:select:service:')) {
        const instanceId = id.split(':').pop()!;
        return interactionJsonResponse(
          modal(`bm:modal:service:${instanceId}`, 'Service support ticket', [
            { id: 'subject', label: 'Subject', style: 1, placeholder: 'Short summary' },
            { id: 'description', label: 'Description', style: 2, placeholder: 'What happened?' },
          ]),
        );
      }
      if (id === 'bm:support:service') {
        const linked = await resolveBlipmadeUserFromDiscord(userId);
        if (!linked) return interactionJsonResponse(ephemeral('Link Discord to Blipmade first.'));
        const services = await listAuthorizedInstances(linked.userId);
        if (!services.length) {
          return interactionJsonResponse(ephemeral('You have no active services. Use **General question** or contact billing.'));
        }
        return interactionJsonResponse({
          type: 4,
          data: {
            content: 'Select the service you need help with:',
            components: [
              {
                type: 1,
                components: [
                  {
                    type: 3,
                    custom_id: 'bm:select:service',
                    placeholder: 'Choose a service',
                    options: services.map((s) => ({
                      label: s.name.slice(0, 100),
                      value: s.id,
                      description: s.productSlug.slice(0, 100),
                    })),
                  },
                ],
              },
            ],
            flags: 64,
          },
        });
      }
      const categoryMap: Record<string, 'TECHNICAL' | 'BILLING' | 'OTHER'> = {
        'bm:support:billing': 'BILLING',
        'bm:support:technical': 'TECHNICAL',
        'bm:support:outage': 'TECHNICAL',
        'bm:support:general': 'OTHER',
      };
      if (id in categoryMap) {
        return interactionJsonResponse(
          modal(`bm:modal:${id.replace('bm:support:', '')}`, 'Open support ticket', [
            { id: 'subject', label: 'Subject', style: 1 },
            { id: 'description', label: 'Description', style: 2 },
          ]),
        );
      }
      if (id === 'bm:select:service' && interaction.data.values?.[0]) {
        const instanceId = interaction.data.values[0];
        return interactionJsonResponse(
          modal(`bm:modal:service:${instanceId}`, 'Service support ticket', [
            { id: 'subject', label: 'Subject', style: 1 },
            { id: 'description', label: 'Description', style: 2 },
          ]),
        );
      }
    }

    if (interaction.type === 5 && interaction.data?.custom_id) {
      const customId = interaction.data.custom_id;
      const fields = new Map<string, string>();
      for (const row of interaction.data.components ?? []) {
        for (const comp of row.components) fields.set(comp.custom_id, comp.value.trim());
      }
      const subject = fields.get('subject') ?? '';
      const description = fields.get('description') ?? '';
      if (subject.length < 3 || description.length < 1) {
        return interactionJsonResponse(ephemeral('Subject and description are required.'));
      }

      if (customId.startsWith('bm:modal:service:')) {
        const instanceId = customId.split(':').pop()!;
        const result = await openDiscordSupportTicket({
          discordUserId: userId,
          subject,
          body: description,
          category: 'TECHNICAL',
          instanceId,
        });
        return interactionJsonResponse(ephemeral(openedTicketText(result)));
      }

      const kind = customId.replace('bm:modal:', '');
      const category =
        kind === 'billing' ? 'BILLING' : kind === 'general' ? 'OTHER' : kind === 'outage' ? 'TECHNICAL' : 'TECHNICAL';
      const priority = kind === 'outage' ? 'URGENT' : 'NORMAL';
      const result = await openDiscordSupportTicket({
        discordUserId: userId,
        subject,
        body: description,
        category,
        priority,
      });
      return interactionJsonResponse(ephemeral(openedTicketText(result)));
    }

    if (interaction.type === 3 && interaction.data?.custom_id === 'bm:admin:refresh_panel') {
      await ensureDiscordServerConfig();
      const posted = await postSupportDeskPanel(true);
      return interactionJsonResponse(updateMessage('Support panel refreshed.', posted ? supportPanelComponents() : undefined));
    }
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Something went wrong.';
    return interactionJsonResponse(ephemeral(message.slice(0, 1800)));
  }

  return interactionJsonResponse(ephemeral('Unknown interaction.'));
}

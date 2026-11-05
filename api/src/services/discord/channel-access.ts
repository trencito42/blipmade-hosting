import { PROTECTED_DISCORD_CHANNEL_IDS } from './desired-state.js';

/** Discord permission bits used on category and channel overwrites. */
const VIEW_CHANNEL = 1n << 10n;
const SEND_MESSAGES = 1n << 11n;
const READ_HISTORY = 1n << 16n;
const TALK = (VIEW_CHANNEL | SEND_MESSAGES | READ_HISTORY).toString();

export type ChannelAccessLevel = 'public' | 'verified' | 'customer' | 'staff';

export interface DiscordOverwrite {
  id: string;
  type: 0;
  allow: string;
  deny: string;
}

export interface AccessRoles {
  everyoneId: string;
  verifiedRoleId: string | null;
  customerRoleId: string | null;
  staffRoleIds: string[];
}

export function isProtectedDiscordChannel(channelId: string): boolean {
  return (PROTECTED_DISCORD_CHANNEL_IDS as readonly string[]).includes(channelId);
}

/** Who may see a managed channel. The bugs forum is never classified for mutation. */
export function accessLevelFor(categoryKey: string, channelKey: string): ChannelAccessLevel {
  if (channelKey === 'protected_bugs_forum') return 'public';
  if (channelKey === 'support_desk' || categoryKey === 'welcome') return 'public';
  if (categoryKey === 'community') return 'verified';
  if (categoryKey === 'hosting' || categoryKey === 'customer_support') return 'customer';
  if (categoryKey === 'staff_hub') return 'staff';
  return 'staff';
}

/**
 * Overwrites for one access level.
 * Non-public channels deny @everyone view even when the grant role is missing,
 * so a missing role id cannot leave a staff or customer channel public.
 */
export function permissionOverwrites(level: ChannelAccessLevel, roles: AccessRoles): DiscordOverwrite[] {
  if (!roles.everyoneId) return [];
  if (level === 'public') {
    return [{ id: roles.everyoneId, type: 0, allow: VIEW_CHANNEL.toString(), deny: '0' }];
  }
  const overwrites: DiscordOverwrite[] = [
    { id: roles.everyoneId, type: 0, allow: '0', deny: VIEW_CHANNEL.toString() },
  ];
  const grant = level === 'verified' ? roles.verifiedRoleId : level === 'customer' ? roles.customerRoleId : null;
  if (grant && grant !== roles.everyoneId) {
    overwrites.push({ id: grant, type: 0, allow: TALK, deny: '0' });
  }
  if (level === 'customer' || level === 'staff') {
    for (const id of roles.staffRoleIds) {
      if (!id || id === roles.everyoneId || overwrites.some((row) => row.id === id)) continue;
      overwrites.push({ id, type: 0, allow: TALK, deny: '0' });
    }
  }
  return overwrites;
}

/** A Discord message may become a customer-visible staff reply only with a real support permission. */
export function discordStaffMayReply(input: { role: string; permissions: string[]; suspended: boolean }): boolean {
  if (input.suspended || input.role === 'CUSTOMER') return false;
  if (input.role === 'ADMIN') return true;
  if (input.role !== 'STAFF') return false;
  return input.permissions.includes('tickets.write') || input.permissions.includes('support.write');
}

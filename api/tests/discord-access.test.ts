import { describe, expect, it } from 'vitest';
import { accessLevelFor, discordStaffMayReply, isProtectedDiscordChannel, permissionOverwrites } from '../src/services/discord/channel-access.js';
import { DESIRED_GUILD_STATE_V1 } from '../src/services/discord/desired-state.js';

describe('channel access', () => {
  const roles = {
    everyoneId: 'guild',
    verifiedRoleId: 'verified',
    customerRoleId: null,
    staffRoleIds: ['staff'],
  };

  it('hides the staff hub from everyone, including when the customer role is missing', () => {
    const rows = permissionOverwrites(accessLevelFor('staff_hub', 'staff_queue'), roles);
    expect(rows.find((row) => row.id === 'guild')?.deny).not.toBe('0');
    expect(rows.some((row) => row.id === 'staff' && row.allow !== '0')).toBe(true);
  });

  it('keeps the support desk visible and never targets the bugs forum', () => {
    const desk = permissionOverwrites(accessLevelFor('customer_support', 'support_desk'), roles);
    expect(desk.find((row) => row.id === 'guild')?.allow).not.toBe('0');
    expect(isProtectedDiscordChannel('1565844667147493376')).toBe(true);
    const mutable = DESIRED_GUILD_STATE_V1.channels.filter((ch) => !ch.preserveOnly);
    expect(mutable.some((ch) => ch.existingId === '1565844667147493376')).toBe(false);
  });

  it('refuses a staff reply without tickets.write, and a suspended admin', () => {
    expect(discordStaffMayReply({ role: 'STAFF', permissions: ['tickets.read'], suspended: false })).toBe(false);
    expect(discordStaffMayReply({ role: 'STAFF', permissions: ['tickets.write'], suspended: false })).toBe(true);
    expect(discordStaffMayReply({ role: 'ADMIN', permissions: [], suspended: true })).toBe(false);
    expect(discordStaffMayReply({ role: 'CUSTOMER', permissions: ['tickets.write'], suspended: false })).toBe(false);
  });
});

import { describe, expect, it } from 'vitest';
import { computeManagedRoleDelta, mergeManagedDiscordRoles } from '../src/services/discord/community.js';

describe('discord managed role delta', () => {
  it('adds grant roles and removes only managed roles no longer eligible', () => {
    const managed = ['role-a', 'role-b', 'role-c'];
    const current = ['everyone', 'role-a', 'custom-mod', 'role-b'];
    const grant = ['role-b', 'role-c'];
    expect(computeManagedRoleDelta(current, managed, grant)).toEqual({ add: ['role-c'], remove: ['role-a'] });
  });

  it('does not remove unmanaged roles', () => {
    const delta = computeManagedRoleDelta(['everyone', 'vip'], ['staff'], []);
    expect(delta).toEqual({ add: [], remove: [] });
  });
});

describe('discord role merge legacy helper', () => {
  it('preserves unrelated roles while applying mapped grants', () => {
    const managed = ['role-a', 'role-b'];
    const member = ['everyone', 'role-a', 'custom-mod', 'role-b'];
    const grant = ['role-b'];
    expect(mergeManagedDiscordRoles(member, managed, grant)).toEqual(['everyone', 'custom-mod', 'role-b']);
  });
});

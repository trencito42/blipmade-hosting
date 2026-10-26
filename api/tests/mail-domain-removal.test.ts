import { describe, expect, it } from 'vitest';

/**
 * The removal of a domain from the mail system.
 *
 * The mail system refuses to delete a domain that still holds mailboxes or
 * aliases. The platform has to take them away first, because the promise of
 * the platform is that the data of a customer is really gone when the
 * retention ends, and a domain that is left behind with its mail is mail
 * that nobody owns.
 */
const { removeDomainWithItsContent } = await import('../src/services/mailcow.js');

/** A mail system that holds one domain with one mailbox and one alias. */
function fakeMailSystem() {
  const calls: string[] = [];
  const state = {
    mailboxes: [
      { username: 'postmaster@acme.ro', local_part: 'postmaster', domain: 'acme.ro', active: 1, quota: 1024, messages: 0 },
      { username: 'other@other.ro', local_part: 'other', domain: 'other.ro', active: 1, quota: 1024, messages: 0 },
    ],
    aliases: [
      { id: 1, address: 'info@acme.ro', goto: 'postmaster@acme.ro', domain: 'acme.ro', active: 1 },
      { id: 2, address: 'hello@other.ro', goto: 'other@other.ro', domain: 'other.ro', active: 1 },
    ],
  };
  return {
    calls,
    state,
    system: {
      mailboxes: async () => state.mailboxes,
      aliases: async () => state.aliases,
      deleteMailbox: async (address: string) => {
        calls.push(`mailbox:${address}`);
        state.mailboxes = state.mailboxes.filter((entry) => entry.username !== address);
      },
      deleteAlias: async (address: string) => {
        calls.push(`alias:${address}`);
        state.aliases = state.aliases.filter((entry) => entry.address !== address);
      },
      deleteDomain: async (domain: string) => {
        calls.push(`domain:${domain}`);
        // The mail system refuses a domain that still holds something.
        if (state.mailboxes.some((entry) => entry.domain === domain) || state.aliases.some((entry) => entry.domain === domain)) {
          throw new Error('domain_not_empty');
        }
      },
    },
  };
}

describe('the removal of a domain from the mail system', () => {
  it('takes the mailboxes and the aliases away before the domain', async () => {
    const { calls, system } = fakeMailSystem();

    await removeDomainWithItsContent('acme.ro', system);

    // The domain goes last, so the mail system never refuses it.
    expect(calls).toEqual(['mailbox:postmaster@acme.ro', 'alias:info@acme.ro', 'domain:acme.ro']);
  });

  it('leaves the domains of the other customers alone', async () => {
    const { state, calls, system } = fakeMailSystem();

    await removeDomainWithItsContent('acme.ro', system);

    expect(calls).not.toContain('mailbox:other@other.ro');
    expect(calls).not.toContain('alias:hello@other.ro');
    expect(state.mailboxes.map((entry) => entry.username)).toEqual(['other@other.ro']);
    expect(state.aliases.map((entry) => entry.address)).toEqual(['hello@other.ro']);
  });

  it('does not touch a domain that is not there', async () => {
    const { calls, system } = fakeMailSystem();

    await removeDomainWithItsContent('absent.ro', system);

    expect(calls).toEqual(['domain:absent.ro']);
  });
});

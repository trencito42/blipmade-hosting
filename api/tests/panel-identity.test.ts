import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The identity of a customer on the panel.
 *
 * The panel is replaced with a fake, so the rules can be checked without
 * creating accounts on the real panel:
 *
 *  - every customer gets one account of their own;
 *  - the account is found by the external id and by nothing else;
 *  - an account that Blipmade did not create is never taken over;
 *  - the mapping between the two identities never changes.
 */

const panel = {
  accounts: [] as {
    id: number;
    username: string;
    email: string;
    external_id: string | null;
    first_name: string | null;
    last_name: string | null;
    root_admin: boolean;
    created_at: string;
  }[],
  nextId: 40,
};

vi.mock('../src/services/pterodactyl/application.js', () => ({
  listUsers: vi.fn(async () => panel.accounts),
  findUserByExternalId: vi.fn(
    async (externalId: string) => panel.accounts.find((account) => account.external_id === externalId) ?? null,
  ),
  createUser: vi.fn(
    async (input: {
      email: string;
      username: string;
      password: string;
      root_admin: boolean;
      external_id: string;
      first_name: string;
      last_name: string;
    }) => {
      const taken = panel.accounts.find((account) => account.username === input.username);
      if (taken) throw new Error('The username has already been taken.');
      const account = {
        id: panel.nextId++,
        username: input.username,
        email: input.email,
        external_id: input.external_id,
        first_name: input.first_name,
        last_name: input.last_name,
        root_admin: input.root_admin,
        created_at: new Date().toISOString(),
      };
      panel.accounts.push(account);
      return account;
    },
  ),
}));

const { prisma } = await import('../src/db.js');
const { reconcilePanelIdentity, externalIdFor, panelAddressFor } = await import('../src/services/panel/identity.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  panel.accounts = [];
  panel.nextId = 40;
  vi.clearAllMocks();
});

async function makeCustomer(email: string) {
  const { userId } = await registerAndLogin(await getApp(), email);
  const user = await prisma.user.findUnique({ where: { id: userId } });
  return user!;
}

describe('the identity of a customer on the panel', () => {
  it('creates one account of their own, with the two parts of the name', async () => {
    const customer = await makeCustomer('alice@example.com');

    const identity = await reconcilePanelIdentity(customer);

    expect(identity.created).toBe(true);
    expect(identity.externalId).toBe(externalIdFor(customer.id));
    expect(identity.externalId).toMatch(/^blipmade_acc_[a-z0-9]+$/);

    expect(panel.accounts).toHaveLength(1);
    const account = panel.accounts[0]!;
    expect(account.external_id).toBe(identity.externalId);
    expect(account.first_name).toBe('Test');
    expect(account.last_name).toBe('Customer');
    expect(account.root_admin).toBe(false);
  });

  it('gives the account an address that cannot receive mail', async () => {
    const customer = await makeCustomer('bob@example.com');

    await reconcilePanelIdentity(customer);

    expect(panel.accounts[0]!.email).toBe(panelAddressFor(customer.id, customer.email));
    expect(panel.accounts[0]!.email.endsWith('@panel.blipmade.invalid')).toBe(true);
  });

  it('keeps the mapping when the same customer is reconciled again', async () => {
    const customer = await makeCustomer('carol@example.com');

    const first = await reconcilePanelIdentity(customer);
    const second = await reconcilePanelIdentity(customer);

    expect(second.created).toBe(false);
    expect(second.panelUserId).toBe(first.panelUserId);
    expect(panel.accounts).toHaveLength(1);

    const stored = await prisma.user.findUnique({ where: { id: customer.id } });
    expect(stored?.pterodactylUserId).toBe(String(first.panelUserId));
    expect(stored?.pterodactylExternalId).toBe(first.externalId);
  });

  it('never takes over an account of the panel that carries the same address', async () => {
    const customer = await makeCustomer('dave@example.com');

    // Somebody created an account on the panel by hand. It carries the address
    // of the customer, but it does not carry the external id of Blipmade.
    panel.accounts.push({
      id: 7,
      username: 'dave',
      email: customer.email,
      external_id: null,
      first_name: 'Dave',
      last_name: 'Handmade',
      root_admin: false,
      created_at: new Date().toISOString(),
    });

    const identity = await reconcilePanelIdentity(customer);

    expect(identity.created).toBe(true);
    expect(identity.panelUserId).not.toBe(7);
    // The account of the hand is left alone and a second one is created.
    expect(panel.accounts).toHaveLength(2);
    expect(panel.accounts[1]!.external_id).toBe(externalIdFor(customer.id));
  });

  it('finds the account of a customer that the panel already knows', async () => {
    const customer = await makeCustomer('erin@example.com');

    panel.accounts.push({
      id: 9,
      username: 'bm-erin',
      email: panelAddressFor(customer.id, customer.email),
      external_id: externalIdFor(customer.id),
      first_name: 'Test',
      last_name: 'Customer',
      root_admin: false,
      created_at: new Date().toISOString(),
    });

    const identity = await reconcilePanelIdentity(customer);

    expect(identity.created).toBe(false);
    expect(identity.panelUserId).toBe(9);
    // No second account is created for a customer that already has one.
    expect(panel.accounts).toHaveLength(1);
  });

  it('gives every customer an account of their own', async () => {
    const first = await makeCustomer('frank@example.com');
    const second = await makeCustomer('grace@example.com');

    const one = await reconcilePanelIdentity(first);
    const two = await reconcilePanelIdentity(second);

    expect(one.panelUserId).not.toBe(two.panelUserId);
    expect(one.externalId).not.toBe(two.externalId);
    expect(panel.accounts).toHaveLength(2);
  });
});

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * A key of the panel that stops working.
 *
 * A key can be revoked on the panel, for instance because another one was
 * issued for the same account. The customer must not be left with a server
 * that cannot be reached: the platform asks for a new key and runs the
 * operation again.
 */

const panel = {
  /** The key that the platform has for the customer. */
  stored: 'ptlc_storedkey000000000000000000000000000000000',
  /** The key that a renewal hands out. */
  renewed: 'ptlc_renewedkey00000000000000000000000000000000',
  /** How many keys were renewed. */
  renewals: 0,
  /** The key that every request carried. */
  keys: [] as string[],
  /** How many times the panel refused the key. */
  refusals: 1,
};

vi.mock('../src/services/panel/credentials.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/panel/credentials.js')>(
    '../src/services/panel/credentials.js',
  );
  return {
    ...actual,
    resolveCustomerCredential: vi.fn(async (userId: string) => ({
      token: panel.stored,
      panelUserId: 4,
      externalId: `blipmade_acc_${userId}`,
      source: 'bootstrap',
    })),
    renewCustomerCredential: vi.fn(async () => {
      panel.renewals += 1;
      panel.stored = panel.renewed;
      return panel.renewed;
    }),
  };
});

const operations = await import('../src/services/panel/operations.js');
const client = await import('../src/services/pterodactyl/client.js');

const instance = {
  id: 'instance-1',
  userId: 'user-1',
  pterodactylUuid: 'server-uuid',
  pterodactylServerId: 10,
  status: 'ONLINE',
  // The variables the platform made for the instance. This instance needs
  // none, so the two are empty.
  generatedVariables: null,
  productVariables: null,
};

beforeEach(() => {
  panel.stored = 'ptlc_storedkey000000000000000000000000000000000';
  panel.renewed = 'ptlc_renewedkey00000000000000000000000000000000';
  panel.renewals = 0;
  panel.keys = [];
  panel.refusals = 1;
});

afterEach(() => {
  vi.unstubAllGlobals();
});

describe('a key that the panel does not know any more', () => {
  it('asks for a new key and runs the operation again', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async (input: unknown, init?: RequestInit) => {
        const headers = (init?.headers ?? {}) as Record<string, string>;
        panel.keys.push(String(headers.Authorization ?? ''));
        if (panel.refusals > 0) {
          panel.refusals -= 1;
          return new Response('Unauthenticated.', { status: 401, headers: { 'Content-Type': 'text/plain' } });
        }
        return new Response(
          JSON.stringify({
            object: 'stats',
            attributes: { state: 'offline', is_suspended: false, disk: { used: 1024 }, uptime: 0 },
          }),
          { status: 200, headers: { 'Content-Type': 'application/json' } },
        );
      }),
    );

    const stored = panel.stored;
    const renewed = panel.renewed;

    const resources = await operations.resources(stored, instance);

    expect(resources.state).toBe('offline');
    expect(panel.renewals).toBe(1);
    expect(panel.keys).toHaveLength(2);
    expect(panel.keys[0]).toContain(stored);
    expect(panel.keys[1]).toContain(renewed);
  });

  it('gives up when the panel refuses the new key as well', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('Unauthenticated.', { status: 401, headers: { 'Content-Type': 'text/plain' } })),
    );

    await expect(operations.resources(panel.stored, instance)).rejects.toThrow();
    expect(panel.renewals).toBe(1);
  });

  it('does not renew a key when the panel says something else', async () => {
    vi.stubGlobal(
      'fetch',
      vi.fn(async () => new Response('not found', { status: 404, headers: { 'Content-Type': 'text/plain' } })),
    );

    await expect(operations.resources(panel.stored, instance)).rejects.toBeInstanceOf(client.ClientApiError);
    expect(panel.renewals).toBe(0);
  });
});

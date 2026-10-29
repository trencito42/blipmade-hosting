import { randomUUID } from 'node:crypto';
import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { InstanceStatus } from '@prisma/client';
import type { TestClient } from './helpers.js';

/**
 * The state that the customer zone shows.
 *
 * The customer zone used to show the state that the platform believed when
 * the service was provisioned. A service whose container was running was
 * shown as restarting for ever, because the run that asks the node about the
 * containers skipped every instance whose container was healthy.
 *
 * These tests hold the rules that replace it:
 *
 *  - the state the customer sees is the state the node reports;
 *  - a node that cannot be asked keeps the last known state and says that it
 *    is not fresh, and it never breaks an instance;
 *  - a container that flaps between two states does not make the customer
 *    zone blink between two labels.
 *
 * The panel is faked at the network level, so no real node is ever asked.
 */

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');
const { encryptSecret } = await import('../src/lib/secrets.js');
const { reconcileRuntimeState } = await import('../src/services/runtime-state.js');

/** A client key of the panel, of the shape the panel itself issues. */
const CLIENT_KEY = `ptlc_${'c'.repeat(44)}`;

/**
 * The node, faked.
 *
 * The panel answers with the state of a server and with the memory the
 * container uses. The memory is what tells a container that is alive from one
 * that is not: a node whose eggs have no health check keeps every container
 * in "starting" for as long as it is up.
 */
const panel = {
  states: new Map<string, string>(),
  memory: new Map<string, number>(),
  silent: new Set<string>(),
};

function fakePanel(): void {
  vi.stubGlobal(
    'fetch',
    vi.fn(async (input: unknown) => {
      const url = new URL(String(input));
      const uuid = /\/servers\/([^/]+)\/resources/.exec(url.pathname)?.[1] ?? '';
      if (panel.silent.has(uuid)) {
        throw new Error('The node did not answer.');
      }
      return new Response(
        JSON.stringify({
          object: 'stats',
          attributes: {
            is_suspended: false,
            current_state: panel.states.get(uuid) ?? '',
            // The panel of the production nests the counters below "resources".
            resources: { memory_bytes: panel.memory.get(uuid) ?? 0 },
          },
        }),
        { status: 200, headers: { 'Content-Type': 'application/json' } },
      );
    }),
  );
}

/**
 * Stores the key of a customer the way the platform stores it: encrypted, one
 * per customer.
 *
 * A run that looks at the panel never mints a key of its own, so a customer
 * without a key is reported as unreachable instead of being asked.
 */
async function storeCredential(userId: string): Promise<void> {
  await prisma.panelCredential.create({
    data: {
      userId,
      panelUserId: 4,
      externalId: `blipmade_acc_${userId}`,
      tokenEnc: encryptSecret(CLIENT_KEY),
      source: 'bootstrap',
    },
  });
}

/**
 * A customer with a key of the panel, and an instance of that customer.
 *
 * The key is the one that is already stored: a run that looks at the panel
 * never mints a key of its own.
 */
async function seedOwner(): Promise<{ userId: string }> {
  const user = await prisma.user.create({
    data: {
      email: `owner-${randomUUID()}@example.com`,
      passwordHash: 'not-used-in-this-test',
      firstName: 'Test',
      lastName: 'Customer',
    },
  });
  await storeCredential(user.id);
  return { userId: user.id };
}

/**
 * A customer that is signed in, with a key of the panel.
 *
 * The customer zone is read over the API, so the customer has to be a real
 * one with a session.
 */
async function seedCustomer(): Promise<{ client: TestClient; userId: string }> {
  const app = await getApp();
  const { client, userId } = await registerAndLogin(app, `customer-${randomUUID()}@example.com`);
  await storeCredential(userId);
  return { client, userId };
}

async function seedInstance(
  userId: string,
  options: { status?: InstanceStatus; uuid?: string } = {},
): Promise<{ id: string; uuid: string }> {
  const product = await prisma.product.create({
    data: {
      slug: `game-${randomUUID().slice(0, 8)}`,
      name: 'Game server',
      category: 'WEB_CMS',
      description: 'A game server.',
      icon: 'globe',
    },
  });
  const uuid = options.uuid ?? `uuid-${randomUUID().slice(0, 8)}`;
  const instance = await prisma.instance.create({
    data: {
      userId,
      productId: product.id,
      name: 'game',
      status: options.status ?? 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylUuid: uuid,
    },
  });
  return { id: instance.id, uuid };
}

/**
 * Asks the node about the instances twice.
 *
 * A state has to be seen for a while before it replaces the one that is
 * shown, so one question is not enough. The hold is passed at once here, so
 * the test does not have to wait for it.
 */
async function observeTwice(): Promise<void> {
  await reconcileRuntimeState({ holdMs: 0 });
  await reconcileRuntimeState({ holdMs: 0 });
}

beforeAll(async () => {
  await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
  panel.states.clear();
  panel.memory.clear();
  panel.silent.clear();
});

describe('the state that the customer zone shows', () => {
  it('shows an instance whose container runs as online again', async () => {
    fakePanel();
    const { userId } = await seedOwner();
    const instance = await seedInstance(userId, { status: 'RESTARTING', uuid: 'uuid-restarting' });
    panel.states.set('uuid-restarting', 'running');

    await observeTwice();

    // Before, the run skipped every instance whose container was healthy, so
    // an instance whose container ran stayed "restarting" for good.
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
    expect(after?.runtimeCondition).toBe('serving');
    expect(after?.runtimeState).toBe('running');

    // The state that was moved is written down, so an operator sees it.
    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id, type: 'runtime_state' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.message).toContain('running');

    const audits = await prisma.auditLog.findMany({ where: { action: 'instance.runtime_state' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.targetId).toBe(instance.id);
  });

  it('shows the customer the state that the node reports, and not the state of the platform', async () => {
    fakePanel();
    const { client, userId } = await seedCustomer();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-stopped' });
    panel.states.set('uuid-stopped', 'stopped');

    await observeTwice();

    const answer = await client.request('GET', '/api/instances');
    expect(answer.status).toBe(200);
    const found = (answer.body.instances as { id: string; status: string; runtime: Record<string, unknown> }[]).find(
      (row) => row.id === instance.id,
    );
    expect(found?.status).toBe('stopped');
    expect(found?.runtime.state).toBe('stopped');
    expect(found?.runtime.condition).toBe('stopped');
    expect(found?.runtime.stale).toBe(false);

    // The platform still believes the instance is online: the decision to act
    // on a container that does not serve belongs to the operator.
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('shows a container that is still coming up as starting', async () => {
    fakePanel();
    const { client, userId } = await seedCustomer();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-booting' });
    panel.states.set('uuid-booting', 'starting');

    await observeTwice();

    const answer = await client.request('GET', '/api/instances');
    const found = (answer.body.instances as { id: string; status: string }[]).find((row) => row.id === instance.id);
    expect(found?.status).toBe('starting');
  });

  it('shows a container that is alive but that the node does not confirm as online', async () => {
    fakePanel();
    const { client, userId } = await seedCustomer();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-alive' });
    // The node of the platform keeps every container in "starting", because
    // the health check of the egg does not pass: the container serves, but
    // the node never promotes it.
    panel.states.set('uuid-alive', 'starting');
    panel.memory.set('uuid-alive', 46_694_400);

    await observeTwice();

    const answer = await client.request('GET', '/api/instances');
    const found = (answer.body.instances as { id: string; status: string }[]).find((row) => row.id === instance.id);
    // The container serves, and that is what the customer paid for.
    expect(found?.status).toBe('online');
  });

  it('keeps the last known state when the node cannot be asked, and says that it is not fresh', async () => {
    fakePanel();
    const { client, userId } = await seedCustomer();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-quiet' });
    panel.states.set('uuid-quiet', 'running');
    await observeTwice();

    // The node stops answering.
    panel.silent.add('uuid-quiet');
    await reconcileRuntimeState({ holdMs: 0 });

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    // The last known state is kept.
    expect(after?.runtimeCondition).toBe('serving');
    expect(after?.runtimeState).toBe('running');
    // And the instance is marked as not fresh.
    expect(after?.runtimeStateStale).toBe(true);
    // A node that does not answer does not break the instance.
    expect(after?.status).toBe('ONLINE');

    const answer = await client.request('GET', '/api/instances');
    const found = (answer.body.instances as { id: string; status: string; runtime: Record<string, unknown> }[]).find(
      (row) => row.id === instance.id,
    );
    expect(found?.status).toBe('online');
    expect(found?.runtime.stale).toBe(true);
  });

  it('does not break an instance that has no server on the panel', async () => {
    fakePanel();
    const { userId } = await seedOwner();
    const instance = await seedInstance(userId, { status: 'ONLINE' });
    // The server of the instance is gone from the panel.
    await prisma.instance.update({ where: { id: instance.id }, data: { pterodactylUuid: null } });

    const result = await reconcileRuntimeState({ holdMs: 0 });

    expect(result.observed).toBe(1);
    expect(result.unreachable).toBe(1);

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
    expect(after?.runtimeStateStale).toBe(true);
    expect(after?.cancelledAt).toBeNull();
  });

  it('never suspends, withdraws or deletes an instance', async () => {
    fakePanel();
    const { userId } = await seedOwner();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-crashed' });
    panel.states.set('uuid-crashed', 'crashed');

    await observeTwice();

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    // The state of the node is written down, but the instance is not broken
    // by it: the decision belongs to the operator.
    expect(after?.status).toBe('ONLINE');
    expect(after?.cancelledAt).toBeNull();
    expect(after?.suspendedAt).toBeNull();

    // The doubt is written down, so an operator sees the container that does
    // not serve.
    const events = await prisma.instanceEvent.findMany({
      where: { instanceId: instance.id, type: 'runtime_state' },
    });
    expect(events.length).toBeGreaterThan(0);
    expect(events[0]?.message).toContain('crashed');
  });

  it('does not let a container that flaps make the customer zone blink', async () => {
    fakePanel();
    const { client, userId } = await seedCustomer();
    const instance = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-flapping' });
    panel.states.set('uuid-flapping', 'running');
    await observeTwice();

    const answer = await client.request('GET', '/api/instances');
    const row = (answer.body.instances as { id: string; status: string }[]).find((r) => r.id === instance.id);
    expect(row?.status).toBe('online');

    // The container flaps between two states.
    for (const state of ['stopped', 'running', 'stopped', 'running', 'stopped', 'running']) {
      panel.states.set('uuid-flapping', state);
      await reconcileRuntimeState({ holdMs: 0 });
    }

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    // The state that is shown did not move: the state that flaps never waits
    // long enough to be trusted.
    expect(after?.runtimeCondition).toBe('serving');

    const second = await client.request('GET', '/api/instances');
    const found = (second.body.instances as { id: string; status: string }[]).find((r) => r.id === instance.id);
    expect(found?.status).toBe('online');
  });

  it('does not show a state that was only seen once', async () => {
    fakePanel();
    const { userId } = await seedOwner();
    const instance = await seedInstance(userId, { status: 'RESTARTING', uuid: 'uuid-once' });
    panel.states.set('uuid-once', 'running');

    // The hold is long, so the state that was seen once is not shown yet.
    await reconcileRuntimeState({ holdMs: 10 * 60_000 });
    await reconcileRuntimeState({ holdMs: 10 * 60_000 });

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.runtimeCondition).toBeNull();
    expect(after?.status).toBe('RESTARTING');
    // What the node said is written down all the same.
    expect(after?.runtimeState).toBe('running');
  });

  it('asks about the instance that was looked at the longest time ago first', async () => {
    fakePanel();
    const { userId } = await seedOwner();
    const old = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-old' });
    const fresh = await seedInstance(userId, { status: 'ONLINE', uuid: 'uuid-fresh' });
    // The first instance was looked at a long time ago, the second one was
    // looked at just now.
    await prisma.instance.update({
      where: { id: old.id },
      data: { updatedAt: new Date(Date.now() - 3 * 24 * 60 * 60_000) },
    });
    await prisma.instance.update({
      where: { id: fresh.id },
      data: { updatedAt: new Date() },
    });

    const result = await reconcileRuntimeState({ limit: 1, holdMs: 0 });

    expect(result.observed).toBe(1);
    // The instance that was not looked at for the longest time is the one that
    // is asked about: every instance is asked about in turn, and none of them
    // keeps a state that is never refreshed.
    const asked = (globalThis.fetch as unknown as ReturnType<typeof vi.fn>).mock.calls
      .map((call) => String(call[0]))
      .filter((url) => url.includes('/resources'));
    expect(asked).toHaveLength(1);
    expect(asked[0]).toContain('uuid-old');
  });
});

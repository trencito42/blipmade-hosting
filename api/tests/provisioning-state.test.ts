import { randomUUID } from 'node:crypto';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The state of a container, and the truth about an instance that is online.
 *
 * A deployment is only healthy when the node says that its container is
 * running, and an instance that the platform shows as online has to be
 * compared with the node from time to time. The panel is faked here, so no
 * real node is ever asked.
 */

const { prisma } = await import('../src/db.js');
const { verifyContainerDeployment } = await import('../src/services/provisioning.js');
const { observeRuntimeState, reconcileRuntimeState } = await import('../src/services/runtime-state.js');
const { encryptSecret } = await import('../src/lib/secrets.js');
const { resetDatabase } = await import('./helpers.js');

/** A client key of the panel, of the shape the panel itself issues. */
const CLIENT_KEY = `ptlc_${'b'.repeat(44)}`;

/**
 * The node, faked.
 *
 * The panel answers with the state of a server. A server that is not in the
 * list is answered without a state at all, which is what a panel that says
 * nothing about the container looks like. The memory is answered as well: the
 * node reports how much the container uses, and that is what tells a container
 * that is alive from one that is not.
 */
const panel = {
  states: new Map<string, string>(),
  memory: new Map<string, number>(),
  uptime: new Map<string, number>(),
  suspended: new Set<string>(),
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
      // The panel of the production nests the counters below "resources".
      const attributes: Record<string, unknown> = {
        is_suspended: panel.suspended.has(uuid),
        current_state: panel.states.get(uuid),
        resources: {
          memory_bytes: panel.memory.get(uuid) ?? 0,
          cpu_absolute: 0,
          disk_bytes: 0,
          network_rx_bytes: 0,
          network_tx_bytes: 0,
          uptime: panel.uptime.get(uuid) ?? 0,
        },
      };
      return new Response(JSON.stringify({ object: 'stats', attributes }), {
        status: 200,
        headers: { 'Content-Type': 'application/json' },
      });
    }),
  );
}

beforeEach(async () => {
  await resetDatabase();
  panel.states.clear();
  panel.memory.clear();
  panel.uptime.clear();
  panel.suspended.clear();
  panel.silent.clear();
});

afterEach(() => {
  vi.unstubAllGlobals();
});

/**
 * An instance that the platform believes is running, with the key of its
 * customer stored on the platform.
 */
async function seedOnlineInstance(
  options: { uuid?: string; withKey?: boolean; status?: string } = {},
) {
  const user = await prisma.user.create({
    data: {
      email: `owner-${randomUUID()}@example.com`,
      passwordHash: 'not-used-in-this-test',
      firstName: 'Test',
      lastName: 'Customer',
    },
  });
  const product = await prisma.product.create({
    data: {
      slug: `wordpress-${randomUUID().slice(0, 8)}`,
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
    },
  });
  const instance = await prisma.instance.create({
    data: {
      userId: user.id,
      productId: product.id,
      name: 'wordpress',
      status: options.status ?? 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylUuid: options.uuid ?? `uuid-${randomUUID().slice(0, 8)}`,
    },
  });

  if (options.withKey !== false) {
    await prisma.panelCredential.create({
      data: {
        userId: user.id,
        panelUserId: 4,
        externalId: `blipmade_acc_${user.id}`,
        tokenEnc: encryptSecret(CLIENT_KEY),
        source: 'bootstrap',
      },
    });
  }

  return { user, instance };
}

describe('the health check of a deployment that has no port', () => {
  it('calls a container that the node reports as running healthy', async () => {
    fakePanel();
    panel.states.set('uuid-running', 'running');

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-running', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    expect(result.ok).toBe(true);
    expect(result.message).toContain('running');
  });

  it('refuses a container that the node still reports as starting, and names the state', async () => {
    fakePanel();
    panel.states.set('uuid-starting', 'starting');

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-starting', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    // A container that is still starting is not a service yet, so the
    // deployment is not healthy.
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('starting');
  });

  it('refuses a container that the node reports as offline, and names the state', async () => {
    fakePanel();
    panel.states.set('uuid-offline', 'offline');

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-offline', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toContain('offline');
  });

  it('refuses an answer that carries no state', async () => {
    fakePanel();

    // The panel answers, but it does not say in what state the container is.
    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-without-state', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    expect(result.ok).toBe(false);
    expect(result.reason).toMatch(/no state/i);
  });

  it('serves a container that is alive even when the node does not confirm the running state', async () => {
    fakePanel();
    // The node of the platform keeps every container in "starting", because
    // the health check of the egg does not pass: the container uses memory
    // and serves, but the node never promotes it.
    panel.states.set('uuid-alive', 'starting');
    panel.memory.set('uuid-alive', 46_694_400);

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-alive', { kind: 'container' }, {
      attempts: 8,
      delayMs: 1,
    });

    expect(result.ok).toBe(true);
    // The doubt is written down, it is not hidden.
    expect(result.message).toContain('does not confirm');
    expect(result.message).toContain('45 MB');
  });

  it('refuses a container that the node reports as stopped', async () => {
    fakePanel();
    panel.states.set('uuid-stopped', 'stopped');
    panel.memory.set('uuid-stopped', 46_694_400);

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-stopped', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    // A container that the node reports as stopped does not serve, even if it
    // still holds memory.
    expect(result.ok).toBe(false);
    expect(result.reason).toContain('stopped');
  });

  it('refuses a container that is suspended', async () => {
    fakePanel();
    panel.states.set('uuid-suspended', 'starting');
    panel.memory.set('uuid-suspended', 46_694_400);
    panel.suspended.add('uuid-suspended');

    const result = await verifyContainerDeployment(CLIENT_KEY, 'uuid-suspended', { kind: 'container' }, {
      attempts: 2,
      delayMs: 1,
    });

    expect(result.ok).toBe(false);
  });
});

describe('the state of an instance that the platform shows as online', () => {
  it('reports what the node says about the instance', async () => {
    fakePanel();
    panel.states.set('uuid-1', 'starting');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-1' });

    const observation = await observeRuntimeState(instance.id);

    expect(observation?.nodeState).toBe('starting');
    expect(observation?.running).toBe(false);
    expect(observation?.unreachable).toBe(false);
  });

  it('reports an instance that the node does not answer about as unreachable', async () => {
    fakePanel();
    panel.silent.add('uuid-1');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-1' });

    const observation = await observeRuntimeState(instance.id);

    expect(observation?.unreachable).toBe(true);
    expect(observation?.running).toBe(false);
  });

  it('asks for no key when the customer has none stored', async () => {
    fakePanel();
    panel.states.set('uuid-1', 'running');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-1', withKey: false });

    const observation = await observeRuntimeState(instance.id);

    expect(observation?.unreachable).toBe(true);
    // The run only looks, so it never mints a key of its own.
    const credentials = await prisma.panelCredential.findMany();
    expect(credentials).toHaveLength(0);
  });

  it('writes down an instance that the node does not report as running, and leaves it alone', async () => {
    fakePanel();
    panel.states.set('uuid-broken', 'starting');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-broken' });

    const result = await reconcileRuntimeState();

    expect(result.observed).toBe(1);
    expect(result.notRunning).toBe(1);
    expect(result.unreachable).toBe(0);

    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    const runtime = events.filter((event) => event.type === 'runtime_state');
    expect(runtime).toHaveLength(1);
    expect(runtime[0]?.message).toContain('starting');

    const audits = await prisma.auditLog.findMany({ where: { action: 'instance.runtime_state' } });
    expect(audits).toHaveLength(1);
    expect(audits[0]?.targetId).toBe(instance.id);

    // The instance is not touched: the decision belongs to the operator.
    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('writes nothing down for an instance that the node reports as running', async () => {
    fakePanel();
    panel.states.set('uuid-healthy', 'running');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-healthy' });

    const result = await reconcileRuntimeState();

    expect(result.observed).toBe(1);
    expect(result.notRunning).toBe(0);
    expect(result.unreachable).toBe(0);

    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    expect(events.filter((event) => event.type === 'runtime_state')).toHaveLength(0);
    const audits = await prisma.auditLog.findMany({ where: { action: 'instance.runtime_state' } });
    expect(audits).toHaveLength(0);

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('tells apart an instance that is alive from one that is not serving', async () => {
    fakePanel();
    // The container is alive, but the node does not confirm it: the health
    // check of the egg does not pass.
    panel.states.set('uuid-alive', 'starting');
    panel.memory.set('uuid-alive', 46_694_400);
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-alive' });

    const result = await reconcileRuntimeState();

    expect(result.observed).toBe(1);
    // The container serves, so it is not counted as broken.
    expect(result.notRunning).toBe(0);
    expect(result.unconfirmed).toBe(1);
    expect(result.unreachable).toBe(0);

    // The doubt is still written down, once.
    const events = await prisma.instanceEvent.findMany({ where: { instanceId: instance.id } });
    const runtime = events.filter((event) => event.type === 'runtime_state');
    expect(runtime).toHaveLength(1);
    expect(runtime[0]?.message).toContain('does not confirm');

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('counts an instance whose node cannot be reached, without failing the run', async () => {
    fakePanel();
    panel.silent.add('uuid-silent');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-silent' });

    const result = await reconcileRuntimeState();

    expect(result.observed).toBe(1);
    expect(result.unreachable).toBe(1);
    expect(result.notRunning).toBe(0);

    const after = await prisma.instance.findUnique({ where: { id: instance.id } });
    expect(after?.status).toBe('ONLINE');
  });

  it('looks only at the instances the platform believes are running', async () => {
    fakePanel();
    panel.states.set('uuid-stopped', 'offline');
    const { instance } = await seedOnlineInstance({ uuid: 'uuid-stopped' });
    await prisma.instance.update({ where: { id: instance.id }, data: { status: 'STOPPED' } });

    const result = await reconcileRuntimeState();

    expect(result.observed).toBe(0);
    expect(result.notRunning).toBe(0);
  });
});

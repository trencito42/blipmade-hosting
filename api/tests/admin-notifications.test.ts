import { mkdtemp } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { hashPassword } from '../src/lib/password.js';
import { registerAdminNotificationRoutes } from '../src/routes/admin-notifications.js';
import { EVENT_DEFINITIONS } from '../src/services/notification-events.js';
import {
  closeApp,
  createAdmin,
  getApp,
  makeClient,
  registerAndLogin,
  resetDatabase,
  VALID_PASSWORD,
} from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The back office of the notifications.
 *
 * The back office shows the state of the messages of the platform and the
 * history of its events. The truth of the transport matters more than the
 * numbers: the test environment has no relay, so the platform writes the
 * messages to files and nothing is sent.
 */

let app: FastifyInstance;

/** Creates a staff member with the given permissions and logs them in. */
async function createStaff(
  email: string,
  permissions: string[],
): Promise<{ client: TestClient; userId: string }> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash: await hashPassword(VALID_PASSWORD),
      role: 'STAFF',
      firstName: 'Test',
      lastName: 'Staff',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });

  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return { client, userId: user.id };
}

/** Waits for the row of a message: the row is written without waiting for it. */
async function waitForDelivery(key: string) {
  const deadline = Date.now() + 5000;
  while (Date.now() < deadline) {
    const row = await prisma.mailDelivery.findUnique({ where: { key } });
    if (row) return row;
    await new Promise((resolve) => setTimeout(resolve, 25));
  }
  return null;
}

/**
 * A template of the catalogue and a payload it can be rendered with.
 *
 * The payloads are the payloads of the events of the registry, so the test
 * renders the templates the way the platform renders them.
 */
const TEMPLATE_PAYLOADS: Array<{ id: string; payload: Record<string, unknown> }> = [
  { id: 'account-welcome', payload: { name: 'Ada' } },
  {
    id: 'invoice-paid',
    payload: { number: 'INV-1', amount: '10.00', currency: 'EUR', periodEnd: '2026-12-31' },
  },
];

async function renderableTemplate(
  client: TestClient,
): Promise<{ id: string; payload: Record<string, unknown> }> {
  for (const entry of TEMPLATE_PAYLOADS) {
    const answer = await client.request('POST', `/api/admin/notifications/templates/${entry.id}/validate`, {
      payload: entry.payload,
    });
    if (answer.status === 200 && (answer.body?.missing ?? []).length === 0) return entry;
  }
  const first = TEMPLATE_PAYLOADS[0];
  if (!first) throw new Error('The catalogue of the templates is empty.');
  return first;
}

beforeAll(async () => {
  app = await getApp();
  // The routes of the back office of the notifications are registered on the
  // application of the test when the platform does not register them itself,
  // so the test reads the same before and after the platform registers them.
  if (!app.hasRoute({ method: 'GET', url: '/api/admin/notifications/overview' })) {
    await app.register(async (api) => {
      await registerAdminNotificationRoutes(api);
    }, { prefix: '/api' });
  }

  // The file transport writes the messages of the test in a directory of the
  // test, so the messages of the test never land in the directory of the
  // platform.
  const root = await mkdtemp(join(tmpdir(), 'blipmade-notifications-'));
  (env as unknown as { BACKUP_DIR: string }).BACKUP_DIR = root;
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('the overview of the notifications', () => {
  it('counts the states and says the truth about the transport when there is no relay', async () => {
    const { client: admin } = await createAdmin(app);

    await prisma.mailDelivery.create({
      data: { key: 'overview-written', kind: 'invoice.paid', to: 'one@example.test', state: 'written-to-file', transport: 'file', attempts: 1 },
    });
    await prisma.mailDelivery.create({
      data: { key: 'overview-failed', kind: 'invoice.paid', to: 'two@example.test', state: 'failed', transport: 'file', attempts: 3 },
    });
    // A row that says "delivered" but that the file transport wrote is a
    // contradiction: it is never counted as delivered.
    await prisma.mailDelivery.create({
      data: { key: 'overview-contradiction', kind: 'payment.succeeded', to: 'three@example.test', state: 'delivered', transport: 'file', attempts: 1 },
    });
    await prisma.notificationEvent.create({
      data: {
        type: 'invoice.paid',
        businessKey: 'invoice.paid:overview:1',
        payload: { number: 'INV-1', amount: '10.00', currency: 'EUR' },
        state: 'pending',
      },
    });

    const answer = await admin.request('GET', '/api/admin/notifications/overview');
    expect(answer.status).toBe(200);

    const overview = answer.body.overview;
    // There is no relay in the test environment: the platform writes files
    // and nothing is sent.
    expect(overview.transport.transport).toBe('file');
    expect(overview.transport.relayConfigured).toBe(false);
    expect(overview.transport.sending).toBe(false);
    expect(overview.transport.notice).toMatch(/nothing is being sent/i);

    expect(overview.deliveries.writtenToFile).toBe(1);
    expect(overview.deliveries.failed).toBe(1);
    expect(overview.deliveries.delivered).toBe(0);
    expect(overview.events.pending).toBe(1);
    expect(overview.events.processed).toBe(0);
    expect(overview.unreadNotifications).toBe(0);
    expect(overview.templates).toBeGreaterThan(0);
  });
});

describe('the ledger of the messages', () => {
  it('filters by state and by kind and walks the list with a cursor', async () => {
    const { client: admin } = await createAdmin(app);

    await prisma.mailDelivery.create({
      data: { key: 'aaa-delivered', kind: 'invoice.paid', to: 'one@example.test', state: 'delivered', transport: 'smtp', attempts: 1, updatedAt: new Date('2026-01-03T10:00:00Z') },
    });
    await prisma.mailDelivery.create({
      data: { key: 'bbb-failed', kind: 'invoice.paid', to: 'two@example.test', state: 'failed', transport: 'smtp', attempts: 2, updatedAt: new Date('2026-01-02T10:00:00Z') },
    });
    await prisma.mailDelivery.create({
      data: { key: 'ccc-written', kind: 'payment.succeeded', to: 'three@example.test', state: 'written-to-file', transport: 'file', attempts: 1, updatedAt: new Date('2026-01-01T10:00:00Z') },
    });

    const failed = await admin.request('GET', '/api/admin/notifications/deliveries?state=failed');
    expect(failed.status).toBe(200);
    expect(failed.body.deliveries).toHaveLength(1);
    expect(failed.body.deliveries[0].key).toBe('bbb-failed');
    expect(failed.body.deliveries[0].errorClass).toBeNull();

    const byKind = await admin.request('GET', '/api/admin/notifications/deliveries?kind=invoice.paid');
    expect(byKind.body.deliveries).toHaveLength(2);

    const page = await admin.request('GET', '/api/admin/notifications/deliveries?limit=2');
    expect(page.body.deliveries).toHaveLength(2);
    expect(page.body.nextCursor).toBeTruthy();

    const next = await admin.request('GET', `/api/admin/notifications/deliveries?limit=2&cursor=${page.body.nextCursor}`);
    expect(next.body.deliveries).toHaveLength(1);
    expect(next.body.deliveries[0].key).toBe('ccc-written');
    expect(next.body.nextCursor).toBeNull();
  });
});

describe('the history of the events', () => {
  it('filters by type and by state', async () => {
    const { client: admin } = await createAdmin(app);

    await prisma.notificationEvent.create({
      data: {
        type: 'invoice.paid',
        businessKey: 'invoice.paid:history:1',
        payload: { number: 'INV-1', amount: '10.00', currency: 'EUR' },
        state: 'processed',
        channels: { email: 'sent', in_app: 'sent' },
      },
    });
    await prisma.notificationEvent.create({
      data: {
        type: 'payment.failed',
        businessKey: 'payment.failed:history:1',
        payload: { number: 'INV-2', amount: '10.00', currency: 'EUR', reason: null },
        state: 'pending',
      },
    });

    const byType = await admin.request('GET', '/api/admin/notifications/events?type=invoice.paid');
    expect(byType.status).toBe(200);
    expect(byType.body.events).toHaveLength(1);
    expect(byType.body.events[0].type).toBe('invoice.paid');
    expect(byType.body.events[0].channels.email).toBe('sent');

    const byState = await admin.request('GET', '/api/admin/notifications/events?state=pending');
    expect(byState.body.events).toHaveLength(1);
    expect(byState.body.events[0].type).toBe('payment.failed');
  });
});

describe('the repetition of an event', () => {
  it('puts a failed event back on the queue and says what happened', async () => {
    const { client: admin } = await createAdmin(app);
    const { userId } = await registerAndLogin(app, 'owner@example.test');

    const event = await prisma.notificationEvent.create({
      data: {
        type: 'invoice.paid',
        businessKey: 'invoice.paid:retry:1',
        userId,
        payload: { number: 'INV-1', amount: '10.00', currency: 'EUR' },
        state: 'failed',
        attempts: 3,
        lastError: 'the relay refused the message',
        // The oldest pending event of the platform is the one the dispatcher
        // reads first.
        createdAt: new Date('2026-01-01T00:00:00Z'),
      },
    });

    const answer = await admin.request('POST', `/api/admin/notifications/events/${event.id}/retry`);
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(answer.body.dispatched.read).toBeGreaterThanOrEqual(1);
    expect(answer.body.dispatched.processed).toBeGreaterThanOrEqual(1);

    const after = await prisma.notificationEvent.findUnique({ where: { id: event.id } });
    expect(after?.state).toBe('processed');
    expect(after?.attempts).toBe(1);

    // The operator is written down as the one who asked for it.
    const entry = await prisma.auditLog.findFirst({ where: { action: 'notification.event.retried' } });
    expect(entry).toBeTruthy();
    expect(entry?.actorId).toBeTruthy();
  });
});

describe('the repetition of a message', () => {
  it('refuses in words a message that has no event', async () => {
    const { client: admin } = await createAdmin(app);

    await prisma.mailDelivery.create({
      data: { key: 'lonely-message', kind: 'verification', to: 'someone@example.test', state: 'failed', transport: 'file', attempts: 2 },
    });

    const answer = await admin.request('POST', '/api/admin/notifications/deliveries/lonely-message/retry');
    expect(answer.status).toBeGreaterThanOrEqual(400);
    expect(String(answer.body.error?.message)).toMatch(/does not have the facts/i);

    // The message was not put back on the queue.
    const row = await prisma.mailDelivery.findUnique({ where: { key: 'lonely-message' } });
    expect(row?.state).toBe('failed');
  });

  it('puts a message back on the queue when the event of the message is there', async () => {
    const { client: admin } = await createAdmin(app);

    const event = await prisma.notificationEvent.create({
      data: {
        type: 'invoice.paid',
        businessKey: 'invoice.paid:delivery-retry:1',
        payload: { number: 'INV-1', amount: '10.00', currency: 'EUR', periodEnd: '2026-12-31' },
        state: 'processed',
      },
    });
    await prisma.mailDelivery.create({
      data: {
        key: 'message-of-an-event',
        kind: 'invoice.paid',
        to: 'owner@example.test',
        eventId: event.id,
        state: 'failed',
        transport: 'file',
        attempts: 3,
      },
    });

    const answer = await admin.request('POST', '/api/admin/notifications/deliveries/message-of-an-event/retry');
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(answer.body.key).toBe('message-of-an-event');

    // The ledger says that the message is waiting again.
    const deadline = Date.now() + 5000;
    let row = await prisma.mailDelivery.findUnique({ where: { key: 'message-of-an-event' } });
    while (row?.state !== 'queued' && Date.now() < deadline) {
      await new Promise((resolve) => setTimeout(resolve, 25));
      row = await prisma.mailDelivery.findUnique({ where: { key: 'message-of-an-event' } });
    }
    expect(row?.state).toBe('queued');

    // The job of the message is removed, so the queue of the test stays clean.
    const { getEmailQueue, emailJobId } = await import('../src/services/queue.js');
    await getEmailQueue().remove(emailJobId('message-of-an-event')).catch(() => undefined);
  });
});

describe('the catalogue of the templates', () => {
  it('holds every template of the platform and renders a preview without sending anything', async () => {
    const { client: admin } = await createAdmin(app);

    const catalogue = await admin.request('GET', '/api/admin/notifications/templates');
    expect(catalogue.status).toBe(200);
    const templates = catalogue.body.templates as Array<{ id: string }>;
    expect(templates.length).toBeGreaterThan(0);

    // Every template of the registry of the events is in the catalogue, or
    // the engine could not render the message of that event.
    const ids = templates.map((template) => template.id);
    for (const definition of Object.values(EVENT_DEFINITIONS)) {
      expect(ids).toContain(definition.template);
    }

    const chosen = await renderableTemplate(admin);
    const before = await prisma.mailDelivery.count();

    const preview = await admin.request('POST', `/api/admin/notifications/templates/${chosen.id}/preview`, {
      payload: chosen.payload,
    });
    expect(preview.status).toBe(200);
    expect(preview.body.preview.subject).toBeTruthy();
    expect(preview.body.preview.text).toBeTruthy();

    // The preview sends nothing: the ledger did not move.
    expect(await prisma.mailDelivery.count()).toBe(before);
  });

  it('names the placeholders a payload does not carry', async () => {
    const { client: admin } = await createAdmin(app);

    const catalogue = await admin.request('GET', '/api/admin/notifications/templates');
    const templates = catalogue.body.templates as Array<{ id: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const chosen = await renderableTemplate(admin);

    const empty = await admin.request('POST', `/api/admin/notifications/templates/${chosen.id}/validate`, {
      payload: {},
    });
    expect(empty.status).toBe(200);
    expect(Array.isArray(empty.body.missing)).toBe(true);

    // The payload that carries every placeholder has nothing missing.
    const full = await admin.request('POST', `/api/admin/notifications/templates/${chosen.id}/validate`, {
      payload: chosen.payload,
    });
    expect(full.status).toBe(200);
    expect(full.body.missing).toEqual([]);
  });
});

describe('the test message', () => {
  it('goes to the address the operator gave and to nobody else', async () => {
    const { client: admin } = await createAdmin(app);
    await registerAndLogin(app, 'owner@example.test');

    const catalogue = await admin.request('GET', '/api/admin/notifications/templates');
    const templates = catalogue.body.templates as Array<{ id: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const chosen = await renderableTemplate(admin);

    const before = await prisma.mailDelivery.findMany({ select: { key: true } });
    const known = new Set(before.map((row) => row.key));

    const answer = await admin.request('POST', '/api/admin/notifications/test-send', {
      to: 'operator@example.test',
      templateId: chosen.id,
      payload: chosen.payload,
    });
    expect(answer.status).toBe(200);
    expect(answer.body.ok).toBe(true);
    expect(answer.body.key).toBeTruthy();

    const row = await waitForDelivery(answer.body.key);
    expect(row?.to).toBe('operator@example.test');

    // No other address received a message of the test.
    const after = await prisma.mailDelivery.findMany();
    for (const message of after) {
      if (known.has(message.key)) continue;
      expect(message.to).toBe('operator@example.test');
    }
  });

  it('is refused when the address is not an address', async () => {
    const { client: admin } = await createAdmin(app);

    const catalogue = await admin.request('GET', '/api/admin/notifications/templates');
    const templates = catalogue.body.templates as Array<{ id: string }>;
    expect(templates.length).toBeGreaterThan(0);
    const chosen = await renderableTemplate(admin);

    const refused = await admin.request('POST', '/api/admin/notifications/test-send', {
      to: 'The Operator',
      templateId: chosen.id,
      payload: chosen.payload,
    });
    expect(refused.status).toBe(400);
    expect(String(refused.body.error?.fields?.to ?? '')).toMatch(/address/i);
  });
});

describe('the activity and the categories', () => {
  it('answers the trends and the categories with real numbers', async () => {
    const { client: admin } = await createAdmin(app);

    await prisma.mailDelivery.create({
      data: { key: 'trend-failed', kind: 'invoice.paid', to: 'one@example.test', state: 'failed', transport: 'smtp', attempts: 1 },
    });
    await prisma.notificationEvent.create({
      data: {
        type: 'invoice.paid',
        businessKey: 'invoice.paid:trends:1',
        payload: { number: 'INV-1', amount: '10.00', currency: 'EUR' },
        state: 'processed',
      },
    });

    const trends = await admin.request('GET', '/api/admin/notifications/trends');
    expect(trends.status).toBe(200);
    expect(trends.body.days).toHaveLength(7);
    const today = trends.body.days[trends.body.days.length - 1];
    expect(today.failed).toBe(1);
    expect(today.delivered).toBe(0);
    expect(today.events).toBe(1);

    const categories = await admin.request('GET', '/api/admin/notifications/categories');
    expect(categories.status).toBe(200);
    const billing = categories.body.categories.find(
      (category: { key: string }) => category.key === 'ordersBilling',
    );
    expect(billing).toBeTruthy();
    expect(billing.events).toBe(1);
    expect(billing.eventTypes).toBeGreaterThan(0);
    expect(billing.classifications.length).toBeGreaterThan(0);
    expect(billing.channels).toContain('email');
  });
});

describe('the permissions of the back office of the notifications', () => {
  it('refuses a staff member without the permission on a read and on a write', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', []);

    const read = await staff.request('GET', '/api/admin/notifications/overview');
    expect(read.status).toBe(403);
    expect(String(read.body.error?.message)).toMatch(/audit\.read/);

    const write = await staff.request('POST', '/api/admin/notifications/test-send', {
      to: 'operator@example.test',
      templateId: 'account-welcome',
    });
    expect(write.status).toBe(403);
    expect(String(write.body.error?.message)).toMatch(/infrastructure\.write/);
  });
});

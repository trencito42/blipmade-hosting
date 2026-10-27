import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';

/**
 * The customer asks for a reset, the message is lost, and he asks again.
 *
 * The engine of the notifications writes every event in an outbox, and the key
 * of an event says what makes it the same event. The key of a request of the
 * customer was the type of the event and the account of the customer, with
 * nothing else. Every request of a customer was therefore the same event: the
 * engine found the event of the first request, decided that the thing had
 * already happened and sent nothing at all.
 *
 * The customer was told that a reset was asked for, and no message ever went
 * out. The second request was the one that mattered — it was asked for
 * because the first message never arrived — and it was the one that was
 * swallowed.
 *
 * The test asks twice and expects two events and two messages.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await (await import('./helpers.js')).getApp();
});

afterAll(async () => {
  await (await import('./helpers.js')).closeApp();
});

beforeEach(async () => {
  await (await import('./helpers.js')).resetDatabase();
});

describe('a second request of a reset is a message of its own', () => {
  it('writes an event and sends a message for every request', async () => {
    const { prisma } = await import('../src/db.js');
    const { dispatchPendingEvents } = await import('../src/services/notification-dispatch.js');
    const { makeClient, registerAndLogin } = await import('./helpers.js');

    const { userId } = await registerAndLogin(app, 'again@example.com');
    const visitor = makeClient(app);

    expect((await visitor.request('POST', '/api/auth/forgot-password', { email: 'again@example.com' })).status).toBe(200);
    expect((await visitor.request('POST', '/api/auth/forgot-password', { email: 'again@example.com' })).status).toBe(200);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'account.password_reset_requested', userId },
    });
    // Two requests, two events. With the old key the second one was the same
    // event as the first one and no message was ever sent.
    expect(events).toHaveLength(2);
    expect(new Set(events.map((event) => event.businessKey)).size).toBe(2);

    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({
      where: { kind: 'account.password_reset_requested', to: 'again@example.com' },
    });
    expect(deliveries).toHaveLength(2);
  });

  it('writes an event for every request of a confirmation of the address', async () => {
    const { prisma } = await import('../src/db.js');
    const { registerAndLogin } = await import('./helpers.js');
    const { sendVerificationEmail } = await import('../src/routes/auth.js');

    const { userId } = await registerAndLogin(app, 'verify-again@example.com');

    // The registration sent one confirmation of its own.
    const before = await prisma.notificationEvent.count({
      where: { type: 'account.verification_requested', userId },
    });

    await sendVerificationEmail(userId, 'verify-again@example.com', 'Test Customer');
    await sendVerificationEmail(userId, 'verify-again@example.com', 'Test Customer');

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'account.verification_requested', userId },
    });
    expect(events.length - before).toBe(2);
    expect(new Set(events.map((event) => event.businessKey)).size).toBe(events.length);
  });
});

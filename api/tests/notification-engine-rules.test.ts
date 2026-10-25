import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import {
  defaultPreferences,
  dispatchPendingEvents,
  publishEvent,
  wantsMessage,
} from '../src/services/notification-dispatch.js';
import type { FastifyInstance } from 'fastify';

/**
 * The rules of the notification engine.
 *
 * Three things are checked here, because they are the rules that decide what
 * a customer hears about:
 *
 *   * the essential messages always go out, whatever the customer chose;
 *   * the optional ones follow the group and the channel of the customer;
 *   * the marketing ones need an agreement that is kept with a date, and
 *     they never go to the notification centre.
 */

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('what a customer hears about', () => {
  it('always sends the essential messages, whatever the customer chose', () => {
    const preferences = {
      ...defaultPreferences(),
      accountSecurity: false,
      emailChannel: false,
      inAppChannel: false,
    };

    expect(wantsMessage(preferences, 'essential', 'accountSecurity', 'email')).toBe(true);
    expect(wantsMessage(preferences, 'essential', 'accountSecurity', 'in_app')).toBe(true);
  });

  it('follows the group and the channel of the customer for the optional ones', () => {
    const preferences = { ...defaultPreferences(), support: false, emailChannel: false };

    expect(wantsMessage(preferences, 'optional', 'support', 'email')).toBe(false);
    expect(wantsMessage(preferences, 'optional', 'support', 'in_app')).toBe(false);

    const withTheGroup = { ...preferences, support: true };
    expect(wantsMessage(withTheGroup, 'optional', 'support', 'email')).toBe(false);
    expect(wantsMessage(withTheGroup, 'optional', 'support', 'in_app')).toBe(true);
  });

  it('needs an agreement for the marketing, and never writes them in the centre', () => {
    const withoutAgreement = { ...defaultPreferences(), marketing: true, marketingOptInAt: null };
    expect(wantsMessage(withoutAgreement, 'marketing', 'marketing', 'email')).toBe(false);

    const withAgreement = {
      ...withoutAgreement,
      marketingOptInAt: new Date('2026-01-01T00:00:00Z'),
    };
    expect(wantsMessage(withAgreement, 'marketing', 'marketing', 'email')).toBe(true);
    // The marketing is a message of the mailbox and nothing else.
    expect(wantsMessage(withAgreement, 'marketing', 'marketing', 'in_app')).toBe(false);

    const switchedOff = { ...withAgreement, marketing: false };
    expect(wantsMessage(switchedOff, 'marketing', 'marketing', 'email')).toBe(false);
  });

  it('honours the old switch of the platform next to the new one', () => {
    const preferences = { ...defaultPreferences(), ordersBilling: true, billing: false };
    expect(wantsMessage(preferences, 'optional', 'ordersBilling', 'email')).toBe(false);
  });
});

describe('the outbox', () => {
  it('refuses an event that nobody decided about', async () => {
    await expect(
      publishEvent({
        type: 'account.made_up' as never,
        subject: 'anything',
        userId: null,
        payload: {} as never,
      }),
    ).rejects.toThrow(/Unknown notification event/);
  });

  it('writes the same occurrence only once', async () => {
    const { userId } = await registerAndLogin(app, 'once@example.com');

    const first = await publishEvent({
      type: 'order.created',
      subject: 'BM-00001',
      userId,
      payload: { number: 'BM-00001', total: '10.00 EUR', currency: 'EUR' },
      occurrence: 'BM-00001',
    });
    const second = await publishEvent({
      type: 'order.created',
      subject: 'BM-00001',
      userId,
      payload: { number: 'BM-00001', total: '10.00 EUR', currency: 'EUR' },
      occurrence: 'BM-00001',
    });

    expect(first.created).toBe(true);
    expect(second.created).toBe(false);
    expect(second.eventId).toBe(first.eventId);
    expect(await prisma.notificationEvent.count({ where: { type: 'order.created' } })).toBe(1);
  });

  it('keeps two occurrences of the same state apart', async () => {
    const { userId } = await registerAndLogin(app, 'twice@example.com');

    await publishEvent({
      type: 'service.suspended',
      subject: 'instance-1',
      userId,
      payload: { service: 'Web', reason: 'the payment failed' },
      occurrence: '2026-01-01T00:00:00.000Z',
    });
    await publishEvent({
      type: 'service.suspended',
      subject: 'instance-1',
      userId,
      payload: { service: 'Web', reason: 'the payment failed' },
      occurrence: '2026-02-01T00:00:00.000Z',
    });

    expect(await prisma.notificationEvent.count({ where: { type: 'service.suspended' } })).toBe(2);
  });

  it('empties the facts of a secret only when the message really went out', async () => {
    const { userId } = await registerAndLogin(app, 'secret@example.com');

    const event = await publishEvent({
      type: 'account.password_reset_requested',
      subject: 'reset-1',
      userId,
      payload: { name: 'Test', token: 'a-token-that-must-not-stay' },
      occurrence: 'reset-1',
    });

    await dispatchPendingEvents(10);

    const stored = await prisma.notificationEvent.findUnique({ where: { id: event.eventId } });
    expect(stored?.state).toBe('processed');
    expect(stored?.payload).toEqual({});
    // The message carries the token, and the token is not kept anywhere else.
    const deliveries = await prisma.mailDelivery.findMany({ where: { eventId: event.eventId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.to).toBe('secret@example.com');
  });
});

describe('when the worker is not the only one', () => {
  it('never sends the same message twice, even when two workers take it at the same time', async () => {
    const { userId } = await registerAndLogin(app, 'twice-at-once@example.com');

    const event = await publishEvent({
      type: 'invoice.issued',
      subject: 'BM-00003',
      userId,
      payload: { number: 'BM-00003', amount: '10.00 EUR', currency: 'EUR', dueAt: null },
    });

    // Two workers read the outbox at the same time. The event is claimed
    // before it is delivered, so the message goes out once.
    await Promise.all([dispatchPendingEvents(10), dispatchPendingEvents(10)]);

    const deliveries = await prisma.mailDelivery.findMany({ where: { eventId: event.eventId } });
    expect(deliveries).toHaveLength(1);
    expect(deliveries[0]?.to).toBe('twice-at-once@example.com');
  });

  it('takes back an event that a worker claimed and never finished', async () => {
    const { userId } = await registerAndLogin(app, 'crashed@example.com');

    const event = await publishEvent({
      type: 'invoice.issued',
      subject: 'BM-00004',
      userId,
      payload: { number: 'BM-00004', amount: '10.00 EUR', currency: 'EUR', dueAt: null },
    });

    // The worker took the event and died before it could deliver it.
    await prisma.notificationEvent.update({
      where: { id: event.eventId },
      data: { state: 'processing', updatedAt: new Date(Date.now() - 10 * 60_000) },
    });

    await dispatchPendingEvents(10);

    const stored = await prisma.notificationEvent.findUnique({ where: { id: event.eventId } });
    expect(stored?.state).toBe('processed');
    const deliveries = await prisma.mailDelivery.findMany({ where: { eventId: event.eventId } });
    expect(deliveries).toHaveLength(1);
  });

  it('gives up on an event that failed too many times and leaves it for the operator', async () => {
    const { userId } = await registerAndLogin(app, 'dead-letter@example.com');

    const event = await publishEvent({
      type: 'invoice.issued',
      subject: 'BM-00005',
      userId,
      payload: { number: 'BM-00005', amount: '10.00 EUR', currency: 'EUR', dueAt: null },
    });

    // The event has already been tried five times and failed every time.
    await prisma.notificationEvent.update({
      where: { id: event.eventId },
      data: { state: 'pending', attempts: 5 },
    });

    await dispatchPendingEvents(10);

    const stored = await prisma.notificationEvent.findUnique({ where: { id: event.eventId } });
    expect(stored?.state).toBe('pending');
    expect(stored?.attempts).toBe(5);
  });
});

describe('the centre of the notifications', () => {  it('shows a message only to the customer it belongs to', async () => {
    const { client, userId } = await registerAndLogin(app, 'mine@example.com');
    const { client: other } = await registerAndLogin(app, 'theirs@example.com');

    await publishEvent({
      type: 'invoice.issued',
      subject: 'BM-00001',
      userId,
      payload: { number: 'BM-00001', amount: '10.00 EUR', currency: 'EUR', dueAt: null },
    });
    await dispatchPendingEvents(10);

    const mine = await client.request('GET', '/api/notifications');
    const theirs = await other.request('GET', '/api/notifications');

    // The message of the customer is in the centre of the customer, and the
    // centre of the other customer holds nothing about it.
    const titles = (mine.body.notifications as Array<{ title: string }>).map((row) => row.title);
    expect(titles).toContain('The invoice BM-00001 was issued');
    const theirTitles = (theirs.body.notifications as Array<{ title: string }>).map((row) => row.title);
    expect(theirTitles).not.toContain('The invoice BM-00001 was issued');
  });

  it('refuses to read or to delete a message of another customer', async () => {
    const { client } = await registerAndLogin(app, 'owner@example.com');
    const { client: stranger } = await registerAndLogin(app, 'stranger@example.com');

    const published = await publishEvent({
      type: 'invoice.issued',
      subject: 'BM-00002',
      userId: (await prisma.user.findUnique({ where: { email: 'owner@example.com' } }))!.id,
      payload: { number: 'BM-00002', amount: '10.00 EUR', currency: 'EUR', dueAt: null },
    });
    await dispatchPendingEvents(10);

    const list = await client.request('GET', '/api/notifications');
    const row = (list.body.notifications as Array<{ id: string; title: string }>).find(
      (entry) => entry.title === 'The invoice BM-00002 was issued',
    );
    expect(row).toBeTruthy();
    const id = row!.id;

    const read = await stranger.request('POST', `/api/notifications/${id}/read`);
    const removed = await stranger.request('DELETE', `/api/notifications/${id}`);

    expect(read.status).toBe(404);
    expect(removed.status).toBe(404);
    expect(published.eventId).toBeTruthy();
  });
});

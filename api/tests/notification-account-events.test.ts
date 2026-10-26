import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import { dispatchPendingEvents } from '../src/services/notification-dispatch.js';

/**
 * The closing of an account.
 *
 * The customer asks for the closing of the account and the platform answers:
 * the request is recorded, the services keep running until the end of the
 * period that was paid for, and somebody of the team looks at it before
 * anything is closed. The customer is told that the request is recorded,
 * because an account that is closed without a word is an account that is
 * gone.
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

describe('the closing of an account is told to the customer', () => {
  it('tells the customer that the request is recorded', async () => {
    const { client, userId } = await registerAndLogin(app, 'closing@example.com');

    const answer = await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });
    expect(answer.status).toBe(200);

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'account.deletion_requested' },
    });
    expect(events).toHaveLength(1);
    expect(events[0]?.userId).toBe(userId);
    expect(events[0]?.payload).toEqual({ name: 'Test Customer' });

    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({
      where: { kind: 'account.deletion_requested' },
    });
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery.to).toBe('closing@example.com');
    }
  });

  it('sends the message even when the customer closed the group of the account', async () => {
    const { client, userId } = await registerAndLogin(app, 'closing-muted@example.com');

    // The group of the account protects the account itself, so the customer
    // cannot switch it off. The engine has to keep the message anyway.
    await prisma.notificationPreference.create({
      data: {
        userId,
        accountSecurity: false,
        emailChannel: false,
        inAppChannel: false,
      },
    });

    await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });
    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({
      where: { kind: 'account.deletion_requested' },
    });
    expect(deliveries.length).toBeGreaterThan(0);
  });

  it('tells the customer again when the request is asked again', async () => {
    const { client } = await registerAndLogin(app, 'closing-twice@example.com');

    await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });

    // The request can be taken back, and the customer can ask again. Every
    // request is a message of its own: the customer has to know that the
    // second request was recorded too.
    const takenBack = await client.request('DELETE', '/api/settings/account/closure');
    expect(takenBack.status).toBe(200);

    await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });

    const events = await prisma.notificationEvent.findMany({
      where: { type: 'account.deletion_requested' },
    });
    expect(events).toHaveLength(2);
  });
});

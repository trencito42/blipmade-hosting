import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/**
 * The queue of the support, when nobody of the staff may read it.
 *
 * The address of the operator is the inbox of the alarms of the platform. It
 * is the one that is told when a message of the queue has nobody to go to,
 * because a message that nobody reads is a message that is lost.
 *
 * The customer never receives a message about a message of his own, whoever
 * the recipient is.
 */

vi.mock('../src/env.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/env.js')>();
  return {
    ...actual,
    env: { ...actual.env, MAIL_OPERATOR_EMAIL: 'operator@blipmade.com', MAIL_SUPPORT_EMAIL: 'support@blipmade.com' },
  };
});

import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';
import { dispatchPendingEvents } from '../src/services/notification-dispatch.js';
import type { FastifyInstance } from 'fastify';

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

describe('the queue of the support without a staff member', () => {
  it('tells the operator, and never the customer', async () => {
    const { client } = await registerAndLogin(app, 'no-staff@example.com');
    const created = await client.request('POST', '/api/tickets', {
      subject: 'A question about the account',
      body: 'I cannot sign in any more.',
    });
    await client.request('POST', `/api/tickets/${created.body.ticket.id}/replies`, {
      body: 'I have tried again and it still fails.',
    });

    await dispatchPendingEvents(20);

    const deliveries = await prisma.mailDelivery.findMany({ where: { kind: 'ticket.customer_replied' } });
    expect(deliveries.length).toBeGreaterThan(0);
    for (const delivery of deliveries) {
      expect(delivery.to).toBe('operator@blipmade.com');
      expect(delivery.to).not.toBe('no-staff@example.com');
    }
  });
});

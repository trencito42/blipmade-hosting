import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { markOrderPaid } from '../src/services/stripe.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';

/**
 * The life of an order and the accounts of the platform.
 *
 * Three rules are checked here, because each of them was a way in:
 *
 *  - a cancelled or refunded order is dead: it cannot be sent to a checkout
 *    again, because the checkout would bring it back to life as a paid order
 *    with its infrastructure;
 *  - an order is paid the sum it was quoted, never another one;
 *  - the accounts of the platform are only acted on by an administrator, and
 *    that holds for the members of the staff as well.
 */

let app: FastifyInstance;

// The price of a server is the price of its resources, with the rate card of
// the platform: one gigabyte of memory, one processor and ten gigabytes of
// disk.
const MONTHLY = 250;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

/** A product with a price, so that an order has a sum. */
async function seedProduct() {
  return prisma.product.create({
    data: {
      slug: 'wordpress',
      name: 'WordPress',
      category: 'WEB_CMS',
      description: 'A website and blog platform.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 1024,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: {
        create: [{ period: 'MONTHLY', baseAmount: MONTHLY, ramPerGb: 0, cpuPerUnit: 0, diskPerGb: 0, currency: 'EUR' }],
      },
    },
  });
}

/** A member of the staff with the permissions that are asked for. */
async function createStaff(email: string, permissions: string[]) {
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
  if (response.status !== 200) {
    throw new Error(`Could not log the staff member in: ${response.status}`);
  }
  return { client, userId: user.id };
}

/** An order of a customer, and the client that owns it. */
async function placeOrder(email: string) {
  const { client } = await registerAndLogin(app, email);
  const response = await client.request('POST', '/api/orders', {
    items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
  });
  if (response.status !== 201) {
    throw new Error(`Could not place the order: ${response.status}`);
  }
  return { client, orderId: response.body.order.id as string };
}

/** The state of an order, as it is in the database. */
async function statusOf(orderId: string): Promise<string | undefined> {
  const order = await prisma.order.findUnique({ where: { id: orderId } });
  return order?.status;
}

describe('the life of an order', () => {
  it('does not send a cancelled order to a checkout again', async () => {
    await seedProduct();
    const { client, orderId } = await placeOrder('cancelled@example.com');

    const cancelled = await client.request('POST', `/api/orders/${orderId}/cancel`);
    expect(cancelled.status).toBe(204);
    expect(await statusOf(orderId)).toBe('CANCELLED');

    // The checkout would bring the dead order back to life: the payment that
    // follows would make it a paid order with its infrastructure.
    const checkout = await client.request('POST', `/api/orders/${orderId}/checkout`);
    expect(checkout.status).toBe(409);
    expect(await statusOf(orderId)).toBe('CANCELLED');
  });

  it('does not send a refunded order to a checkout again', async () => {
    await seedProduct();
    const { client, orderId } = await placeOrder('refunded@example.com');
    await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });

    const checkout = await client.request('POST', `/api/orders/${orderId}/checkout`);
    expect(checkout.status).toBe(409);
    expect(await statusOf(orderId)).toBe('REFUNDED');
  });

  it('keeps the trace of the refund when the order is cancelled', async () => {
    await seedProduct();
    const { client, orderId } = await placeOrder('traced@example.com');
    await prisma.order.update({ where: { id: orderId }, data: { status: 'REFUNDED' } });

    const cancelled = await client.request('POST', `/api/orders/${orderId}/cancel`);
    expect(cancelled.status).toBe(400);
    expect(await statusOf(orderId)).toBe('REFUNDED');
  });

  it('lets an order that failed be paid again', async () => {
    // The order that failed is not dead: a payment that failed can be tried
    // again, and that is the way back for the operator.
    await seedProduct();
    const { client, orderId } = await placeOrder('failed@example.com');
    await prisma.order.update({ where: { id: orderId }, data: { status: 'FAILED' } });

    const checkout = await client.request('POST', `/api/orders/${orderId}/checkout`);
    expect(checkout.status).toBe(200);
    expect(await statusOf(orderId)).toBe('AWAITING_PAYMENT');
  });

  it('pays the order the sum it was quoted', async () => {
    await seedProduct();
    const { orderId } = await placeOrder('quoted@example.com');

    await expect(markOrderPaid({ orderId, amount: 1 })).rejects.toThrow(/is not the 250 that was quoted/);
    expect(await statusOf(orderId)).not.toBe('PAID');

    await expect(markOrderPaid({ orderId, amount: MONTHLY })).resolves.toBeDefined();
    expect(await statusOf(orderId)).toBe('PAID');
  });

  it('tells the customer that the subscription started', async () => {
    await seedProduct();
    const { orderId } = await placeOrder('activated@example.com');

    await markOrderPaid({ orderId, amount: MONTHLY });

    // The subscription of the line started, so the customer is told, with the
    // name of the plan they bought.
    const event = await prisma.notificationEvent.findFirst({ where: { type: 'subscription.activated' } });
    expect(event).not.toBeNull();
    expect(event?.state).toBe('pending');
    expect(event?.payload).toMatchObject({ plan: 'WordPress' });
  });

  it('does not tell the customer twice when the same payment is reported twice', async () => {
    await seedProduct();
    const { orderId } = await placeOrder('twice@example.com');

    // The provider can report the same payment more than once. The customer
    // has to hear about it once.
    await markOrderPaid({ orderId, amount: MONTHLY });
    await markOrderPaid({ orderId, amount: MONTHLY });

    const events = await prisma.notificationEvent.count({ where: { type: 'subscription.activated' } });
    expect(events).toBe(1);
  });
});

describe('the accounts of the platform', () => {
  it('does not let a member of the staff suspend another member of the staff', async () => {
    const staff = await createStaff('staff@example.com', ['customers.write']);
    const other = await createStaff('other@example.com', []);

    const response = await staff.client.request('POST', `/api/admin/customers/${other.userId}/suspend`, {
      suspended: true,
    });
    expect(response.status).toBe(403);

    const user = await prisma.user.findUnique({ where: { id: other.userId } });
    expect(user?.suspendedAt).toBeNull();
  });

  it('lets an administrator suspend a member of the staff', async () => {
    const admin = await createAdmin(app);
    const other = await createStaff('other@example.com', []);

    const response = await admin.client.request('POST', `/api/admin/customers/${other.userId}/suspend`, {
      suspended: true,
    });
    expect(response.status).toBe(200);

    const user = await prisma.user.findUnique({ where: { id: other.userId } });
    expect(user?.suspendedAt).not.toBeNull();
  });

  it('does not let a member of the staff refund the order of an administrator', async () => {
    await seedProduct();
    const admin = await createAdmin(app);
    const staff = await createStaff('staff@example.com', ['orders.write']);

    const placed = await admin.client.request('POST', '/api/orders', {
      items: [{ productSlug: 'wordpress', ram: 1024, cpu: 1, disk: 10 }],
    });
    expect(placed.status).toBe(201);
    const orderId = placed.body.order.id as string;

    const response = await staff.client.request('POST', `/api/admin/orders/${orderId}/refund`, {
      reason: 'a reason that is long enough',
    });
    expect(response.status).toBe(403);
  });
});

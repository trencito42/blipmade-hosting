/**
 * The confirmation of a collection that arrived outside the provider.
 *
 * Confirming a collection marks the invoice as paid and extends the period of
 * the service, so it writes to the account of the customer. The rule that
 * protects the accounts of the platform was applied on the other six routes
 * that write to an account, and not on this one: a member of the staff could
 * confirm the invoice of an administrator and give that account a period of
 * service for free.
 */
import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

let app: FastifyInstance;

/** Creates a staff member with the given permissions and logs them in. */
async function createStaff(email: string, permissions: string[]): Promise<{ client: TestClient; userId: string }> {
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

/** Creates an invoice that waits for a collection. */
async function createOpenInvoice(userId: string, number: string) {
  return prisma.invoice.create({
    data: {
      number,
      userId,
      status: 'OPEN',
      amount: 2400,
      tax: 0,
      total: 2400,
      currency: 'EUR',
      periodStart: new Date(),
      periodEnd: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000),
    },
  });
}

describe('the confirmation of a collection', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('refuses to confirm the invoice of an administrator when the actor is not an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['orders.write']);
    const { userId: adminId } = await createAdmin(app, 'admin@blipmade.test');
    const invoice = await createOpenInvoice(adminId, 'INV-STAFF-1');

    const response = await staff.request('POST', `/api/admin/invoices/${invoice.id}/confirm-collection`, {
      reference: 'a transfer at the counter',
    });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');

    // The invoice of the administrator is still open.
    const after = await prisma.invoice.findUnique({ where: { id: invoice.id } });
    expect(after?.status).toBe('OPEN');
    expect(after?.paidAt).toBeNull();
  });

  it('confirms the invoice of a customer', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['orders.write']);
    const customer = await prisma.user.create({
      data: {
        email: 'buyer@blipmade.test',
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: 'CUSTOMER',
        firstName: 'Test',
        lastName: 'Buyer',
        emailVerifiedAt: new Date(),
      },
    });
    const invoice = await createOpenInvoice(customer.id, 'INV-CUSTOMER-1');

    const response = await staff.request('POST', `/api/admin/invoices/${invoice.id}/confirm-collection`, {
      reference: 'a transfer at the counter',
    });
    expect(response.status).toBe(200);
    expect(response.body.invoice.status).toBe('PAID');
  });
});

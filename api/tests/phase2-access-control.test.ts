import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The access control of the staff console.
 *
 * Three rules live in the server and not in the interface, because the
 * endpoints are called directly as well:
 *
 *  - the permission list of an account is its power inside the platform, so a
 *    staff member only hands out the permissions it holds itself and never
 *    changes its own list;
 *  - the account that administers the platform is only acted on by another
 *    administrator, so nobody can lock the platform out of its own
 *    administration;
 *  - the settings of the platform itself are not read and not written
 *    through the generic settings endpoints.
 */

vi.mock('../src/services/queue.js', async (importOriginal) => {
  const actual = await importOriginal<typeof import('../src/services/queue.js')>();
  return { ...actual, enqueueProvisioning: vi.fn(async () => undefined) };
});

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

/** The permissions that a staff member holds. */
async function permissionsOf(userId: string): Promise<string[]> {
  const member = await prisma.staffMember.findUnique({ where: { userId } });
  return member?.permissions ?? [];
}

/** A product, so a service can be created for an account. */
async function createProduct(slug: string) {
  return prisma.product.create({
    data: {
      slug,
      name: slug,
      category: 'BOTS',
      description: 'A product used by the access control test.',
      icon: 'bot',
      eggId: 1,
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      defaultRam: 512,
      defaultCpu: 1,
      defaultDisk: 10,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      visible: true,
      deployable: true,
    } as never,
  });
}

describe('the permission list of a staff member', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('refuses to grant a permission that the staff member does not hold', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    // The staff member holds one permission and hands out another one: that
    // is the way to an administrator in all but the name.
    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: ['customers.read'] });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    expect(response.body.error.message).toMatch(/hold/i);

    // The list of the target is the one it had.
    expect(await permissionsOf(targetId)).toEqual(['customers.read']);
  });

  it('refuses to change the permission list of the staff member itself', async () => {
    const { client: staff, userId: staffId } = await createStaff('staff@blipmade.test', ['staff.write']);

    const response = await staff.request('PUT', `/api/admin/staff/${staffId}`, {
      permissions: ['staff.write', 'settings.write'],
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    expect(response.body.error.message).toMatch(/your own/i);

    // The staff member kept the permissions it had.
    expect(await permissionsOf(staffId)).toEqual(['staff.write']);
  });

  it('lets a staff member grant a permission that it holds itself', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write', 'customers.read']);
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: ['customers.read'] });

    expect(response.status).toBe(200);
    expect(await permissionsOf(targetId)).toEqual(['customers.read']);
  });

  it('lets an administrator grant any permission', async () => {
    const { client: admin } = await createAdmin(app, 'admin@blipmade.test');
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    const response = await admin.request('PUT', `/api/admin/staff/${targetId}`, {
      permissions: ['customers.read', 'settings.write'],
    });

    expect(response.status).toBe(200);
    expect(await permissionsOf(targetId)).toEqual(['customers.read', 'settings.write']);
  });
});

describe('the account of an administrator', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('refuses to suspend an administrator when the actor is not an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['customers.write']);
    const { userId: adminId } = await createAdmin(app, 'admin@blipmade.test');

    const response = await staff.request('POST', `/api/admin/customers/${adminId}/suspend`, { suspended: true });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    expect(response.body.error.message).toMatch(/administrator/i);

    // The administrator was not suspended.
    const admin = await prisma.user.findUnique({ where: { id: adminId } });
    expect(admin?.suspendedAt).toBeNull();
  });

  it('lets an administrator suspend another administrator', async () => {
    const { client: admin } = await createAdmin(app, 'admin@blipmade.test');
    const { userId: otherAdminId } = await createAdmin(app, 'other-admin@blipmade.test');

    const response = await admin.request('POST', `/api/admin/customers/${otherAdminId}/suspend`, { suspended: true });

    expect(response.status).toBe(200);
    const other = await prisma.user.findUnique({ where: { id: otherAdminId } });
    expect(other?.suspendedAt).not.toBeNull();
  });

  it('refuses to forget the panel key of an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['services.write']);
    const { userId: adminId } = await createAdmin(app, 'admin@blipmade.test');

    const response = await staff.request('DELETE', `/api/admin/customers/${adminId}/panel/credential`);

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('refuses to store a panel key for an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['services.write']);
    const { userId: adminId } = await createAdmin(app, 'admin@blipmade.test');
    await prisma.user.update({ where: { id: adminId }, data: { pterodactylUserId: '77' } });

    const response = await staff.request('POST', `/api/admin/customers/${adminId}/panel/credential`, {
      token: 'panel-key-that-is-long-enough-for-the-test',
    });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('refuses to retry a service of an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['services.write']);
    const { userId: adminId } = await createAdmin(app, 'admin@blipmade.test');
    const product = await createProduct('phase2-service-product');
    const instance = await prisma.instance.create({
      data: {
        userId: adminId,
        productId: product.id,
        name: 'phase2-service',
        status: 'FAILED',
        ram: 512,
        cpu: 1,
        disk: 10,
        price: 500,
        currency: 'EUR',
      },
    });

    const response = await staff.request('POST', `/api/admin/instances/${instance.id}/retry`, { reason: 'test' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('lets a staff member act on the account of a customer', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['customers.write']);
    const customer = await prisma.user.create({
      data: {
        email: 'customer@blipmade.test',
        passwordHash: await hashPassword(VALID_PASSWORD),
        role: 'CUSTOMER',
        firstName: 'Test',
        lastName: 'Customer',
        emailVerifiedAt: new Date(),
      },
    });

    const response = await staff.request('POST', `/api/admin/customers/${customer.id}/suspend`, { suspended: true });

    expect(response.status).toBe(200);
    const suspended = await prisma.user.findUnique({ where: { id: customer.id } });
    expect(suspended?.suspendedAt).not.toBeNull();
  });
});

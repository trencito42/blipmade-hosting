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

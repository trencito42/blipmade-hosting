import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

/**
 * The staff editor.
 *
 * The role of an account decides what it may do, so the rule that only an
 * administrator gives that role away has to live in the server. The interface
 * can only show it, never be the place that knows it.
 */

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

describe('the staff editor', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
  });

  it('refuses to give the administrator role to an account when the actor is not an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { role: 'ADMIN' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    expect(response.body.error.message).toMatch(/administrator/i);

    // The account kept the role it had.
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    expect(target?.role).toBe('STAFF');
  });

  it('refuses to take the administrator role away when the actor is not an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
    const { client: admin } = await createAdmin(app, 'admin@blipmade.test');
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);
    await admin.request('PUT', `/api/admin/staff/${targetId}`, { role: 'ADMIN' });

    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { role: 'STAFF' });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    expect(target?.role).toBe('ADMIN');
  });

  it('gives the administrator role when the actor is an administrator', async () => {
    const { client: admin } = await createAdmin(app, 'admin@blipmade.test');
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    const response = await admin.request('PUT', `/api/admin/staff/${targetId}`, { role: 'ADMIN' });

    expect(response.status).toBe(200);
    const target = await prisma.user.findUnique({ where: { id: targetId } });
    expect(target?.role).toBe('ADMIN');

    const entry = await prisma.auditLog.findFirst({ where: { action: 'staff.role_updated', targetId } });
    expect(entry).not.toBeNull();
  });

  it('refuses to change the permissions of an administrator when the actor is not an administrator', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
    const { client: admin } = await createAdmin(app, 'admin@blipmade.test');
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);
    await admin.request('PUT', `/api/admin/staff/${targetId}`, { role: 'ADMIN' });

    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: ['customers.read'] });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
    const member = await prisma.staffMember.findUnique({ where: { userId: targetId } });
    expect(member?.permissions).toEqual(['customers.read']);
  });

  it('refuses to hand out the whole permission list to a staff member', async () => {
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write']);
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    // The whole list of permissions is the administrator role in all but name,
    // so a staff member may not hand it out. The list of the platform is read
    // from the module that holds it.
    const { PERMISSIONS } = await import('../src/lib/permissions.js');
    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: [...PERMISSIONS] });

    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');

    const member = await prisma.staffMember.findUnique({ where: { userId: targetId } });
    expect(member?.permissions).toEqual(['customers.read']);
  });

  it('lets a staff member with staff.write change the permissions of another staff member', async () => {
    // The staff member may only hand out the permissions that it holds
    // itself, so it holds the two permissions it hands out.
    const { client: staff } = await createStaff('staff@blipmade.test', ['staff.write', 'customers.read', 'tickets.read']);
    const { userId: targetId } = await createStaff('target@blipmade.test', ['customers.read']);

    const response = await staff.request('PUT', `/api/admin/staff/${targetId}`, { permissions: ['customers.read', 'tickets.read'] });

    expect(response.status).toBe(200);
    const member = await prisma.staffMember.findUnique({ where: { userId: targetId } });
    expect(member?.permissions).toEqual(['customers.read', 'tickets.read']);
  });
});

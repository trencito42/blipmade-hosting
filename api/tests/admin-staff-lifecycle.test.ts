import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashToken, randomToken } from '../src/lib/tokens.js';
import { closeApp, createAdmin, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;

async function stepUp(client: Awaited<ReturnType<typeof createAdmin>>['client']) {
  const response = await client.request('POST', '/api/admin/staff/step-up', { password: VALID_PASSWORD });
  expect(response.status).toBe(200);
}

describe('staff access lifecycle', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('promotes an existing customer without creating a second account and keeps their data', async () => {
    const { client, userId: adminId } = await createAdmin(app);
    const { userId } = await registerAndLogin(app, 'customer@blipmade.test');
    await prisma.customerNote.create({ data: { userId, body: 'kept' } });
    const before = await prisma.user.count();
    await stepUp(client);
    const response = await client.request('POST', '/api/admin/staff/members', { userId, role: 'STAFF' });
    expect(response.status).toBe(200);
    expect(response.body.staff.role).toBe('staff');
    expect(await prisma.user.count()).toBe(before);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.role).toBe('STAFF');
    expect(await prisma.staffMember.findUnique({ where: { userId } })).not.toBeNull();
    expect(await prisma.customerNote.findFirst({ where: { userId, body: 'kept' } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { actorId: adminId, action: 'staff.access_granted', targetId: userId } })).not.toBeNull();
  });

  it('refuses the grant without step-up, from a staff member, and without the CSRF header', async () => {
    const { client } = await createAdmin(app);
    const { userId } = await registerAndLogin(app, 'customer@blipmade.test');
    const missing = await client.request('POST', '/api/admin/staff/members', { userId, role: 'ADMIN' });
    expect(missing.status).toBe(403);
    expect(missing.body.error.code).toBe('step_up_required');
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.role).toBe('CUSTOMER');

    const { hashPassword } = await import('../src/lib/password.js');
    const staff = await prisma.user.create({
      data: { email: 'operator@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'Op', lastName: 'Erator', emailVerifiedAt: new Date() },
    });
    await prisma.staffMember.create({ data: { userId: staff.id, permissions: ['staff.read', 'staff.write'] } });
    const staffClient = makeClient(app);
    expect((await staffClient.request('POST', '/api/auth/login', { email: staff.email, password: VALID_PASSWORD })).status).toBe(200);
    await staffClient.request('POST', '/api/admin/staff/step-up', { password: VALID_PASSWORD });
    const escalated = await staffClient.request('POST', '/api/admin/staff/members', { userId, role: 'ADMIN' });
    expect(escalated.status).toBe(403);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.role).toBe('CUSTOMER');

    const bare = makeClient(app);
    await bare.request('POST', '/api/auth/login', { email: 'admin@blipmade.test', password: VALID_PASSWORD });
    const forged = await bare.request('POST', '/api/admin/staff/members', { userId, role: 'ADMIN' }, { withCsrf: false });
    expect(forged.status).toBe(403);
  });

  it('sends a single-use invitation without returning the token, and refuses an address that already has an account', async () => {
    const { client } = await createAdmin(app);
    await registerAndLogin(app, 'customer@blipmade.test');
    await stepUp(client);
    const duplicate = await client.request('POST', '/api/admin/staff/invitations', { email: 'customer@blipmade.test', role: 'STAFF' });
    expect(duplicate.status).toBe(409);
    expect(await prisma.user.count({ where: { email: 'customer@blipmade.test' } })).toBe(1);

    const created = await client.request('POST', '/api/admin/staff/invitations', { email: 'new-staff@blipmade.test', role: 'STAFF' });
    expect(created.status).toBe(200);
    expect(JSON.stringify(created.body)).not.toMatch(/token/i);
    const row = await prisma.staffInvitation.findFirst({ where: { email: 'new-staff@blipmade.test' } });
    expect(row?.usedAt).toBeNull();
    expect(row!.expiresAt.getTime()).toBeGreaterThan(Date.now() + 70 * 60 * 60 * 1000);
    const listed = await client.request('GET', '/api/admin/staff/invitations');
    expect(listed.body.invitations).toHaveLength(1);
    expect(JSON.stringify(listed.body)).not.toContain(row!.tokenHash);
  });

  it('accepts an invitation once and does not create a second user on a second use', async () => {
    const admin = await createAdmin(app);
    const token = randomToken();
    await prisma.staffInvitation.create({
      data: { email: 'invited@blipmade.test', role: 'STAFF', tokenHash: hashToken(token), expiresAt: new Date(Date.now() + 60_000), invitedById: admin.userId },
    });
    const guest = makeClient(app);
    const accepted = await guest.request('POST', '/api/auth/staff-invite/accept', {
      token, password: VALID_PASSWORD, firstName: 'New', lastName: 'Staff',
    });
    expect(accepted.status).toBe(200);
    expect(await prisma.user.count({ where: { email: 'invited@blipmade.test' } })).toBe(1);
    expect((await prisma.user.findUnique({ where: { email: 'invited@blipmade.test' } }))?.role).toBe('STAFF');
    const again = await guest.request('POST', '/api/auth/staff-invite/accept', {
      token, password: VALID_PASSWORD, firstName: 'New', lastName: 'Staff',
    });
    expect(again.status).toBe(400);
    expect(await prisma.user.count({ where: { email: 'invited@blipmade.test' } })).toBe(1);
  });

  it('removes staff access, keeps the customer record, and ends sessions and API keys', async () => {
    const { client } = await createAdmin(app);
    const { userId } = await registerAndLogin(app, 'customer@blipmade.test');
    await prisma.customerNote.create({ data: { userId, body: 'kept' } });
    await prisma.session.create({ data: { userId, tokenHash: hashToken('session-token'), expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.apiKey.create({ data: { userId, name: 'cli', prefix: 'bmk_test', hash: hashToken('key'), scope: 'write' } });
    await stepUp(client);
    expect((await client.request('POST', '/api/admin/staff/members', { userId, role: 'STAFF' })).status).toBe(200);
    const removed = await client.request('POST', `/api/admin/staff/${userId}/remove`);
    expect(removed.status).toBe(200);
    const user = await prisma.user.findUnique({ where: { id: userId } });
    expect(user?.role).toBe('CUSTOMER');
    expect(user?.email).toBe('customer@blipmade.test');
    expect(await prisma.staffMember.findUnique({ where: { userId } })).toBeNull();
    expect(await prisma.customerNote.findFirst({ where: { userId, body: 'kept' } })).not.toBeNull();
    expect(await prisma.session.count({ where: { userId } })).toBe(0);
    expect((await prisma.apiKey.findFirst({ where: { userId } }))?.revokedAt).not.toBeNull();
  });

  it('refuses to demote or remove the last active administrator and revokes a demoted administrator', async () => {
    const { client, userId } = await createAdmin(app);
    await stepUp(client);
    const demote = await client.request('PUT', `/api/admin/staff/${userId}`, { role: 'STAFF' });
    expect(demote.status).toBe(409);
    const remove = await client.request('POST', `/api/admin/staff/${userId}/remove`);
    expect(remove.status).toBe(409);
    expect((await prisma.user.findUnique({ where: { id: userId } }))?.role).toBe('ADMIN');

    const { hashPassword } = await import('../src/lib/password.js');
    const second = await prisma.user.create({
      data: { email: 'second@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'ADMIN', firstName: 'Second', lastName: 'Admin', emailVerifiedAt: new Date() },
    });
    await prisma.staffMember.create({ data: { userId: second.id, permissions: [] } });
    await prisma.session.create({ data: { userId: second.id, tokenHash: hashToken('admin-session'), expiresAt: new Date(Date.now() + 60_000) } });
    await prisma.apiKey.create({ data: { userId: second.id, name: 'cli', prefix: 'bmk_adm', hash: hashToken('admin-key'), scope: 'write' } });
    const changed = await client.request('PUT', `/api/admin/staff/${second.id}`, { role: 'STAFF' });
    expect(changed.status).toBe(200);
    expect((await prisma.user.findUnique({ where: { id: second.id } }))?.role).toBe('STAFF');
    expect(await prisma.staffMember.findUnique({ where: { userId: second.id } })).not.toBeNull();
    expect(await prisma.session.count({ where: { userId: second.id } })).toBe(0);
    expect((await prisma.apiKey.findFirst({ where: { userId: second.id } }))?.revokedAt).not.toBeNull();
  });
});

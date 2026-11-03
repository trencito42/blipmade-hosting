import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { encryptSecret } from '../src/lib/secrets.js';
import { currentStep, newSecret, totpAt } from '../src/lib/two-factor.js';
import { closeApp, createAdmin, getApp, resetDatabase, VALID_PASSWORD } from './helpers.js';

let app: FastifyInstance;

async function target() {
  const user = await prisma.user.create({ data: { email: 'target@blipmade.test', passwordHash: 'not-used', role: 'STAFF', firstName: 'Target', lastName: 'Staff', emailVerifiedAt: new Date() } });
  await prisma.staffMember.create({ data: { userId: user.id, permissions: ['customers.read'], title: 'Support' } });
  return user.id;
}

describe('staff role and permission step-up', () => {
  beforeAll(async () => { app = await getApp(); });
  afterAll(async () => { await closeApp(); });
  beforeEach(async () => { await resetDatabase(); });

  it('refuses a role or permission write without a fresh step-up and leaves the target unchanged', async () => {
    const { client } = await createAdmin(app);
    const userId = await target();
    const response = await client.request('PUT', `/api/admin/staff/${userId}`, { permissions: ['tickets.read'] });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('step_up_required');
    expect((await prisma.staffMember.findUnique({ where: { userId } }))?.permissions).toEqual(['customers.read']);
  });

  it('does not require step-up for a title-only update', async () => {
    const { client } = await createAdmin(app);
    const userId = await target();
    const response = await client.request('PUT', `/api/admin/staff/${userId}`, { title: 'Lead support' });
    expect(response.status).toBe(200);
  });

  it('rejects a wrong password without storing it in the audit log', async () => {
    const { client, userId } = await createAdmin(app);
    const response = await client.request('POST', '/api/admin/staff/step-up', { password: 'WrongPassword999' });
    expect(response.status).toBe(401);
    const entry = await prisma.auditLog.findFirst({ where: { actorId: userId, action: 'staff.step_up_failed' } });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry?.meta ?? {})).not.toContain('WrongPassword999');
  });

  it('accepts the current password for ten minutes and audits the confirmation and write', async () => {
    const { client, userId: actorId } = await createAdmin(app);
    const userId = await target();
    const confirmation = await client.request('POST', '/api/admin/staff/step-up', { password: VALID_PASSWORD });
    expect(confirmation.status).toBe(200);
    expect(new Date(confirmation.body.stepUpUntil).getTime()).toBeGreaterThan(Date.now() + 9 * 60 * 1000);
    const response = await client.request('PUT', `/api/admin/staff/${userId}`, { role: 'ADMIN' });
    expect(response.status).toBe(200);
    expect(await prisma.auditLog.findFirst({ where: { actorId, action: 'staff.step_up_confirmed' } })).not.toBeNull();
    expect(await prisma.auditLog.findFirst({ where: { actorId, action: 'staff.role_updated', targetId: userId } })).not.toBeNull();
  });

  it('refuses the write after the session step-up expires', async () => {
    const { client, userId: actorId } = await createAdmin(app);
    const userId = await target();
    await client.request('POST', '/api/admin/staff/step-up', { password: VALID_PASSWORD });
    await prisma.session.updateMany({ where: { userId: actorId }, data: { stepUpUntil: new Date(Date.now() - 1) } });
    const response = await client.request('PUT', `/api/admin/staff/${userId}`, { permissions: ['tickets.read'] });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('step_up_required');
  });

  it('accepts a current TOTP code once and never records it', async () => {
    const { client, userId: actorId } = await createAdmin(app);
    const secret = newSecret();
    const code = totpAt(secret, currentStep());
    await prisma.userTwoFactor.create({ data: { userId: actorId, secretEnc: encryptSecret(secret), enabledAt: new Date() } });
    const response = await client.request('POST', '/api/admin/staff/step-up', { code });
    expect(response.status).toBe(200);
    const entry = await prisma.auditLog.findFirst({ where: { actorId, action: 'staff.step_up_confirmed' } });
    expect(entry).not.toBeNull();
    expect(JSON.stringify(entry?.meta ?? {})).not.toContain(code);
  });
});

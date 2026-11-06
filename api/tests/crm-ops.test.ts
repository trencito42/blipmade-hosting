import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { dispatchCrmEvent, resumeWaitingAutomations } from '../src/services/crm-dispatch.js';
import { resolvePromotion } from '../src/services/pricing.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';

let app: FastifyInstance;
let admin: TestClient;
let passwordHash: string;

async function createStaff(email: string, permissions: string[]): Promise<TestClient> {
  const user = await prisma.user.create({
    data: {
      email,
      passwordHash,
      role: 'STAFF',
      firstName: 'Test',
      lastName: 'Staff',
      emailVerifiedAt: new Date(),
    },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  const login = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (login.status !== 200) throw new Error(`Could not log ${email} in`);
  return client;
}

async function seedAudience(): Promise<{ active: string[]; lead: string[] }> {
  const rows = Array.from({ length: 250 }, (_, index) => ({
    email: `crm${index}@blipmade.test`,
    passwordHash,
    firstName: 'Crm',
    lastName: `User${index}`,
    emailVerifiedAt: new Date(),
  }));
  await prisma.user.createMany({ data: rows });
  const users = await prisma.user.findMany({
    where: { email: { startsWith: 'crm' } },
    select: { id: true, email: true },
    orderBy: { email: 'asc' },
  });
  const active = users.slice(0, 220).map((row) => row.id);
  const lead = users.slice(220).map((row) => row.id);
  await prisma.customerFact.createMany({
    data: [
      ...active.map((userId) => ({ userId, key: 'core.lifecycle', value: 'active', source: 'test', classification: 'general' })),
      ...lead.map((userId) => ({ userId, key: 'core.lifecycle', value: 'lead', source: 'test', classification: 'general' })),
    ],
  });
  await prisma.notificationPreference.createMany({
    data: users.map((row, index) => ({ userId: row.id, marketing: index % 2 === 0 })),
  });
  return { active, lead };
}

describe('CRM operations', () => {
  beforeAll(async () => {
    passwordHash = await hashPassword(VALID_PASSWORD);
    app = await getApp();
  });
  afterAll(async () => {
    await closeApp();
  });
  beforeEach(async () => {
    await resetDatabase();
    const session = await createAdmin(app);
    admin = session.client;
  });

  it('counts nested segments past 200, refuses empty filters, and queues mixed consent without sending', async () => {
    const { active } = await seedAudience();
    const empty = await admin.request('POST', '/api/admin/crm/segments', { name: 'Empty', filter: {} });
    expect(empty.status).toBe(400);
    const created = await admin.request('POST', '/api/admin/crm/segments', {
      name: 'Active nested',
      filter: {
        op: 'and',
        children: [
          { fact: 'core.lifecycle', cmp: 'eq', value: 'active' },
          { op: 'or', children: [{ fact: 'core.lifecycle', cmp: 'neq', value: 'lead' }] },
        ],
      },
    });
    expect(created.status).toBe(200);
    const preview = await admin.request('POST', `/api/admin/crm/segments/${created.body.segment.id}/preview`, {});
    expect(preview.body.count).toBe(220);

    const campaign = await admin.request('POST', '/api/admin/crm/campaigns', {
      name: 'Spring',
      body: 'Hello {{firstName}}',
      segmentId: created.body.segment.id,
      channel: 'email',
    });
    expect(campaign.status).toBe(200);
    await admin.request('POST', `/api/admin/crm/campaigns/${campaign.body.campaign.id}/submit`, {});
    const approved = await admin.request('POST', `/api/admin/crm/campaigns/${campaign.body.campaign.id}/approve`, {});
    expect(approved.status).toBe(200);
    const queued = await admin.request('POST', `/api/admin/crm/campaigns/${campaign.body.campaign.id}/queue`, {});
    expect(queued.status).toBe(200);
    expect(queued.body.delivery).toBe(false);
    expect(queued.body.planned + queued.body.skipped).toBeGreaterThan(0);
    const sends = await prisma.campaignSend.findMany({ where: { campaignId: campaign.body.campaign.id } });
    expect(sends.some((row) => row.status === 'sent')).toBe(false);
    expect(sends.some((row) => row.status === 'planned' && row.consent)).toBe(true);
    expect(sends.some((row) => row.status === 'skipped' && !row.consent)).toBe(true);

    const csv = await admin.request('GET', `/api/admin/crm/export/segment/${created.body.segment.id}?format=csv`);
    expect(csv.status).toBe(200);
    expect(String(csv.body)).toMatch(/^id,email,created_at,tags/);

    const task = await admin.request('POST', '/api/admin/crm/tasks', { userId: active[0], title: 'Call back' });
    expect(task.status).toBe(200);
    const growth = await admin.request('GET', `/api/admin/customers/${active[0]}/crm`);
    expect(growth.status).toBe(200);
    expect(growth.body.tasks.some((row: { title: string }) => row.title === 'Call back')).toBe(true);
  });

  it('dispatches a real registration, resumes waits, and ignores duplicate events', async () => {
    const graphWait = {
      start: 'w',
      nodes: [
        { id: 'w', type: 'wait', ms: 1 },
        { id: 'tag', type: 'tag', add: ['waited'] },
      ],
      edges: [{ from: 'w', to: 'tag' }],
    };
    const waitAuto = await admin.request('POST', '/api/admin/crm/automations', {
      name: 'Wait then tag',
      trigger: 'registration',
      graph: graphWait,
    });
    expect(waitAuto.status).toBe(200);
    await admin.request('POST', `/api/admin/crm/automations/${waitAuto.body.automation.id}/activate`, {});

    const cycle = await admin.request('POST', '/api/admin/crm/automations', {
      name: 'Cycle',
      trigger: 'ticket_opened',
      graph: { start: 'a', nodes: [{ id: 'a', type: 'wait', ms: 10 }], edges: [{ from: 'a', to: 'a' }] },
    });
    expect(cycle.status).toBe(400);

    const register = await makeClient(app).request('POST', '/api/auth/register', {
      email: 'crm-event@blipmade.test',
      password: VALID_PASSWORD,
      firstName: 'Event',
      lastName: 'Customer',
    });
    expect(register.status).toBe(201);
    const userId = register.body.user.id as string;
    await new Promise((resolve) => setTimeout(resolve, 80));
    let run = await prisma.automationRun.findFirst({ where: { userId, automationId: waitAuto.body.automation.id } });
    for (let attempt = 0; attempt < 20 && !run; attempt += 1) {
      await new Promise((resolve) => setTimeout(resolve, 50));
      run = await prisma.automationRun.findFirst({ where: { userId, automationId: waitAuto.body.automation.id } });
    }
    expect(run).toBeTruthy();
    await prisma.automationRun.update({ where: { id: run!.id }, data: { waitUntil: new Date(Date.now() - 1000) } });
    expect(await resumeWaitingAutomations()).toBeGreaterThan(0);
    const tagged = await prisma.user.findUnique({ where: { id: userId }, select: { tags: true } });
    expect(tagged?.tags).toContain('waited');
    const again = await prisma.user.findUnique({ where: { id: userId }, select: { tags: true } });
    await dispatchCrmEvent({ trigger: 'registration', userId, eventId: `registration:${userId}` });
    expect((await prisma.user.findUnique({ where: { id: userId }, select: { tags: true } }))?.tags.filter((tag) => tag === 'waited').length).toBe(1);
    void again;

    await admin.request('POST', `/api/admin/crm/automations/${waitAuto.body.automation.id}/pause`, {});
    const cancelled = await admin.request('POST', `/api/admin/crm/automations/${waitAuto.body.automation.id}/cancel-runs`, {});
    expect(cancelled.status).toBe(200);
  });

  it('keeps risk off customers.read and matches analytics to the database', async () => {
    const staff = await createStaff('crm-staff@blipmade.test', ['customers.read', 'customers.write']);
    const customer = await prisma.user.create({
      data: { email: 'risk-subject@blipmade.test', passwordHash, firstName: 'Risk', lastName: 'Subject', emailVerifiedAt: new Date() },
    });
    expect((await staff.request('GET', `/api/admin/customers/${customer.id}/risk`)).status).toBe(403);
    expect((await staff.request('GET', '/api/admin/crm/risk')).status).toBe(403);
    expect((await admin.request('GET', `/api/admin/customers/${customer.id}/risk`)).status).toBe(200);

    await prisma.payment.createMany({
      data: [
        { userId: customer.id, amount: 1000, status: 'SUCCEEDED' },
        { userId: customer.id, amount: 400, status: 'SUCCEEDED' },
        { userId: customer.id, amount: 200, status: 'REFUNDED' },
      ],
    });
    await prisma.invoice.create({
      data: { userId: customer.id, number: 'INV-CRM-1', amount: 1000, tax: 50, total: 1050, status: 'PAID', paidAt: new Date() },
    });
    await prisma.subscription.create({
      data: { userId: customer.id, amount: 1200, status: 'ACTIVE' },
    });
    const analytics = await admin.request('GET', '/api/admin/crm/analytics');
    expect(analytics.status).toBe(200);
    expect(analytics.body.period.collectedCents).toBe(1400);
    expect(analytics.body.period.refundedCents).toBe(200);
    expect(analytics.body.period.taxCents).toBe(50);
    expect(analytics.body.snapshot.mrrCents).toBe(1200);

    await prisma.promotion.create({
      data: { code: 'FAMONLY', type: 'PERCENT', value: 10, familySlug: 'minecraft', active: true },
    });
    const missing = await resolvePromotion('FAMONLY', customer.id, { productSlugs: [] });
    expect(missing.valid).toBe(false);
    const unknown = await resolvePromotion('FAMONLY', customer.id, { productSlugs: ['no-such-product'] });
    expect(unknown.valid).toBe(false);
  });
});

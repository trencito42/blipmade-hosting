import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';
import {
  allowedActions,
  canTransition,
  filterStates,
  isStatusFilter,
  normalizeState,
  refusal,
  requiresReason,
  stateLabel,
  storedStates,
} from '../src/services/abuse-lifecycle.js';

/**
 * The life of a report of abuse.
 *
 * The rules of the case are checked twice: once on their own, because they are
 * the rules of the platform, and once through the server, because the server
 * is where they are enforced.
 */

const panel = vi.hoisted(() => ({
  calls: [] as { method: string; path: string }[],
  fail: false,
}));

vi.mock('../src/services/pterodactyl/application.js', async () => {
  const actual = await vi.importActual<typeof import('../src/services/pterodactyl/application.js')>(
    '../src/services/pterodactyl/application.js',
  );
  return {
    ...actual,
    applicationRequest: vi.fn(async (method: string, path: string) => {
      panel.calls.push({ method, path });
      if (panel.fail) throw new Error('The panel refused the request.');
      return {} as never;
    }),
  };
});

let app: FastifyInstance;

/** A member of the staff with the permissions of the test. */
async function createStaff(email: string, permissions: string[]): Promise<TestClient> {
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
  return client;
}

/** A report of abuse, as it comes from the public form. */
async function makeReport(overrides: Record<string, unknown> = {}) {
  return prisma.abuseReport.create({
    data: {
      reporterName: 'A concerned person',
      reporterEmail: 'reporter@example.com',
      category: 'spam',
      target: 'spammer.example',
      details: 'The host sends mail to everybody, every hour of the day.',
      status: 'open',
      ...overrides,
    },
  });
}

/** A service of the platform, with a customer of its own. */
async function makeService(ownerId: string, name = 'mail.example') {
  const product = await prisma.product.create({
    data: {
      slug: `product-${Math.random().toString(36).slice(2, 8)}`,
      name: 'Test product',
      category: 'WEB_CMS',
      description: 'A product used only by the tests.',
      icon: 'globe',
      minRam: 512,
      minCpu: 1,
      minDisk: 5,
      maxRam: 8192,
      maxCpu: 4,
      maxDisk: 100,
      deployable: true,
      eggId: 1,
      prices: { create: { period: 'MONTHLY', baseAmount: 149, currency: 'EUR' } },
    },
  });
  return prisma.instance.create({
    data: {
      userId: ownerId,
      productId: product.id,
      name,
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylServerId: 100,
      pterodactylUuid: `server-${Math.random().toString(36).slice(2, 8)}`,
    },
  });
}

describe('the rules of a report of abuse', () => {
  it('reads the historical state of a closed case as resolved', () => {
    expect(normalizeState('action_taken')).toBe('resolved');
    expect(normalizeState('resolved')).toBe('resolved');
    expect(normalizeState('dismissed')).toBe('dismissed');
    expect(normalizeState('investigating')).toBe('investigating');
    expect(normalizeState('open')).toBe('open');
    // A state nobody knows is read as open, so a case is never stuck.
    expect(normalizeState('something_else')).toBe('open');
    expect(normalizeState(null)).toBe('open');
    expect(stateLabel('resolved')).toBe('Resolved');
  });

  it('finds the historical cases when the list is filtered on resolved', () => {
    expect(storedStates('resolved')).toEqual(['resolved', 'action_taken']);
    expect(storedStates('open')).toEqual(['open']);
  });

  it('lets a case move the way the rules say', () => {
    expect(canTransition('open', 'investigating')).toBe(true);
    expect(canTransition('open', 'resolved')).toBe(true);
    expect(canTransition('open', 'dismissed')).toBe(true);
    expect(canTransition('investigating', 'resolved')).toBe(true);
    expect(canTransition('investigating', 'dismissed')).toBe(true);
    // A closed case only comes back through a reopen.
    expect(canTransition('resolved', 'investigating')).toBe(true);
    expect(canTransition('dismissed', 'investigating')).toBe(true);
    // A case never goes back to open, and a closed case never closes again.
    expect(canTransition('resolved', 'open')).toBe(false);
    expect(canTransition('dismissed', 'dismissed')).toBe(false);
    expect(canTransition('investigating', 'open')).toBe(false);
  });

  it('offers the actions of the state the case is in', () => {
    expect(allowedActions('open', { canSuspend: true, hasService: true })).toEqual([
      'investigating',
      'resolve',
      'dismiss',
      'suspend',
    ]);
    expect(allowedActions('investigating', { canSuspend: true, hasService: true })).toEqual([
      'resolve',
      'dismiss',
      'suspend',
    ]);
    // A closed case is read-only: only a reopen is left.
    expect(allowedActions('resolved')).toEqual(['reopen']);
    expect(allowedActions('dismissed')).toEqual(['reopen']);
    // The suspension needs the permission and a service to suspend.
    expect(allowedActions('open', { canSuspend: false, hasService: true })).not.toContain('suspend');
    expect(allowedActions('open', { canSuspend: true, hasService: false })).not.toContain('suspend');
  });

  it('asks for a reason when the case is closed, reopened or enforced', () => {
    expect(requiresReason('resolve')).toBe(true);
    expect(requiresReason('dismiss')).toBe(true);
    expect(requiresReason('reopen')).toBe(true);
    expect(requiresReason('suspend')).toBe(true);
    expect(requiresReason('investigating')).toBe(false);
  });

  it('says why an action is refused', () => {
    expect(refusal('dismissed', 'suspend')).toMatch(/dismissed/i);
    expect(refusal('dismissed', 'resolve')).toMatch(/reopened/i);
    expect(refusal('resolved', 'dismiss')).toMatch(/closed/i);
  });

  it('knows the filters of the list', () => {
    expect(isStatusFilter('active')).toBe(true);
    expect(isStatusFilter('all')).toBe(true);
    expect(isStatusFilter('nonsense')).toBe(false);
    expect(filterStates('active')).toEqual(['open', 'investigating']);
    expect(filterStates('resolved')).toEqual(['resolved']);
    expect(filterStates('all')).toBeNull();
  });
});

describe('the server holds the rules of the case', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    // The reports of abuse are not emptied by the reset of the suite, so this
    // file leaves the database as it found it.
    await prisma.abuseReport.deleteMany({});
    await closeApp();
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.abuseReport.deleteMany({});
    panel.calls.length = 0;
    panel.fail = false;
  });

  it('starts an investigation from an open report and writes it into the journal', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport();

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, { action: 'investigating' });

    expect(response.status).toBe(200);
    expect(response.body.report.status).toBe('investigating');
    expect(response.body.report.statusLabel).toBe('Investigating');

    const entry = await prisma.auditLog.findFirst({ where: { action: 'admin.abuse.investigating', targetId: report.id } });
    expect(entry).not.toBeNull();
    expect(entry?.actorEmail).toBe('admin@blipmade.test');
  });

  it('closes a report with an explanation', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'investigating' });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'resolve',
      reason: 'The customer was told and the host stopped the mail.',
    });

    expect(response.status).toBe(200);
    expect(response.body.report.status).toBe('resolved');
    expect(response.body.report.resolution).toMatch(/stopped the mail/);
    expect(response.body.report.resolvedAt).toBeTruthy();
    const entry = await prisma.auditLog.findFirst({ where: { action: 'admin.abuse.resolved', targetId: report.id } });
    expect(entry).not.toBeNull();
  });

  it('refuses to close a report without an explanation', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'investigating' });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, { action: 'resolve' });

    expect(response.status).toBe(400);
    const row = await prisma.abuseReport.findUnique({ where: { id: report.id } });
    expect(row?.status).toBe('investigating');
  });

  it('refuses an action that the state of the case does not allow', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'resolved', resolution: 'The report was closed.' });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'dismiss',
      reason: 'It was not abuse after all.',
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
    const row = await prisma.abuseReport.findUnique({ where: { id: report.id } });
    expect(row?.status).toBe('resolved');
  });

  it('closes a dismissed report for good: nothing but a reopen is left', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'dismissed', resolution: 'The report was about another platform.' });

    for (const action of ['investigating', 'resolve', 'dismiss']) {
      const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
        action,
        reason: 'Something else happened.',
      });
      expect(response.status).toBe(409);
      expect(response.body.error.code).toBe('conflict');
    }

    // The details, the evidence and the text of the dismissal are kept.
    const row = await prisma.abuseReport.findUnique({ where: { id: report.id } });
    expect(row?.status).toBe('dismissed');
    expect(row?.details).toMatch(/sends mail/);
    expect(row?.resolution).toMatch(/another platform/);
  });

  it('reopens a closed case with a reason', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'dismissed', resolution: 'The report was about another platform.' });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'reopen',
      reason: 'The reporter wrote again: the host is on this platform.',
    });

    expect(response.status).toBe(200);
    expect(response.body.report.status).toBe('investigating');
    expect(response.body.report.reopenedAt).toBeTruthy();
    expect(response.body.report.resolvedAt).toBeNull();
    const entry = await prisma.auditLog.findFirst({ where: { action: 'admin.abuse.reopened', targetId: report.id } });
    expect(entry).not.toBeNull();
  });

  it('refuses a reopen without a reason', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const report = await makeReport({ status: 'resolved' });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, { action: 'reopen' });

    expect(response.status).toBe(400);
  });

  it('refuses the actions to a staff member without the permission', async () => {
    const client = await createStaff('reader@blipmade.test', ['services.read']);
    const report = await makeReport();

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, { action: 'investigating' });

    expect(response.status).toBe(403);
  });
});

describe('the suspension of a service from a report', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await prisma.abuseReport.deleteMany({});
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.abuseReport.deleteMany({});
    panel.calls.length = 0;
    panel.fail = false;
  });

  it('never suspends through a dismissed report', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ status: 'dismissed', instanceId: service.id });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail.',
      confirmService: service.name,
    });

    expect(response.status).toBe(409);
    expect(response.body.error.code).toBe('conflict');
    expect(panel.calls).toHaveLength(0);
    const instance = await prisma.instance.findUnique({ where: { id: service.id } });
    expect(instance?.status).toBe('ONLINE');
  });

  it('never suspends through a closed report', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ status: 'resolved', instanceId: service.id });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail.',
      confirmService: service.name,
    });

    expect(response.status).toBe(409);
    expect(panel.calls).toHaveLength(0);
  });

  it('asks for the name of the service before it suspends anything', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ instanceId: service.id });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail.',
      confirmService: 'another service',
    });

    expect(response.status).toBe(400);
    expect(panel.calls).toHaveLength(0);
    const instance = await prisma.instance.findUnique({ where: { id: service.id } });
    expect(instance?.status).toBe('ONLINE');
  });

  it('asks for a reason before it suspends anything', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ instanceId: service.id });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      confirmService: service.name,
    });

    expect(response.status).toBe(400);
    expect(panel.calls).toHaveLength(0);
  });

  it('suspends the service once, and the case stays where it is', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ status: 'investigating', instanceId: service.id });

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail to everybody.',
      confirmService: service.name,
    });

    expect(response.status).toBe(200);
    expect(panel.calls).toHaveLength(1);
    expect(panel.calls[0]!.method).toBe('POST');
    expect(panel.calls[0]!.path).toContain('/suspend');

    // The service is suspended.
    const instance = await prisma.instance.findUnique({ where: { id: service.id } });
    expect(instance?.status).toBe('SUSPENDED');

    // The enforcement is a fact of its own, and the case is still the case.
    const row = await prisma.abuseReport.findUnique({ where: { id: report.id } });
    expect(row?.enforcement).toBe('service_suspended');
    expect(row?.enforcementAt).toBeTruthy();
    expect(row?.enforcedBy).toBe('admin@blipmade.test');
    expect(row?.status).toBe('investigating');

    const entry = await prisma.auditLog.findFirst({ where: { action: 'admin.abuse.service_suspended', targetId: report.id } });
    expect(entry).not.toBeNull();
  });

  it('does not suspend twice when the request is replayed', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ instanceId: service.id });

    const first = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail to everybody.',
      confirmService: service.name,
    });
    expect(first.status).toBe(200);

    const second = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail to everybody.',
      confirmService: service.name,
    });

    expect(second.status).toBe(409);
    expect(second.body.error.code).toBe('conflict');
    expect(panel.calls).toHaveLength(1);
  });

  it('lets only one of two requests at the same time win', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ instanceId: service.id });

    const answers = await Promise.all([
      client.request('POST', `/api/admin/abuse/${report.id}/action`, {
        action: 'suspend',
        reason: 'The host keeps sending mail to everybody.',
        confirmService: service.name,
      }),
      client.request('POST', `/api/admin/abuse/${report.id}/action`, {
        action: 'suspend',
        reason: 'The host keeps sending mail to everybody.',
        confirmService: service.name,
      }),
    ]);

    const codes = answers.map((answer) => answer.status).sort();
    expect(codes).toEqual([200, 409]);
    expect(panel.calls).toHaveLength(1);
  });

  it('suspends nothing when the panel refuses', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId);
    const report = await makeReport({ instanceId: service.id });
    panel.fail = true;

    const response = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail to everybody.',
      confirmService: service.name,
    });

    expect(response.status).toBe(400);
    expect(response.body.error.message).toMatch(/panel refused/i);

    // The service is not suspended and the case is not marked as taken.
    const instance = await prisma.instance.findUnique({ where: { id: service.id } });
    expect(instance?.status).toBe('ONLINE');
    const row = await prisma.abuseReport.findUnique({ where: { id: report.id } });
    expect(row?.enforcement).toBeNull();
    expect(row?.status).toBe('open');

    // The request can be made again.
    panel.fail = false;
    const again = await client.request('POST', `/api/admin/abuse/${report.id}/action`, {
      action: 'suspend',
      reason: 'The host keeps sending mail to everybody.',
      confirmService: service.name,
    });
    expect(again.status).toBe(200);
  });
});

describe('reading the reports of abuse', () => {
  beforeAll(async () => {
    app = await getApp();
  });

  afterAll(async () => {
    await prisma.abuseReport.deleteMany({});
  });

  beforeEach(async () => {
    await resetDatabase();
    await prisma.abuseReport.deleteMany({});
  });

  it('shows the queue that is still open, and the closed cases apart', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    await makeReport({ target: 'open.example', status: 'open' });
    await makeReport({ target: 'busy.example', status: 'investigating' });
    await makeReport({ target: 'done.example', status: 'resolved', resolution: 'It was handled.' });
    await makeReport({ target: 'other.example', status: 'dismissed', resolution: 'It was not abuse.' });

    const active = await client.request('GET', '/api/admin/abuse?status=active');
    expect(active.status).toBe(200);
    expect(active.body.total).toBe(2);
    expect(active.body.reports.map((report: { target: string }) => report.target).sort()).toEqual(['busy.example', 'open.example']);

    const dismissed = await client.request('GET', '/api/admin/abuse?status=dismissed');
    expect(dismissed.body.total).toBe(1);

    const all = await client.request('GET', '/api/admin/abuse?status=all');
    expect(all.body.total).toBe(4);
  });

  it('reads the historical cases as closed ones', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    await makeReport({ target: 'old.example', status: 'action_taken', resolution: 'The service was suspended.' });

    const list = await client.request('GET', '/api/admin/abuse?status=resolved');
    expect(list.body.total).toBe(1);
    expect(list.body.reports[0].status).toBe('resolved');
    expect(list.body.reports[0].statusLabel).toBe('Resolved');
    expect(list.body.reports[0].resolution).toMatch(/suspended/);
  });

  it('reads the list in pages and says how many reports there are', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    for (let index = 0; index < 5; index += 1) await makeReport({ target: `host-${index}.example` });

    const first = await client.request('GET', '/api/admin/abuse?status=all&page=1&pageSize=2');
    expect(first.status).toBe(200);
    expect(first.body.reports).toHaveLength(2);
    expect(first.body.total).toBe(5);
    expect(first.body.page).toBe(1);
    expect(first.body.pageSize).toBe(2);
    expect(first.body.pages).toBe(3);

    const last = await client.request('GET', '/api/admin/abuse?status=all&page=3&pageSize=2');
    expect(last.body.reports).toHaveLength(1);
  });

  it('finds a closed case again with the search', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    await makeReport({ target: 'archived.example', status: 'dismissed', resolution: 'It was another platform.' });
    await makeReport({ target: 'fresh.example', status: 'open' });

    const found = await client.request('GET', '/api/admin/abuse?status=all&q=archived');
    expect(found.body.total).toBe(1);
    expect(found.body.reports[0].target).toBe('archived.example');
  });

  it('refuses a filter the list does not know', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const response = await client.request('GET', '/api/admin/abuse?status=nonsense');
    expect(response.status).toBe(400);
  });

  it('gives one report with its service, its notes and its trail', async () => {
    const { client, userId } = await createAdmin(app, 'admin@blipmade.test');
    const service = await makeService(userId, 'mail.example');
    const report = await makeReport({ instanceId: service.id, evidenceUrl: 'https://example.com/evidence' });

    await client.request('POST', `/api/admin/abuse/${report.id}/action`, { action: 'investigating' });
    await client.request('POST', `/api/admin/abuse/${report.id}/notes`, { body: 'The customer was told about the mail.' });

    const detail = await client.request('GET', `/api/admin/abuse/${report.id}`);
    expect(detail.status).toBe(200);
    expect(detail.body.report.id).toBe(report.id);
    expect(detail.body.report.evidenceUrl).toBe('https://example.com/evidence');
    expect(detail.body.service.name).toBe('mail.example');
    expect(detail.body.service.customer.email).toBe('admin@blipmade.test');
    expect(detail.body.notes).toHaveLength(1);
    expect(detail.body.notes[0].body).toMatch(/customer was told/);
    expect(detail.body.activity.length).toBeGreaterThan(0);
    expect(detail.body.related).toEqual([]);
  });

  it('answers that a report it does not know is not found', async () => {
    const { client } = await createAdmin(app, 'admin@blipmade.test');
    const response = await client.request('GET', '/api/admin/abuse/does-not-exist');
    expect(response.status).toBe(404);
  });
});

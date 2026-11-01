import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance } from 'fastify';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, createAdmin, getApp, makeClient, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { TestClient } from './helpers.js';
import { settingControlMap, settingPolicy } from '../src/services/setting-registry.js';

/**
 * The registry of the settings.
 *
 * `settings.write` used to be the permission to write every key of the table,
 * the rate card, the security rules of the staff and the capacity of the nodes
 * included. These tests hold the rule that every key has one owner.
 */

let app: FastifyInstance;

async function createStaff(email: string, permissions: string[]): Promise<TestClient> {
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(VALID_PASSWORD), role: 'STAFF', firstName: 'Test', lastName: 'Staff', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions } });
  const client = makeClient(app);
  const response = await client.request('POST', '/api/auth/login', { email, password: VALID_PASSWORD });
  if (response.status !== 200) throw new Error(`Could not log ${email} in: ${response.status}`);
  return client;
}

const stored = async (key: string) => (await prisma.setting.findUnique({ where: { key } }))?.value ?? null;

describe('the registry of the settings', () => {
  beforeAll(async () => {
    app = await getApp();
  });
  afterAll(async () => {
    await closeApp();
  });
  beforeEach(async () => {
    await resetDatabase();
  });

  it('keeps settings.write away from the rate card', async () => {
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    const response = await staff.request('PUT', '/api/admin/settings', { pricing_resources: { ramCentsPerGb: 1 } });
    expect(response.status).toBe(403);
    expect(response.body.error.message).toMatch(/PUT \/admin\/pricing/);
    expect(await stored('pricing_resources')).toBeNull();
  });

  it('refuses the rate card even for an administrator, because the dedicated endpoint owns it', async () => {
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('PUT', '/api/admin/settings', { pricing_resources: { ramCentsPerGb: 1 } });
    expect(response.status).toBe(403);
    expect(await stored('pricing_resources')).toBeNull();
  });

  it('keeps settings.write away from the security rules of the staff', async () => {
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    for (const key of ['security.staff_2fa_required', 'security.admin_ip_allowlist']) {
      const response = await staff.request('PUT', '/api/admin/settings', { [key]: key.endsWith('required') ? false : [] });
      expect(response.status).toBe(403);
      expect(await stored(key)).toBeNull();
    }
  });

  it('refuses a key that nobody registered', async () => {
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('PUT', '/api/admin/settings', { 'made.up.key': 'x' });
    expect(response.status).toBe(403);
    expect(await stored('made.up.key')).toBeNull();
  });

  it('refuses the counters and the retention record to everyone', async () => {
    const { client: admin } = await createAdmin(app);
    await prisma.setting.create({ data: { key: 'internal.order.sequence', value: { last: 7 } } });
    await prisma.setting.create({ data: { key: 'cancelled_instance_retention', value: { secret: 'export' } } });
    for (const key of ['internal.order.sequence', 'internal.anything', 'cancelled_instance_retention']) {
      expect((await admin.request('PUT', '/api/admin/settings', { [key]: 1 })).status).toBe(403);
      expect((await admin.request('DELETE', `/api/admin/settings/${key}`)).status).toBe(403);
    }
    expect(await stored('internal.order.sequence')).toEqual({ last: 7 });
    const listing = await admin.request('GET', '/api/admin/settings');
    expect(Object.keys(listing.body.settings)).not.toContain('internal.order.sequence');
    expect(Object.keys(listing.body.settings)).not.toContain('cancelled_instance_retention');
  });

  it('lets settings.write change the text of the company and writes an audit entry', async () => {
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    const response = await staff.request('PUT', '/api/admin/settings', { 'billing.company_name': '  Blipmade SRL ' });
    expect(response.status).toBe(200);
    expect(await stored('billing.company_name')).toBe('Blipmade SRL');
    const entry = await prisma.auditLog.findFirst({ where: { action: 'settings.updated' } });
    expect((entry?.meta as { keys: string[] }).keys).toEqual(['billing.company_name']);
  });

  it('needs pricing.write to change the tax rate, and accepts it unchanged', async () => {
    await prisma.setting.create({ data: { key: 'billing.tax_rate', value: '21' } });
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    const refused = await staff.request('PUT', '/api/admin/settings', { 'billing.tax_rate': '5' });
    expect(refused.status).toBe(403);
    expect(await stored('billing.tax_rate')).toBe('21');

    // The page sends the whole group back, so a value that did not change is not a change.
    const same = await staff.request('PUT', '/api/admin/settings', { 'billing.tax_rate': '21', 'billing.tax_id': 'RO1' });
    expect(same.status).toBe(200);
    expect(await stored('billing.tax_id')).toBe('RO1');

    const owner = await createStaff('pricer@blipmade.test', ['settings.read', 'settings.write', 'pricing.write']);
    expect((await owner.request('PUT', '/api/admin/settings', { 'billing.tax_rate': '5' })).status).toBe(200);
    expect(await stored('billing.tax_rate')).toBe('5');
  });

  it('writes nothing when one key of the request is refused', async () => {
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    const response = await staff.request('PUT', '/api/admin/settings', {
      'billing.company_name': 'Partial SRL',
      'capacity.node_cores': { '1': 8 },
    });
    expect(response.status).toBe(403);
    expect(await stored('billing.company_name')).toBeNull();
    expect(await stored('capacity.node_cores')).toBeNull();
  });

  it('writes nothing when one value is invalid', async () => {
    const { client: admin } = await createAdmin(app);
    const response = await admin.request('PUT', '/api/admin/settings', {
      'billing.company_name': 'Partial SRL',
      'billing.support_email': 'not-an-email',
    });
    expect(response.status).toBe(400);
    expect(await stored('billing.company_name')).toBeNull();
  });

  it('validates the shape of the infrastructure settings', async () => {
    const { client: admin } = await createAdmin(app);
    const bad: Record<string, unknown>[] = [
      { reserved_domains: 'example.com' },
      { reserved_domains: ['not a domain'] },
      { auto_delete_cancelled_instances: { enabled: true, retentionDays: 0 } },
      { auto_delete_cancelled_instances: { enabled: true, retentionDays: 30, extra: 1 } },
      { 'capacity.node_cores': { abc: 8 } },
      { 'capacity.node_cores': { '1': -4 } },
      { 'capacity.cpu_oversubscription': { value: 500 } },
      { 'capacity.node_costs': { '1': -1 } },
    ];
    for (const payload of bad) {
      const response = await admin.request('PUT', '/api/admin/settings', payload);
      expect(response.status, JSON.stringify(payload)).toBe(400);
    }
    const good = await admin.request('PUT', '/api/admin/settings', {
      reserved_domains: ['Example.com'],
      auto_delete_cancelled_instances: { enabled: false, retentionDays: 30 },
      'capacity.node_cores': { '1': 8 },
      'capacity.cpu_oversubscription': { value: 4 },
      'capacity.node_costs': { '1': 49.5 },
    });
    expect(good.status).toBe(200);
    expect(await stored('reserved_domains')).toEqual(['example.com']);
  });

  it('needs infrastructure.write for the capacity and the deletion policy', async () => {
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    expect((await staff.request('PUT', '/api/admin/settings', { 'capacity.node_cores': { '1': 8 } })).status).toBe(403);
    expect((await staff.request('PUT', '/api/admin/settings', { auto_delete_cancelled_instances: { enabled: true, retentionDays: 1 } })).status).toBe(403);
    const infra = await createStaff('infra@blipmade.test', ['settings.read', 'settings.write', 'infrastructure.write']);
    expect((await infra.request('PUT', '/api/admin/settings', { 'capacity.node_cores': { '1': 8 } })).status).toBe(200);
  });

  it('holds the delete to the same owner as the write', async () => {
    await prisma.setting.createMany({ data: [
      { key: 'pricing_resources', value: { a: 1 } },
      { key: 'capacity.node_cores', value: { '1': 8 } },
      { key: 'billing.company_name', value: 'X' },
    ] });
    const staff = await createStaff('writer@blipmade.test', ['settings.read', 'settings.write']);
    expect((await staff.request('DELETE', '/api/admin/settings/pricing_resources')).status).toBe(403);
    expect((await staff.request('DELETE', '/api/admin/settings/capacity.node_cores')).status).toBe(403);
    expect((await staff.request('DELETE', '/api/admin/settings/billing.company_name')).status).toBe(200);
    expect(await stored('pricing_resources')).toEqual({ a: 1 });
    expect(await stored('capacity.node_cores')).toEqual({ '1': 8 });
  });

  it('shows a member of the staff only the keys that the permissions allow', async () => {
    await prisma.setting.createMany({ data: [
      { key: 'pricing_resources', value: { a: 1 } },
      { key: 'capacity.node_costs', value: { '1': 40 } },
      { key: 'billing.company_name', value: 'X' },
      { key: 'unregistered.leftover', value: 'y' },
    ] });
    const reader = await createStaff('reader@blipmade.test', ['settings.read']);
    const keys = Object.keys((await reader.request('GET', '/api/admin/settings')).body.settings);
    expect(keys).toEqual(['billing.company_name']);

    const full = await createStaff('full@blipmade.test', ['settings.read', 'pricing.read', 'infrastructure.read']);
    const fullKeys = Object.keys((await full.request('GET', '/api/admin/settings')).body.settings).sort();
    expect(fullKeys).toEqual(['billing.company_name', 'capacity.node_costs', 'pricing_resources']);
  });

  it('gives every key one owner', () => {
    const map = settingControlMap();
    expect(map.length).toBeGreaterThan(30);
    for (const entry of map) {
      expect(entry.domain, entry.key).toBeTruthy();
      if (!entry.general) expect(entry.managedBy, entry.key).toBeTruthy();
    }
    expect(settingPolicy('email.template.account-welcome')?.general).toBe(false);
    expect(settingPolicy('internal.whatever')?.hidden).toBe(true);
    expect(settingPolicy('nothing.like.this')).toBeNull();
  });
});

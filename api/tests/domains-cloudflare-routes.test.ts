import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

/** Connecting a Cloudflare zone: the token is checked, kept sealed, and removed on request. */
let tokenStatus = 'active';
let zones: { id: string; name: string; status: string; name_servers: string[] }[] = [];
const reply = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ message: 'refused' }] }), { status });

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => {
  await resetDatabase();
  tokenStatus = 'active';
  zones = [{ id: 'z1', name: 'example.com', status: 'active', name_servers: ['a.ns.cloudflare.com'] }];
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.cloudflare.com/client/v4')) return real(input as never, init);
    const path = new URL(url).pathname.replace('/client/v4', '');
    if (path === '/user/tokens/verify') return reply({ status: tokenStatus });
    if (path === '/zones') return reply(zones);
    if (/^\/zones\/z1\/dns_records$/.test(path)) return reply([]);
    return reply(null, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

const TOKEN = 'cf_token_'.padEnd(40, 'x');

describe('the Cloudflare zone of a customer', () => {
  it('is connected with a token that is active and sees one active zone, and the token is kept sealed', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'cf@example.com');
    expect((await client.request('GET', '/api/domains/cloudflare')).body).toEqual({ connected: false, zoneName: null });
    const done = await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN });
    expect(done.status).toBe(200);
    expect(done.body).toEqual({ connected: true, zoneName: 'example.com' });
    const row = await prisma.cloudflareZoneLink.findUniqueOrThrow({ where: { userId } });
    expect(row.tokenSealed).not.toContain('cf_token_');
    expect(JSON.stringify(done.body)).not.toContain('cf_token_');
    expect((await client.request('GET', '/api/domains/cloudflare')).body).toEqual({ connected: true, zoneName: 'example.com' });
  });

  it('is refused for an expired token, for two zones, for a zone that is not active and for the zone of the platform', async () => {
    const { client, userId } = await registerAndLogin(await getApp(), 'cf2@example.com');
    tokenStatus = 'expired';
    expect((await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(400);
    tokenStatus = 'active';
    zones.push({ id: 'z2', name: 'other.com', status: 'active', name_servers: [] });
    expect((await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(400);
    zones.pop();
    zones[0]!.status = 'pending';
    expect((await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(400);
    zones[0] = { id: 'z1', name: 'blipmade.com', status: 'active', name_servers: [] };
    expect((await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(400);
    expect(await prisma.cloudflareZoneLink.count({ where: { userId } })).toBe(0);
  });

  it('is disconnected on request, and each account sees only its own connection', async () => {
    const { client } = await registerAndLogin(await getApp(), 'cf3@example.com');
    const other = await registerAndLogin(await getApp(), 'cf4@example.com');
    await client.request('PUT', '/api/domains/cloudflare', { token: TOKEN });
    expect((await other.client.request('GET', '/api/domains/cloudflare')).body.connected).toBe(false);
    expect((await client.request('DELETE', '/api/domains/cloudflare')).status).toBe(204);
    expect((await client.request('GET', '/api/domains/cloudflare')).body.connected).toBe(false);
  });
});

describe('who may write the DNS of a hostname', () => {
  async function ownerWithDomain() {
    const owner = await registerAndLogin(await getApp(), 'dns-owner@example.com');
    const product = await prisma.product.create({ data: { slug: 'wordpress', name: 'WordPress', category: 'WEB_CMS', description: 'A website.', icon: 'globe', deployable: true, eggId: 1 } });
    const instance = await prisma.instance.create({ data: { userId: owner.userId, productId: product.id, name: 'site', status: 'ONLINE', ram: 1024, cpu: 1, disk: 10, price: 149, pterodactylServerId: 4242 } });
    const domain = await prisma.instanceDomain.create({ data: { instanceId: instance.id, hostname: 'app.example.com', claimedByUserId: owner.userId, verificationToken: 'tok', verificationHost: '_blipmade-verify.app.example.com', verifiedAt: new Date() } });
    return { owner, instance, domain };
  }
  const member = async (email: string, instanceId: string, role: 'manager' | 'viewer') => {
    const person = await registerAndLogin(await getApp(), email);
    await prisma.instanceShare.create({ data: { instanceId, userId: person.userId, role, codeHash: `h-${email}`, expiresAt: new Date(Date.now() + 86_400_000), redeemedAt: new Date() } });
    return person;
  };

  it('is open to the owner and closed to a manager, a viewer and a stranger, even with a zone of their own', async () => {
    const { owner, instance, domain } = await ownerWithDomain();
    expect((await owner.client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(200);
    const shown = await owner.client.request('POST', `/api/domains/${domain.id}/cloudflare`, {});
    expect(shown.status).toBe(200);
    expect(Array.isArray(shown.body.preview)).toBe(true);

    const manager = await member('dns-manager@example.com', instance.id, 'manager');
    const viewer = await member('dns-viewer@example.com', instance.id, 'viewer');
    const stranger = await registerAndLogin(await getApp(), 'dns-stranger@example.com');
    for (const person of [manager, viewer, stranger]) {
      // The member connects a zone of their own: it is theirs and it never reaches the hostname of the owner.
      expect((await person.client.request('PUT', '/api/domains/cloudflare', { token: TOKEN })).status).toBe(200);
      expect((await person.client.request('POST', `/api/domains/${domain.id}/cloudflare`, {})).status).toBe(404);
      expect((await person.client.request('POST', `/api/domains/${domain.id}/cloudflare`, { approve: true, previewId: shown.body.previewId })).status).toBe(404);
    }
    expect(await prisma.dnsApproval.count({ where: { userId: { not: owner.userId } } })).toBe(0);
    expect(await prisma.dnsRecordGrant.count()).toBe(0);
  });

  it('never suggests a www record next to the hostname of a customer', async () => {
    const { owner, instance } = await ownerWithDomain();
    await prisma.instanceDomain.create({ data: { instanceId: instance.id, hostname: 'example.org', claimedByUserId: owner.userId, verificationToken: 'tok2', verificationHost: '_blipmade-verify.example.org' } });
    const list = await owner.client.request('GET', '/api/domains');
    expect(list.status).toBe(200);
    const names = (list.body.domains as { dnsRecords: { name: string }[] }[]).flatMap((row) => row.dnsRecords.map((record) => record.name));
    expect(names.length).toBeGreaterThan(0);
    expect(names.filter((name) => name.startsWith('www.'))).toEqual([]);
  });
});

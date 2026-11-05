import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** The panel answers with a private allocation address: the platform must publish the public one. */
const panel = { port: 30123, ip: '10.77.0.11' };
vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => ({ token: 'ptlc_testtoken', panelUserId: 1, externalId: 'ext', source: 'issued' })),
}));
vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => true),
  clientToken: vi.fn(() => 'test-client-token'),
  listAllocations: vi.fn(async () => [{ id: 1, ip: panel.ip, port: panel.port, alias: null, is_default: true }]),
  ClientApiError: class ClientApiError extends Error { status = 500; },
}));

/** A small Cloudflare for the platform zone, with a log of the writes. */
interface Row { id: string; type: string; name: string; content?: string; data?: { port: number; target: string } }
let rows: Row[];
let log: string[];
let n = 1;
const reply = (result: unknown, status = 200) => new Response(JSON.stringify({ success: status < 400, result, errors: status < 400 ? [] : [{ message: 'refused' }] }), { status });

const { prisma } = await import('../src/db.js');
const { env } = await import('../src/env.js');
// The environment was read before this file ran, so the settings of the test are put on it here.
Object.assign(env, { gameConnectEnabled: true, GAME_JOIN_DOMAIN: 'play.blipmade.test', GAME_PUBLIC_ADDRESS: '203.0.113.87', CLOUDFLARE_API_TOKEN: 'cf-token', CLOUDFLARE_ZONE_ID: 'zone1', CLOUDFLARE_ZONE_NAME: 'blipmade.test', cloudflareDnsEnabled: true });
const game = await import('../src/services/game-connect.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => {
  await resetDatabase();
  rows = [];
  log = [];
  n = 1;
  panel.port = 30123;
  panel.ip = '10.77.0.11';
  (env as { gameConnectEnabled: boolean }).gameConnectEnabled = true;
  const real = globalThis.fetch;
  vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => {
    const url = String(input);
    if (!url.startsWith('https://api.cloudflare.com/client/v4')) return real(input as never, init);
    const parsed = new URL(url);
    const method = init?.method ?? 'GET';
    const path = parsed.pathname.replace('/client/v4/zones/zone1/dns_records', '');
    if (path === '' && method === 'GET') return reply(rows.filter((row) => row.type === parsed.searchParams.get('type') && row.name === parsed.searchParams.get('name')));
    if (path === '' && method === 'POST') { log.push(`POST ${(JSON.parse(String(init?.body)) as Row).type}`); const row = { ...(JSON.parse(String(init?.body)) as Row), id: `rec${n++}aaaaaaaa` }; rows.push(row); return reply(row); }
    const id = path.slice(1);
    if (method === 'PUT') { log.push('PUT'); const row = rows.find((entry) => entry.id === id); if (!row) return reply(null, 404); Object.assign(row, JSON.parse(String(init?.body))); return reply(row); }
    if (method === 'DELETE') { log.push('DELETE'); const had = rows.some((entry) => entry.id === id); rows = rows.filter((entry) => entry.id !== id); return had ? reply({ id }) : reply(null, 404); }
    return reply(null, 404);
  }));
});
afterEach(() => vi.unstubAllGlobals());

async function seed(slug = 'minecraft-paper', status: 'ONLINE' | 'CANCELLED' = 'ONLINE', email = 'smart@example.com') {
  const { client, userId } = await registerAndLogin(await getApp(), email);
  const product = (await prisma.product.findUnique({ where: { slug } })) ?? (await prisma.product.create({ data: { slug, name: slug, category: 'GAMES', description: 'A game.', icon: 'box', deployable: true, eggId: 5 } }));
  const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'My Fun Server!', status, ram: 2048, cpu: 1, disk: 10, price: 900, pterodactylServerId: 4000 + Math.floor(Math.random() * 9000), pterodactylUuid: `uuid-${Math.random().toString(36).slice(2)}` } });
  return { client, userId, instance };
}
/** A resolver that answers with what the zone holds, as the real DNS does once the records have spread. */
const resolverOfZone = (): import('../src/services/game-connect.js').Resolver => ({
  srv: async (name) => rows.filter((row) => row.type === 'SRV' && row.name === name).map((row) => ({ port: row.data!.port, name: row.data!.target })),
  a: async (name) => rows.filter((row) => row.type === 'A' && row.name === name).map((row) => row.content!),
});

describe('what the registry knows', () => {
  it('maps the runtimes that read SRV, and never Bedrock or the games that do not', () => {
    expect(game.profileForProduct('minecraft-paper')?.id).toBe('minecraft-java');
    expect(game.profileForProduct('minecraft-forge')?.id).toBe('minecraft-java');
    expect(game.srvServiceOf(game.profileForProduct('minecraft-folia')!)).toBe('minecraft._tcp');
    expect(game.srvServiceOf(game.profileForProduct('factorio')!)).toBe('factorio._udp');
    expect(game.profileForProduct('minecraft-bedrock')).toBeNull();
    for (const slug of ['rust', 'terraria', 'counter-strike-2', 'valheim']) expect(game.profileForProduct(slug)).toBeNull();
    // FiveM is known but off, and no profile claims a client was verified.
    expect(game.profileForProduct('fivem')).toMatchObject({ enabled: false, service: 'cfx', transport: 'udp' });
    expect(game.GAME_PROFILES.every((profile) => profile.clientVerified === false)).toBe(true);
  });

  it('makes a plain label with a random tail, never a reserved name, and publishes only a public address', () => {
    expect(game.labelFor('My Fun Server!', () => 0.5)).toMatch(/^my-fun-server-[0-9a-z]{4}$/);
    expect(game.labelFor('', () => 0.1)).toMatch(/^server-[0-9a-z]{4}$/);
    expect(game.labelFor('x'.repeat(60), () => 0.2).length).toBeLessThanOrEqual(29);
    for (const ip of ['10.77.0.11', '192.168.1.5', '172.20.0.1', '127.0.0.1', '', 'nope']) expect(game.isPublicIpv4(ip)).toBe(false);
    expect(game.isPublicIpv4('203.0.113.87')).toBe(true);
  });

  it('checks that the DNS answers with the port and the address that were written, and nothing else', async () => {
    const profile = game.profileForProduct('minecraft-paper')!;
    const host = 'x-1.play.blipmade.test';
    const ok = { srv: async () => [{ port: 30123, name: `${host}.` }], a: async () => ['203.0.113.87'] };
    expect(await game.verifyRecords({ label: 'x-1', profile, address: '203.0.113.87', port: 30123 }, ok)).toBe(true);
    expect(await game.verifyRecords({ label: 'x-1', profile, address: '203.0.113.87', port: 30124 }, ok)).toBe(false);
    expect(await game.verifyRecords({ label: 'x-1', profile, address: '203.0.113.9', port: 30123 }, ok)).toBe(false);
    expect(await game.verifyRecords({ label: 'x-1', profile, address: '203.0.113.87', port: 30123 }, { srv: async () => { throw new Error('nxdomain'); }, a: async () => [] })).toBe(false);
  });
});

describe('writing the hostname of a server', () => {
  it('writes an A and an SRV record with the real port and the public address, once', async () => {
    const { instance } = await seed();
    const result = await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    expect(result).toMatchObject({ state: 'DNS_VERIFIED', wrote: true });
    const row = await prisma.gameConnect.findUniqueOrThrow({ where: { instanceId: instance.id } });
    const host = `${row.label}.play.blipmade.test`;
    expect(rows.find((entry) => entry.type === 'A')).toMatchObject({ name: host, content: '203.0.113.87' });
    expect(rows.find((entry) => entry.type === 'SRV')).toMatchObject({ name: `_minecraft._tcp.${host}`, data: { port: 30123, target: host } });
    expect(row).toMatchObject({ publicAddress: '203.0.113.87', port: 30123, state: 'DNS_VERIFIED' });
    expect(row.aRecordId && row.srvRecordId).toBeTruthy();
    expect(row.label).toMatch(/^my-fun-server-[0-9a-z]{4}$/);

    // Again with nothing changed: nothing is written.
    const writes = log.length;
    expect(await game.syncGameConnect(instance.id, { resolver: resolverOfZone() })).toMatchObject({ state: 'DNS_VERIFIED', wrote: false });
    expect(log.length).toBe(writes);
    expect(rows).toHaveLength(2);
  });

  it('follows the allocation: a new port rewrites the SRV record, and a client that was verified is asked again', async () => {
    const { instance } = await seed();
    await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    await prisma.gameConnect.update({ where: { instanceId: instance.id }, data: { clientVerifiedAt: new Date() } });
    panel.port = 30456;
    const result = await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    expect(result.wrote).toBe(true);
    expect(rows.filter((entry) => entry.type === 'SRV')).toHaveLength(1);
    expect(rows.find((entry) => entry.type === 'SRV')!.data!.port).toBe(30456);
    const row = await prisma.gameConnect.findUniqueOrThrow({ where: { instanceId: instance.id } });
    expect(row.port).toBe(30456);
    expect(row.clientVerifiedAt).toBeNull();
    expect(row.state).toBe('DNS_VERIFIED');
  });

  it('says it is waiting when the DNS has not spread, and calls a record that went wrong degraded', async () => {
    const { instance } = await seed();
    const never = { srv: async () => [], a: async () => [] };
    expect(await game.syncGameConnect(instance.id, { resolver: never })).toMatchObject({ state: 'PENDING_DNS' });
    expect((await prisma.gameConnect.findUniqueOrThrow({ where: { instanceId: instance.id } })).lastError).toMatch(/does not answer/);
    expect(await game.syncGameConnect(instance.id, { resolver: resolverOfZone() })).toMatchObject({ state: 'DNS_VERIFIED' });
    expect(await game.syncGameConnect(instance.id, { resolver: never })).toMatchObject({ state: 'DEGRADED' });
  });

  it('writes nothing for Bedrock, for a game that is off or unknown, when the server has no address, or when the feature is off', async () => {
    const bedrock = await seed('minecraft-bedrock', 'ONLINE', 'b@example.com');
    expect(await game.syncGameConnect(bedrock.instance.id)).toMatchObject({ state: 'UNSUPPORTED', wrote: false });
    const fivem = await seed('fivem', 'ONLINE', 'f@example.com');
    expect(await game.syncGameConnect(fivem.instance.id)).toMatchObject({ state: 'UNSUPPORTED', wrote: false });
    const mc = await seed('minecraft-folia', 'ONLINE', 'm@example.com');
    expect(await game.syncGameConnect(mc.instance.id, { placement: async () => ({ address: null, port: 0 }) })).toMatchObject({ wrote: false });
    (env as { gameConnectEnabled: boolean }).gameConnectEnabled = false;
    expect(await game.syncGameConnect(mc.instance.id)).toMatchObject({ state: 'DISABLED', wrote: false });
    expect(log).toEqual([]);
    // No row is made for a server that has nothing to publish.
    expect(await prisma.gameConnect.count()).toBe(0);
  });

  it('gives two servers of the same name two different hostnames, and Factorio its own service', async () => {
    const a = await seed('minecraft-paper', 'ONLINE', 'a1@example.com');
    const b = await seed('minecraft-paper', 'ONLINE', 'b1@example.com');
    const f = await seed('factorio', 'ONLINE', 'f1@example.com');
    for (const entry of [a, b, f]) await game.syncGameConnect(entry.instance.id, { resolver: resolverOfZone() });
    const labels = (await prisma.gameConnect.findMany()).map((row) => row.label);
    expect(new Set(labels).size).toBe(3);
    expect(rows.some((row) => row.type === 'SRV' && row.name.startsWith('_factorio._udp.'))).toBe(true);
  });
});

describe('removing it', () => {
  it('removes only the records the platform wrote, and the row, when a server is cancelled', async () => {
    const { instance } = await seed();
    rows.push({ id: 'otherrecord123', type: 'A', name: 'www.blipmade.test', content: '198.51.100.1' });
    await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    await prisma.instance.update({ where: { id: instance.id }, data: { status: 'CANCELLED' } });
    expect(await game.reconcileGameConnects({ resolver: resolverOfZone() })).toMatchObject({ removed: 1 });
    expect(rows.map((row) => row.id)).toEqual(['otherrecord123']);
    expect(await prisma.gameConnect.count()).toBe(0);
  });

  it('removes the records of a server that was deleted, since the row outlives it, and keeps the row when the removal fails', async () => {
    const { instance } = await seed();
    await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    await prisma.instance.delete({ where: { id: instance.id } });
    const orphan = await prisma.gameConnect.findFirstOrThrow();
    expect(orphan.instanceId).toBeNull();
    const real = globalThis.fetch;
    vi.stubGlobal('fetch', vi.fn(async (input: string | URL | Request, init?: RequestInit) => (init?.method === 'DELETE' ? reply(null, 500) : real(input as never, init))));
    expect(await game.removeGameConnect(orphan.id)).toBe(false);
    expect(await prisma.gameConnect.count()).toBe(1);
    expect((await prisma.gameConnect.findFirstOrThrow()).lastError).toMatch(/refused|removed/);
  });
});

describe('what the customer sees', () => {
  it('offers the clean address only once the DNS answers, keeps the address and the port, and never calls DNS a join', async () => {
    const { client, instance } = await seed();
    const before = await client.request('GET', `/api/instances/${instance.id}/connect`);
    expect(before.body).toMatchObject({ enabled: true, supported: true, state: 'PENDING_DNS', address: null });
    await game.syncGameConnect(instance.id, { resolver: resolverOfZone() });
    const after = (await client.request('GET', `/api/instances/${instance.id}/connect`)).body;
    expect(after.state).toBe('DNS_VERIFIED');
    expect(after.state).not.toBe('CLIENT_VERIFIED');
    expect(after.address).toMatch(/\.play\.blipmade\.test$/);
    expect(after.fallback).toBe('203.0.113.87:30123');
    expect(after.profile.experimental).toBe(true);
    expect(after.profile.limitations.join(' ')).toMatch(/Bedrock/);
  });

  it('says a game without the feature uses the address and the port', async () => {
    const { client, instance } = await seed('minecraft-bedrock', 'ONLINE', 'bed@example.com');
    const info = (await client.request('GET', `/api/instances/${instance.id}/connect`)).body;
    expect(info).toMatchObject({ supported: false, state: 'UNSUPPORTED', address: null });
    expect(info.note).toMatch(/address and the port/);
  });

  it('is readable by a member of a shared server, checked again only by the owner or a manager, and closed to a stranger', async () => {
    const { instance } = await seed();
    const viewer = await registerAndLogin(await getApp(), 'viewer-c@example.com');
    const manager = await registerAndLogin(await getApp(), 'manager-c@example.com');
    const stranger = await registerAndLogin(await getApp(), 'stranger-c@example.com');
    await prisma.instanceShare.create({ data: { instanceId: instance.id, userId: viewer.userId, role: 'viewer', codeHash: 'hv', expiresAt: new Date(Date.now() + 86_400_000), redeemedAt: new Date() } });
    await prisma.instanceShare.create({ data: { instanceId: instance.id, userId: manager.userId, role: 'manager', codeHash: 'hm', expiresAt: new Date(Date.now() + 86_400_000), redeemedAt: new Date() } });
    expect((await viewer.client.request('GET', `/api/instances/${instance.id}/connect`)).status).toBe(200);
    expect((await stranger.client.request('GET', `/api/instances/${instance.id}/connect`)).status).toBe(404);
    expect((await viewer.client.request('POST', `/api/instances/${instance.id}/connect/sync`, {})).status).toBe(404);
    expect((await stranger.client.request('POST', `/api/instances/${instance.id}/connect/sync`, {})).status).toBe(404);
    const done = await manager.client.request('POST', `/api/instances/${instance.id}/connect/sync`, {});
    expect(done.status).toBe(200);
    expect(done.body.wrote).toBe(true);
    expect(done.body.state).toBe('PENDING_DNS'); // the real DNS does not know this test zone
  });
});

describe('a custom domain of a game', () => {
  it('uses the service of the registry for the SRV record, and none for a game that has none', async () => {
    const mc = await seed('minecraft-paper', 'ONLINE', 'cm@example.com');
    const fac = await seed('factorio', 'ONLINE', 'cf@example.com');
    const bed = await seed('minecraft-bedrock', 'ONLINE', 'cb@example.com');
    const names = async (entry: { client: { request: Function }; instance: { id: string } }, hostname: string) => {
      const answer = await entry.client.request('POST', `/api/instances/${entry.instance.id}/domains`, { hostname, purpose: 'game' });
      expect(answer.status).toBe(201);
      return (answer.body.domain.dnsRecords as { name: string; type: string }[]).filter((record) => record.type === 'SRV').map((record) => record.name);
    };
    expect(await names(mc, 'play.mine.example.org')).toEqual(['_minecraft._tcp.play.mine.example.org']);
    expect(await names(fac, 'play.fact.example.org')).toEqual(['_factorio._udp.play.fact.example.org']);
    expect(await names(bed, 'play.bed.example.org')).toEqual([]);
  });
});

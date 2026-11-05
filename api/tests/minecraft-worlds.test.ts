import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** The world manager: a backup on request, and a new world only after a backup, with the server stopped and the words typed. */
const panel = { state: 'offline', backupFails: false, folders: ['world', 'world_nether'] as string[], deleted: [] as string[], backups: [] as string[], properties: 'level-name=world\n', log: '', commands: [] as string[] };

vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => ({ token: 'ptlc_testtoken', panelUserId: 1, externalId: 'ext', source: 'issued' })),
}));
vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => true),
  clientToken: vi.fn(() => 'test-client-token'),
  getResources: vi.fn(async () => ({ state: panel.state, is_suspended: false, cpu_absolute: 0, memory_bytes: 0, network: { rx: 0, tx: 0 }, disk: { used: 0 }, uptime: 0 })),
  createBackup: vi.fn(async (_token: string, _uuid: string, payload: { name: string }) => {
    if (panel.backupFails) throw new Error('no room');
    panel.backups.push(payload.name);
    return { uuid: 'b1', name: payload.name };
  }),
  readFile: vi.fn(async (_token: string, _uuid: string, path: string) => ({ content: path === '/logs/latest.log' ? panel.log : panel.properties, encoding: 'utf-8' })),
  sendCommand: vi.fn(async (_token: string, _uuid: string, command: string) => { panel.commands.push(command); }),
  listFiles: vi.fn(async (_token: string, _uuid: string, path: string) => {
    if (!panel.folders.includes(path.slice(1))) throw new Error('not found');
    return [{ name: 'level.dat' }];
  }),
  deleteFile: vi.fn(async (_token: string, _uuid: string, path: string) => { panel.deleted.push(path); }),
  ClientApiError: class ClientApiError extends Error { status = 500; },
}));

const { prisma } = await import('../src/db.js');
const { worldFolders, parseTps, lagAdvice } = await import('../src/services/minecraft.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => {
  await resetDatabase();
  Object.assign(panel, { state: 'offline', backupFails: false, folders: ['world', 'world_nether'], deleted: [], backups: [], properties: 'level-name=world\n', log: '', commands: [] });
});

async function seed() {
  const { client, userId } = await registerAndLogin(await getApp(), 'worlds@example.com');
  const product = await prisma.product.create({ data: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, maxRam: 8192, maxCpu: 4, maxDisk: 100, deployable: true, visible: true, eggId: 56 } });
  const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'mc', status: 'ONLINE', ram: 2048, cpu: 1, disk: 10, price: 900, currency: 'EUR', pterodactylServerId: 9, pterodactylUuid: 'uuid-9' } });
  return { client, instance };
}

describe('the folders of a world', () => {
  it('names the world of the server and its two dimensions, and nothing a file name could smuggle in', () => {
    expect(worldFolders(undefined)).toEqual(['world', 'world_nether', 'world_the_end']);
    expect(worldFolders('survival')).toEqual(['survival', 'survival_nether', 'survival_the_end']);
    for (const bad of ['../etc', 'a/b', '..', '.hidden', 'x'.repeat(70), 'a b']) expect(worldFolders(bad)).toEqual(['world', 'world_nether', 'world_the_end']);
  });
});

describe('the world manager', () => {
  it('makes a locked backup on request', async () => {
    const { client, instance } = await seed();
    const answer = await client.request('POST', `/api/instances/${instance.id}/minecraft/worlds/backup`, {});
    expect(answer.status).toBe(200);
    expect(panel.backups).toHaveLength(1);
    panel.backupFails = true;
    expect((await client.request('POST', `/api/instances/${instance.id}/minecraft/worlds/backup`, {})).status).toBe(409);
  });

  it('removes the world only with the words typed, the server stopped and a backup made first', async () => {
    const { client, instance } = await seed();
    const url = `/api/instances/${instance.id}/minecraft/worlds/reset`;
    expect((await client.request('POST', url, {})).status).toBe(400);
    expect((await client.request('POST', url, { confirm: 'yes' })).status).toBe(400);
    expect(panel.deleted).toEqual([]);

    panel.state = 'running';
    expect((await client.request('POST', url, { confirm: 'reset the world' })).status).toBe(409);
    expect(panel.deleted).toEqual([]);
    expect(panel.backups).toEqual([]);

    panel.state = 'offline';
    panel.backupFails = true;
    expect((await client.request('POST', url, { confirm: 'reset the world' })).status).toBe(409);
    expect(panel.deleted).toEqual([]);

    panel.backupFails = false;
    const done = await client.request('POST', url, { confirm: 'reset the world' });
    expect(done.status).toBe(200);
    expect(done.body.reset).toEqual(['world', 'world_nether']);
    expect(panel.backups[0]).toMatch(/^Before world reset/);
    expect(panel.deleted).toEqual(['/world', '/world_nether']);
    const log = await prisma.auditLog.findFirst({ where: { action: 'instance.minecraft_world_reset' } });
    expect(log).toBeTruthy();
  });

  it('is not open to somebody else', async () => {
    const { instance } = await seed();
    const { client: stranger } = await registerAndLogin(await getApp(), 'stranger@example.com');
    const answer = await stranger.request('POST', `/api/instances/${instance.id}/minecraft/worlds/reset`, { confirm: 'reset the world' });
    expect([403, 404]).toContain(answer.status);
    expect(panel.deleted).toEqual([]);
  });
});

describe('is the server lagging', () => {
  it('reads the last answer of /tps from the log, colours and all', () => {
    const log = '[10:00:01 INFO]: TPS from last 1m, 5m, 15m: 20.0, 20.0, 19.9\n[10:05:02 INFO]: §6TPS from last 1m, 5m, 15m: §a*17.5§r, §a18.2§r, §a19.0\n';
    expect(parseTps(log)).toEqual({ m1: 17.5, m5: 18.2, m15: 19 });
    expect(parseTps('nothing here')).toBeNull();
  });

  it('says what the numbers mean and what to do', () => {
    expect(lagAdvice({ tps: { m1: 20 }, memoryBytes: 1e8, memoryLimitMb: 2048, hasSpark: false })).toMatchObject({ verdict: 'good' });
    const slow = lagAdvice({ tps: { m1: 16 }, memoryBytes: 1.95 * 1024 ** 3, memoryLimitMb: 2048, hasSpark: false });
    expect(slow.verdict).toBe('slow');
    expect(slow.lines.join(' ')).toMatch(/memory is almost full/);
    expect(slow.lines.join(' ')).toMatch(/Install the Spark plugin/);
    expect(lagAdvice({ tps: { m1: 9 }, memoryBytes: 0, memoryLimitMb: 2048, hasSpark: true }).lines.join(' ')).toMatch(/spark profiler start/);
    expect(lagAdvice({ tps: null, memoryBytes: 0, memoryLimitMb: 2048, hasSpark: false }).verdict).toBe('unknown');
  });

  it('asks the running server for its ticks and answers with what it read; a stopped one is not measured', async () => {
    const { client, instance } = await seed();
    const url = `/api/instances/${instance.id}/minecraft/performance`;
    panel.state = 'offline';
    const off = await client.request('GET', url);
    expect(off.body).toMatchObject({ running: false, verdict: 'unknown' });
    expect(panel.commands).toEqual([]);
    panel.state = 'running';
    panel.log = '[10:00:01 INFO]: TPS from last 1m, 5m, 15m: 14.2, 17.0, 18.8\n';
    const on = await client.request('GET', url);
    expect(panel.commands).toEqual(['tps']);
    expect(on.body).toMatchObject({ running: true, verdict: 'bad', tps: { m1: 14.2, m5: 17, m15: 18.8 } });
  });
});

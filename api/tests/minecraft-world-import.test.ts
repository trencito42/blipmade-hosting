import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

/** A tiny file system for the panel: a folder is a key that ends with /, a file is a key with a size. */
const panel = { state: 'offline', backupFails: false, fs: new Map<string, number>(), backups: [] as string[], zips: {} as Record<string, string[]>, unpackFails: false };
const norm = (path: string) => `/${path}`.replace(/\/+/g, '/').replace(/\/$/, '') || '/';
const childrenOf = (dir: string) => {
  const base = norm(dir) === '/' ? '/' : `${norm(dir)}/`;
  const names = new Map<string, boolean>();
  for (const key of panel.fs.keys()) {
    if (!key.startsWith(base) || key === base) continue;
    const rest = key.slice(base.length);
    const first = rest.split('/')[0]!;
    names.set(first, names.get(first) || rest.includes('/') || key.endsWith('/'));
  }
  return [...names].map(([name, isDir]) => ({ name, is_directory: isDir, is_file: !isDir, size: panel.fs.get(`${base}${name}`) ?? 0 }));
};

vi.mock('../src/services/panel/credentials.js', () => ({
  resolveCustomerCredential: vi.fn(async () => ({ token: 'ptlc_testtoken', panelUserId: 1, externalId: 'ext', source: 'issued' })),
}));
vi.mock('../src/services/pterodactyl/client.js', () => ({
  clientApiAvailable: vi.fn(() => true),
  clientToken: vi.fn(() => 'test-client-token'),
  getResources: vi.fn(async () => ({ state: panel.state, is_suspended: false, cpu_absolute: 0, memory_bytes: 0, network: { rx: 0, tx: 0 }, disk: { used: 0 }, uptime: 0 })),
  createBackup: vi.fn(async (_t: string, _u: string, payload: { name: string }) => { if (panel.backupFails) throw new Error('no room'); panel.backups.push(payload.name); return { uuid: 'b', name: payload.name }; }),
  readFile: vi.fn(async () => ({ content: 'level-name=world\n', encoding: 'utf-8' })),
  listFiles: vi.fn(async (_t: string, _u: string, path: string) => {
    const list = childrenOf(path);
    if (!list.length && norm(path) !== '/') throw new Error('not found');
    return list;
  }),
  createFolder: vi.fn(async (_t: string, _u: string, path: string) => { panel.fs.set(`${norm(path)}/`, 0); }),
  moveFile: vi.fn(async (_t: string, _u: string, from: string, to: string) => {
    const a = norm(from);
    const b = norm(to);
    for (const [key, size] of [...panel.fs]) {
      if (key === a || key === `${a}/` || key.startsWith(`${a}/`)) { panel.fs.delete(key); panel.fs.set(b + key.slice(a.length), size); }
    }
  }),
  decompressArchive: vi.fn(async (_t: string, _u: string, path: string) => {
    if (panel.unpackFails) throw new Error('bad archive');
    const dir = norm(path).split('/').slice(0, -1).join('/');
    for (const entry of panel.zips[norm(path).split('/').pop()!] ?? []) panel.fs.set(`${dir}/${entry}`, 10);
  }),
  deleteFile: vi.fn(async (_t: string, _u: string, path: string) => {
    const a = norm(path);
    for (const key of [...panel.fs.keys()]) if (key === a || key === `${a}/` || key.startsWith(`${a}/`)) panel.fs.delete(key);
  }),
  ClientApiError: class ClientApiError extends Error { status = 500; },
}));

const { prisma } = await import('../src/db.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => {
  await resetDatabase();
  panel.state = 'offline';
  panel.backupFails = false;
  panel.unpackFails = false;
  panel.backups = [];
  panel.fs = new Map([['/world/level.dat', 5], ['/world/old-region.mca', 5], ['/world_nether/level.dat', 5], ['/mine.zip', 100], ['/server.properties', 5]]);
  panel.zips = { 'mine.zip': ['MyWorld/level.dat', 'MyWorld/region/r.0.0.mca'], 'flat.zip': ['level.dat', 'region/r.0.0.mca'], 'notworld.zip': ['readme.txt', 'docs/a.txt'] };
});

async function seed() {
  const { client, userId } = await registerAndLogin(await getApp(), 'import@example.com');
  const product = await prisma.product.create({ data: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'Paper', icon: 'box', minRam: 512, minCpu: 1, minDisk: 5, defaultRam: 2048, defaultCpu: 1, defaultDisk: 10, maxRam: 8192, maxCpu: 4, maxDisk: 100, deployable: true, visible: true, eggId: 56 } });
  const instance = await prisma.instance.create({ data: { userId, productId: product.id, name: 'mc', status: 'ONLINE', ram: 2048, cpu: 1, disk: 10, price: 900, currency: 'EUR', pterodactylServerId: 9, pterodactylUuid: 'uuid-9' } });
  return { client, url: `/api/instances/${instance.id}/minecraft/worlds/import` };
}
const body = (archive: string) => ({ archive, confirm: 'replace the world' });

describe('importing a world from a ZIP', () => {
  it('puts the world of the ZIP in place of the old one, after a backup, and leaves no temporary folder', async () => {
    const { client, url } = await seed();
    const done = await client.request('POST', url, body('mine.zip'));
    expect(done.status).toBe(200);
    expect(done.body.imported).toBe('world');
    expect(panel.backups[0]).toMatch(/^Before world import/);
    expect(panel.fs.has('/world/level.dat')).toBe(true);
    expect(panel.fs.has('/world/region/r.0.0.mca')).toBe(true);
    expect(panel.fs.has('/world/old-region.mca')).toBe(false);
    expect(panel.fs.has('/world_nether/level.dat')).toBe(false);
    expect([...panel.fs.keys()].some((key) => key.startsWith('/_world-import'))).toBe(false);
  });

  it('accepts a ZIP whose world is at the top, and refuses one that is not a world without changing anything', async () => {
    const { client, url } = await seed();
    panel.fs.set('/flat.zip', 100);
    panel.fs.set('/notworld.zip', 100);
    const before = [...panel.fs.keys()].filter((key) => key.startsWith('/world'));
    const refused = await client.request('POST', url, body('notworld.zip'));
    expect(refused.status).toBe(400);
    expect(refused.body.error?.message ?? refused.body.message).toMatch(/no world/);
    expect([...panel.fs.keys()].filter((key) => key.startsWith('/world'))).toEqual(before);
    expect([...panel.fs.keys()].some((key) => key.startsWith('/_world-import'))).toBe(false);
    const flat = await client.request('POST', url, body('flat.zip'));
    expect(flat.status).toBe(200);
    expect(panel.fs.has('/world/region/r.0.0.mca')).toBe(true);
  });

  it('wants the words, a stopped server, a backup, a plain name and a ZIP that is there', async () => {
    const { client, url } = await seed();
    expect((await client.request('POST', url, { archive: 'mine.zip' })).status).toBe(400);
    expect((await client.request('POST', url, body('../mine.zip'))).status).toBe(400);
    expect((await client.request('POST', url, body('mine.tar'))).status).toBe(400);
    expect((await client.request('POST', url, body('missing.zip'))).status).toBe(400);
    panel.state = 'running';
    expect((await client.request('POST', url, body('mine.zip'))).status).toBe(409);
    panel.state = 'offline';
    panel.backupFails = true;
    expect((await client.request('POST', url, body('mine.zip'))).status).toBe(409);
    expect(panel.fs.has('/world/old-region.mca')).toBe(true);
    expect(panel.backups).toEqual([]);
  });

  it('changes nothing when the ZIP cannot be unpacked', async () => {
    const { client, url } = await seed();
    panel.unpackFails = true;
    const answer = await client.request('POST', url, body('mine.zip'));
    expect(answer.status).toBe(409);
    expect(panel.fs.has('/world/old-region.mca')).toBe(true);
    expect([...panel.fs.keys()].some((key) => key.startsWith('/_world-import'))).toBe(false);
  });
});

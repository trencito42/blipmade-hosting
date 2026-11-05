import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';

const pulled: string[] = [];
vi.mock('../src/services/panel/operations.js', async (original) => ({ ...(await original<object>()), customerToken: vi.fn(async () => 'token') }));
vi.mock('../src/services/pterodactyl/client.js', async (original) => ({
  ...(await original<object>()),
  createFolder: vi.fn(async () => undefined),
  pullFile: vi.fn(async (_t: string, _u: string, _url: string, _dir: string, name: string) => { pulled.push(name); }),
}));
vi.mock('../src/services/minecraft.js', async (original) => ({
  ...(await original<object>()),
  pluginFileFor: vi.fn(async (slug: string) => {
    if (slug === 'old-plugin') throw new Error('old-plugin has no build for 26.1.2.');
    return { url: `https://cdn.modrinth.com/${slug}.jar`, filename: `${slug}.jar` };
  }),
}));

const { prisma } = await import('../src/db.js');
const { applyCatalogOrderInstall } = await import('../src/services/catalog-install-apply.js');
const { closeApp, getApp, registerAndLogin, resetDatabase } = await import('./helpers.js');

beforeAll(async () => { await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); pulled.length = 0; });

async function seed(plugins: string[]) {
  const { userId } = await registerAndLogin(await getApp(), 'orderinstall@example.com');
  const product = await prisma.product.create({ data: { slug: 'minecraft-paper', name: 'Paper', category: 'GAMES', description: 'A game.', icon: 'box', deployable: true, eggId: 5 } });
  const order = await prisma.order.create({ data: { number: 'BM-OI-1', userId, total: 900, status: 'PAID' } });
  const item = await prisma.orderItem.create({
    data: { orderId: order.id, productId: product.id, name: 'Paper', unitAmount: 900, total: 900, config: { catalog: { install: { gameVersion: '26.1.2', plugins: plugins.map((slug) => ({ slug })) } } } },
  });
  return prisma.instance.create({ data: { userId, productId: product.id, orderItemId: item.id, name: 'Server', status: 'ONLINE', ram: 2048, cpu: 1, disk: 10, price: 900, pterodactylServerId: 4321, pterodactylUuid: 'uuid-oi' } });
}

describe('the install chosen at checkout', () => {
  it('skips a plugin that has no build for the version and installs the others', async () => {
    const instance = await seed(['luckperms', 'old-plugin', 'worldedit']);
    expect(await applyCatalogOrderInstall(instance.id)).toBe('installed');
    expect(pulled).toEqual(['luckperms.jar', 'worldedit.jar']);
    const saved = await prisma.instance.findUnique({ where: { id: instance.id } });
    const order = (saved!.installationManifest as { orderInstall: { status: string; skipped: { slug: string }[] } }).orderInstall;
    expect(order.status).toBe('installed');
    expect(order.skipped.map((item) => item.slug)).toEqual(['old-plugin']);
    const event = await prisma.instanceEvent.findFirst({ where: { instanceId: instance.id, type: 'preset' } });
    expect(event?.message).toContain('Skipped old-plugin');
  });

  it('does not write twice once it is installed', async () => {
    const instance = await seed(['luckperms']);
    await applyCatalogOrderInstall(instance.id);
    expect(await applyCatalogOrderInstall(instance.id)).toBe('skipped');
    expect(pulled).toEqual(['luckperms.jar']);
  });
});

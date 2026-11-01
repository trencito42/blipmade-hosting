import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';
import { closeApp, getApp, resetDatabase, VALID_PASSWORD } from './helpers.js';

/**
 * The hourly retention pass.
 *
 * The pass used to read the first 200 servers and stop, so every server after
 * the 200th kept its old backups for ever. The panel is replaced here, and the
 * page size is made small, to prove that every server is visited once.
 */
const visited: string[] = [];

vi.mock('../src/services/panel/operations.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/panel/operations.js')>()),
  customerToken: async (instance: { pterodactylUuid: string }) => {
    visited.push(instance.pterodactylUuid);
    return 'token';
  },
}));
vi.mock('../src/services/pterodactyl/client.js', async (importOriginal) => ({
  ...(await importOriginal<typeof import('../src/services/pterodactyl/client.js')>()),
  listBackups: async () => [],
  listSchedules: async () => [{ id: 1, name: 'Blipmade automatic backup', action: 'backup', cron: '30 3 * * *', active: true, last_run: null, next_run: null }],
  deleteBackup: async () => undefined,
}));

const { sweepBackupRetention } = await import('../src/services/backup-policy.js');

beforeAll(async () => {
  await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
  visited.length = 0;
});

async function servers(count: number) {
  const user = await prisma.user.create({ data: { email: 'sweep@blipmade.test', passwordHash: await hashPassword(VALID_PASSWORD), role: 'CUSTOMER', firstName: 'S', lastName: 'W', emailVerifiedAt: new Date() } });
  const product = await prisma.product.create({ data: { slug: 'sweep', name: 'sweep', category: 'DEVELOPER_TOOLS', description: 'x', icon: 'server' } });
  for (let index = 0; index < count; index += 1) {
    await prisma.instance.create({
      data: { userId: user.id, productId: product.id, name: `s${index}`, status: 'ONLINE', pterodactylServerId: 100 + index, pterodactylUuid: `uuid-${index}`, ram: 1024, cpu: 1, disk: 5, price: 100 },
    });
  }
}

describe('the retention sweep', () => {
  it('visits every server once, past the first page', async () => {
    await servers(7);
    const result = await sweepBackupRetention(3);
    expect(result).toEqual({ checked: 7, removed: 0, failed: 0 });
    expect(visited.filter((uuid, index) => visited.indexOf(uuid) === index)).toHaveLength(7);
    // enforceRetention asks for the token again, so each server is visited by both steps and never skipped.
    expect(new Set(visited).size).toBe(7);
  });

  it('ignores servers that are not built or not running', async () => {
    await servers(2);
    await prisma.instance.updateMany({ where: { pterodactylUuid: 'uuid-1' }, data: { status: 'SUSPENDED' } });
    const result = await sweepBackupRetention(1);
    expect(result.checked).toBe(1);
  });

  it('goes on after a server that fails', async () => {
    await servers(3);
    const operations = await import('../src/services/panel/operations.js');
    const original = operations.customerToken;
    let calls = 0;
    vi.spyOn(operations, 'customerToken').mockImplementation(async (instance) => {
      calls += 1;
      if ((instance as { pterodactylUuid: string }).pterodactylUuid === 'uuid-0') throw new Error('panel down');
      return original(instance);
    });
    const result = await sweepBackupRetention(2);
    expect(result.checked).toBe(3);
    expect(result.failed).toBe(1);
    expect(calls).toBeGreaterThanOrEqual(3);
    expect(await prisma.instanceEvent.count({ where: { type: 'backups', message: { contains: 'panel down' } } })).toBe(1);
  });
});

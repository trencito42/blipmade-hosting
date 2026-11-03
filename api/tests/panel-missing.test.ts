import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { AppError } from '../src/lib/errors.js';
import { ClientApiError } from '../src/services/pterodactyl/client.js';
import { PterodactylError } from '../src/services/pterodactyl/application.js';
import { failPanelServerMissing, isPanelServerMissing } from '../src/services/panel-missing.js';
import { closeApp, getApp, registerAndLogin, resetDatabase } from './helpers.js';

/**
 * A server that the database still lists and the panel no longer has.
 *
 * The panel answers 404 to every call about it. That is a finding for staff
 * and not a crash: the caller gets a clear refusal and the instance gets a
 * note, once a day.
 */

beforeAll(async () => {
  await getApp();
});
afterAll(async () => {
  await closeApp();
});
beforeEach(async () => {
  await resetDatabase();
});

async function instanceOfSomeone() {
  const { userId } = await registerAndLogin(await getApp(), 'owner@example.com');
  const product = await prisma.product.create({
    data: {
      slug: 'missing-product',
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
      userId,
      productId: product.id,
      name: 'Gone',
      status: 'ONLINE',
      ram: 1024,
      cpu: 1,
      disk: 10,
      price: 149,
      currency: 'EUR',
      pterodactylServerId: 135,
      pterodactylUuid: 'da3bebb6-0000-0000-0000-000000000000',
    },
  });
}

describe('a server that the panel does not have', () => {
  it('is recognised from a 404 of either client of the panel', () => {
    expect(isPanelServerMissing(new PterodactylError(404, '', 'gone'))).toBe(true);
    expect(isPanelServerMissing(new ClientApiError(404, '', 'gone'))).toBe(true);
    expect(isPanelServerMissing(new PterodactylError(500, '', 'broken'))).toBe(false);
    expect(isPanelServerMissing(new Error('404'))).toBe(false);
  });

  it('is refused with a 409 and noted once a day', async () => {
    const instance = await instanceOfSomeone();

    for (let i = 0; i < 2; i++) {
      const error = await failPanelServerMissing(instance.id).catch((caught: unknown) => caught);
      expect(error).toBeInstanceOf(AppError);
      expect((error as AppError).statusCode).toBe(409);
    }
    expect(await prisma.instanceEvent.count({ where: { instanceId: instance.id, type: 'panel_missing' } })).toBe(1);
  });
});

import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { requireAuth } from '../plugins/auth.js';
import { audit } from '../lib/audit.js';
import { deploymentAvailability } from '../services/availability.js';
import { changeVpsSshKey, dedicatedAddresses, freeDedicatedAddress, ownedVps, reinstallVps, renameVps, setVpsPower, vpsUsage, vpsView } from '../services/vps.js';
import { enqueueVpsProvisioning } from '../services/queue.js';

/**
 * The virtual private servers of a customer.
 *
 * The plans are public, because a visitor reads them before they make an account.
 * Everything else belongs to the account that bought the server.
 */
export async function registerVpsRoutes(app: FastifyInstance): Promise<void> {
  /** The plans on sale, with the price of the address of their own. */
  app.get('/vps/plans', async () => {
    const products = await prisma.product.findMany({
      where: { fulfilment: 'VPS', visible: true },
      include: { prices: { where: { active: true, period: 'MONTHLY' }, take: 1 } },
      orderBy: { sortOrder: 'asc' },
    });
    // The address of its own is an option of the platform, not of one plan.
    const dedicatedOption = await prisma.productOption.findFirst({ where: { code: 'dedicated-ipv4', active: true } });
    const dedicatedFree = dedicatedAddresses().length > 0 && (await freeDedicatedAddress()) !== null;
    return {
      plans: products
        .filter((product) => deploymentAvailability(product).orderable)
        .map((product) => {
          const dedicated = dedicatedOption;
          return {
            slug: product.slug,
            name: product.name,
            description: product.description,
            ram: product.minRam,
            cpu: product.minCpu,
            disk: product.minDisk,
            price: product.prices[0] ? { amount: product.prices[0].baseAmount, currency: product.prices[0].currency, period: 'MONTHLY' } : null,
            dedicatedIp: dedicated && dedicatedFree ? { code: dedicated.code, amount: dedicated.amount } : null,
          };
        }),
      sharedAddress: env.VPS_SHARED_IP || null,
    };
  });

  app.get('/vps', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const services = await prisma.vpsService.findMany({
      where: { userId: user.id, status: { not: 'CANCELLED' } },
      include: { product: { select: { slug: true, name: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return { servers: await Promise.all(services.map((service) => vpsView(service))) };
  });

  app.get('/vps/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return { server: await vpsView(await ownedVps(user.id, id)) };
  });

  app.post('/vps/:id/power', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { action } = z.object({ action: z.enum(['start', 'shutdown', 'stop', 'reboot']) }).parse(request.body ?? {});
    await setVpsPower(user.id, id, action);
    await audit({ actorId: user.id, actorEmail: user.email, action: `vps.${action}`, targetType: 'vps', targetId: id, meta: {} });
    return { server: await vpsView(await ownedVps(user.id, id)) };
  });

  app.get('/vps/:id/usage', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    return { usage: await vpsUsage(user.id, id) };
  });

  app.patch('/vps/:id', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { name } = z.object({ name: z.string().max(60) }).parse(request.body ?? {});
    await renameVps(user.id, id, name);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'vps.rename', targetType: 'vps', targetId: id, meta: {} });
    return { server: await vpsView(await ownedVps(user.id, id)) };
  });

  app.put('/vps/:id/ssh-key', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { sshPublicKey } = z.object({ sshPublicKey: z.string().max(1000) }).parse(request.body ?? {});
    await changeVpsSshKey(user.id, id, sshPublicKey);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'vps.ssh-key', targetType: 'vps', targetId: id, meta: {} });
    return { server: await vpsView(await ownedVps(user.id, id)) };
  });

  app.post('/vps/:id/reinstall', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const body = z.object({ sshPublicKey: z.string().max(1000).optional(), confirm: z.literal(true) }).parse(request.body ?? {});
    await reinstallVps(user.id, id, body.sshPublicKey);
    await enqueueVpsProvisioning(id, { reason: 'reinstall' });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'vps.reinstall', targetType: 'vps', targetId: id, meta: {} });
    return { server: await vpsView(await ownedVps(user.id, id)) };
  });
}

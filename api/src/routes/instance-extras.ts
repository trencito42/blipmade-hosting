import { randomBytes } from 'node:crypto';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { z } from 'zod';
import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest, forbidden, unavailable } from '../lib/errors.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, requireAuth } from '../plugins/auth.js';
import { instanceRetentions } from '../services/billing.js';
import * as operations from '../services/panel/operations.js';
import * as application from '../services/pterodactyl/application.js';

/**
 * Small tools of a service that belong to its owner: the SFTP login, the alerts on its resources, and the list of the
 * services that are closed and when their files are removed.
 */
export async function registerInstanceExtraRoutes(app: FastifyInstance): Promise<void> {
  const write = {
    config: { rateLimit: { max: 10, timeWindow: '1 hour', keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.panel),
  };

  async function owned(request: FastifyRequest) {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const instance = await operations.loadOwnedInstance(user.id, id, request.method, request.url);
    return { user, instance };
  }

  // --- SFTP -------------------------------------------------------------------------------------------------------
  // The login is `<panel name>.<server id>` on the SFTP port of the node. The password is the one of the panel account,
  // which the customer never had; it is made here, shown once, and it can be made again.
  app.get('/instances/:id/sftp', async (request: FastifyRequest) => {
    const { user, instance } = await owned(request);
    if (instance.userId !== user.id) throw forbidden('Only the owner of the service can use SFTP.');
    const token = await operations.customerToken(instance);
    const [server, row] = await Promise.all([
      operations.serverInfo(token, instance),
      prisma.user.findUnique({ where: { id: user.id }, select: { pterodactylUserId: true } }),
    ]);
    if (!row?.pterodactylUserId) throw unavailable('The panel account of this customer is not ready yet.');
    const panelUser = await application.getUser(Number(row.pterodactylUserId));
    return { host: env.GAME_PUBLIC_HOST || null, port: 2022, username: `${panelUser.username}.${server.identifier}` };
  });

  app.post('/instances/:id/sftp/password', write, async (request: FastifyRequest) => {
    const { user, instance } = await owned(request);
    if (instance.userId !== user.id) throw forbidden('Only the owner of the service can use SFTP.');
    const row = await prisma.user.findUnique({ where: { id: user.id }, select: { pterodactylUserId: true } });
    if (!row?.pterodactylUserId) throw unavailable('The panel account of this customer is not ready yet.');
    // 24 letters and digits, made here. The old password stops working at once.
    const alphabet = 'ABCDEFGHJKLMNPQRSTUVWXYZabcdefghijkmnpqrstuvwxyz23456789';
    const password = Array.from(randomBytes(24), (byte) => alphabet[byte % alphabet.length]).join('');
    await application.setUserPassword(Number(row.pterodactylUserId), password);
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.sftp_password_made', targetType: 'instance', targetId: instance.id, ip: request.ip });
    return { password };
  });

  // --- alerts on the use of the resources ----------------------------------------------------------------------------
  app.get('/instances/:id/resource-alerts', async (request: FastifyRequest) => {
    const { instance } = await owned(request);
    const row = await prisma.instance.findUnique({ where: { id: instance.id }, select: { alertMemoryPercent: true, alertDiskPercent: true } });
    return { memoryPercent: row?.alertMemoryPercent ?? null, diskPercent: row?.alertDiskPercent ?? null };
  });

  app.put('/instances/:id/resource-alerts', write, async (request: FastifyRequest) => {
    const { user, instance } = await owned(request);
    if (instance.userId !== user.id) throw forbidden('Only the owner of the service can set alerts.');
    const percent = z.number().int().min(50, 'Use 50 to 99.').max(99, 'Use 50 to 99.').nullable();
    const body = z.object({ memoryPercent: percent, diskPercent: percent }).parse(request.body ?? {});
    await prisma.instance.update({ where: { id: instance.id }, data: { alertMemoryPercent: body.memoryPercent, alertDiskPercent: body.diskPercent, resourceAlertedAt: null } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'instance.resource_alerts', targetType: 'instance', targetId: instance.id, meta: body });
    return body;
  });

  // --- services that are closed ----------------------------------------------------------------------------------------
  app.get('/billing/closed-services', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const records = Object.values(await instanceRetentions()).filter((record) => record.userId === user.id && !record.deletedAt);
    if (records.length === 0) return { services: [] };
    const names = await prisma.instance.findMany({ where: { id: { in: records.map((record) => record.instanceId) } }, select: { id: true, name: true } });
    const byId = new Map(names.map((row) => [row.id, row.name]));
    return {
      services: records.map((record) => ({ id: record.instanceId, name: byId.get(record.instanceId) ?? 'Service', cancelledAt: record.cancelledAt, deletedOn: record.scheduledFor })),
    };
  });

  app.get('/instances/:id/addons', async (request: FastifyRequest) => {
    const { instance } = await owned(request);
    const variant = await prisma.catalogVariant.findUnique({
      where: { productId: instance.productId },
      include: {
        family: {
          include: {
            addons: { where: { active: true }, include: { compatibilities: { select: { variantId: true } } } },
          },
        },
      },
    });
    const addons = (variant?.family.addons ?? []).filter(
      (addon) => addon.compatibilities.length === 0 || addon.compatibilities.some((row) => row.variantId === variant.id),
    );
    return {
      addons: addons.map((addon) => ({
        slug: addon.slug,
        name: addon.name,
        summary: addon.summary,
        kind: addon.kind,
        install: addon.kind === 'SOFTWARE' ? 'Use the Minecraft or game tab after a backup. This route does not write files.' : 'Priced add-ons stay on the order. They are not installed from this list.',
      })),
      note: 'Live runtime files are not changed here.',
    };
  });
}

import { prisma } from '../db.js';
import { BLIPMADE_DIR, parseEnvValues, renderEnv } from './git-deploy.js';
import * as application from './pterodactyl/application.js';
import * as client from './pterodactyl/client.js';
import * as operations from './panel/operations.js';
import { connectionVariable, type ServiceEndpoint } from './project-links.js';

/**
 * Writes confirmed database URLs into the application container after every
 * confirmed companion is online. Nothing is linked that the customer did not confirm.
 */
/** Connects confirmed databases for one import. Safe before the application build. */
export async function linkImportDependencies(sourceId: string): Promise<boolean> {
  return linkOne(sourceId);
}

export async function linkConfirmedServices(): Promise<number> {
  const sources = await prisma.importSource.findMany({
    where: {
      servicesLinkedAt: null,
      instanceId: { not: null },
      NOT: { confirmedServices: { isEmpty: true } },
    },
    take: 10,
    orderBy: { createdAt: 'asc' },
  });
  let linked = 0;
  for (const source of sources) {
    if (await linkOne(source.id)) linked += 1;
  }
  return linked;
}

async function linkOne(sourceId: string): Promise<boolean> {
  const source = await prisma.importSource.findUnique({ where: { id: sourceId } });
  if (!source?.instanceId || source.servicesLinkedAt || source.confirmedServices.length === 0) return false;
  const app = await prisma.instance.findUnique({
    where: { id: source.instanceId },
    include: { product: { select: { generatedVariables: true } } },
  });
  if (!app?.orderId || app.status !== 'ONLINE' || !app.pterodactylUuid || !app.pterodactylServerId) return false;
  const companions = await prisma.instance.findMany({
    where: { orderId: app.orderId, userId: app.userId, status: 'ONLINE', product: { slug: { in: source.confirmedServices } } },
    include: { product: { select: { slug: true, generatedVariables: true } } },
  });
  if (source.confirmedServices.some((slug) => !companions.some((row) => row.product.slug === slug))) return false;

  const values: Record<string, string> = {};
  for (const companion of companions) {
    if (!companion.pterodactylServerId || !companion.pterodactylUuid) return false;
    const server = await application.getServer(companion.pterodactylServerId);
    const token = await operations.customerToken({
      id: companion.id,
      userId: companion.userId,
      pterodactylUuid: companion.pterodactylUuid,
      pterodactylServerId: companion.pterodactylServerId,
      status: companion.status,
      generatedVariables: companion.generatedVariables,
      productVariables: companion.product.generatedVariables,
    });
    const allocations = await client.listAllocations(token, companion.pterodactylUuid);
    const primary = allocations.find((entry) => entry.is_default) ?? allocations[0];
    const environment = server.container.environment ?? {};
    const endpoint: ServiceEndpoint = {
      slug: companion.product.slug,
      user: environment.PGUSER || 'pterodactyl',
      password: companion.product.slug === 'redis' ? environment.SERVER_PASSWORD || '' : environment.PGPASSWORD || '',
      host: primary?.ip ?? '',
      port: primary?.port ?? 0,
      database: environment.PGUSER || 'pterodactyl',
    };
    const variable = connectionVariable(endpoint);
    if (!variable || !endpoint.password) return false;
    values[variable.key] = variable.value;
  }

  const appToken = await operations.customerToken({
    id: app.id,
    userId: app.userId,
    pterodactylUuid: app.pterodactylUuid,
    pterodactylServerId: app.pterodactylServerId,
    status: app.status,
    generatedVariables: app.generatedVariables,
    productVariables: app.product.generatedVariables,
  });
  const current = await client.readFile(appToken, app.pterodactylUuid, `${BLIPMADE_DIR}/app.env`).catch(() => ({ content: '', encoding: 'utf-8' }));
  const merged = { ...parseEnvValues(current.content), ...values };
  await client.writeFile(appToken, app.pterodactylUuid, `${BLIPMADE_DIR}/app.env`, renderEnv(merged));
  await client.chmodFile(appToken, app.pterodactylUuid, `${BLIPMADE_DIR}/app.env`, 0o600).catch(() => undefined);
  await client.sendPower(appToken, app.pterodactylUuid, 'restart');
  await prisma.importSource.update({ where: { id: source.id }, data: { servicesLinkedAt: new Date() } });
  await prisma.instanceEvent.create({
    data: { instanceId: app.id, type: 'deploy', message: `Connected ${source.confirmedServices.join(', ')}. The credentials stay in the server.` },
  });
  return true;
}

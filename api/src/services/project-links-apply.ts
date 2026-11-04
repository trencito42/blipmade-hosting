import { prisma } from '../db.js';
import { BLIPMADE_DIR, parseEnvValues, renderEnv } from './git-deploy.js';
import * as application from './pterodactyl/application.js';
import * as client from './pterodactyl/client.js';
import * as operations from './panel/operations.js';
import { connectionVariable, dependencyReady, mariadbGrantCommand, mariadbGrantSql, mariadbPassword, type ServiceEndpoint, ATTACHED_MYSQL } from './project-links.js';
import { companionProduct } from './import-dependencies.js';
import { generateSecret, openVariables, sealVariables } from './instance-credentials.js';
import { probeTcpPort } from './domain-activation.js';
import { databasesIncluded } from '../lib/plan-limits.js';

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

  const wantsAttached = source.confirmedServices.includes(ATTACHED_MYSQL);
  const companionSlugs = source.confirmedServices.filter((slug) => companionProduct(slug));
  const values: Record<string, string> = {};

  if (wantsAttached) {
    const attached = await linkAttachedMysql(app as LinkedApp & { pterodactylUuid: string }, source.id);
    if (!attached) return false;
    values[attached.key] = attached.value;
  }

  if (companionSlugs.length > 0) {
    const companions = await prisma.instance.findMany({
      where: { orderId: app.orderId, userId: app.userId, status: 'ONLINE', product: { slug: { in: companionSlugs } } },
      include: { product: { select: { slug: true, generatedVariables: true } } },
    });
    if (companionSlugs.some((slug) => !companions.some((row) => row.product.slug === slug))) return false;

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
    const password = await companionPassword(companion, environment);
    const endpoint: ServiceEndpoint = {
      slug: companion.product.slug,
      user: companion.product.slug === 'mariadb' ? 'blipmade' : environment.PGUSER || 'pterodactyl',
      password,
      host: primary?.ip ?? '',
      port: primary?.port ?? 0,
      database: companion.product.slug === 'mariadb' ? 'blipmade' : environment.PGUSER || 'pterodactyl',
    };
    const variable = connectionVariable(endpoint);
    const portOpen = variable ? await probeTcpPort(endpoint.host, endpoint.port) : false;
    if (!variable || !endpoint.password || !dependencyReady({ online: true, portOpen })) return false;
    if (companion.product.slug === 'mariadb') {
      const granted = await grantMariaDb(token, companion.pterodactylUuid, password);
      if (!granted) return false;
    }
      values[variable.key] = variable.value;
    }
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
  await prisma.importSource.update({ where: { id: source.id }, data: { servicesLinkedAt: new Date() } });
  await prisma.instanceEvent.create({
    data: { instanceId: app.id, type: 'deploy', message: `Connected ${source.confirmedServices.join(', ')}. The credentials stay in the server.` },
  });
  return true;
}

type LinkedApp = {
  id: string;
  userId: string;
  ram: number;
  pterodactylUuid: string;
  pterodactylServerId: number | null;
  status: string;
  generatedVariables: string | null;
  product: { generatedVariables: unknown };
};

function owned(app: LinkedApp) {
  return {
    id: app.id,
    userId: app.userId,
    pterodactylUuid: app.pterodactylUuid,
    pterodactylServerId: app.pterodactylServerId,
    status: app.status,
    generatedVariables: app.generatedVariables,
    productVariables: app.product.generatedVariables,
  };
}

/** Creates or reuses a panel database on the application server and returns DATABASE_URL parts. */
async function linkAttachedMysql(app: LinkedApp, sourceId: string): Promise<{ key: string; value: string } | null> {
  const instance = owned(app);
  const token = await operations.customerToken(instance);
  const server = await operations.serverInfo(token, instance);
  if (databasesIncluded(app.ram) < 1 || server.feature_limits.databases < 1) return null;
  const safe = sourceId.replace(/[^a-z0-9]/gi, '').slice(0, 16).toLowerCase() || 'import';
  const wantedName = `blip_${safe}`;
  const rows = await operations.databases(token, instance);
  let row = rows.find((entry) => entry.name === wantedName || entry.name.includes(wantedName));
  if (!row && rows.length >= server.feature_limits.databases) return null;
  if (!row) {
    await operations.createDatabase(token, instance, { database: wantedName, remote: '%' });
    const fresh = await operations.databases(token, instance);
    row = fresh.find((entry) => entry.name === wantedName || entry.name.includes(wantedName));
  }
  if (!row?.id) return null;
  let creds = await operations.databaseCredentials(token, instance, row.id);
  if (!creds.password) {
    await operations.updateDatabase(token, instance, row.id, {});
    creds = await operations.databaseCredentials(token, instance, row.id);
  }
  if (!creds.password) return null;
  const endpoint: ServiceEndpoint = {
    slug: ATTACHED_MYSQL,
    user: creds.username,
    password: creds.password,
    host: creds.host,
    port: creds.port,
    database: creds.name,
  };
  const variable = connectionVariable(endpoint);
  if (!variable) return null;
  const portOpen = await probeTcpPort(endpoint.host, endpoint.port);
  if (!dependencyReady({ online: true, portOpen })) return null;
  return variable;
}

async function companionPassword(
  companion: { id: string; product: { slug: string }; generatedVariables: string | null },
  environment: Record<string, string>,
): Promise<string> {
  if (companion.product.slug === 'redis') return environment.SERVER_PASSWORD || '';
  if (companion.product.slug !== 'mariadb') return environment.PGPASSWORD || '';
  const stored = openVariables(companion.generatedVariables);
  const existing = mariadbPassword(stored?.DB_PASSWORD);
  if (existing) return existing;
  const password = generateSecret(20);
  const next = { ...(stored ?? {}), DB_PASSWORD: password };
  await prisma.instance.update({ where: { id: companion.id }, data: { generatedVariables: sealVariables(next) } });
  return password;
}

/** Writes the grant, asks the MariaDB client to run it, then removes the file that holds the password. */
async function grantMariaDb(token: string, uuid: string, password: string): Promise<boolean> {
  const sql = mariadbGrantSql(password);
  if (!sql) return false;
  const path = `${BLIPMADE_DIR}/grant.sql`;
  await client.writeFile(token, uuid, path, sql);
  await client.chmodFile(token, uuid, path, 0o600).catch(() => undefined);
  await client.sendCommand(token, uuid, mariadbGrantCommand());
  await client.deleteFile(token, uuid, path);
  return true;
}

import { prisma } from '../db.js';
import { catalogInstallPlan, runCatalogInstall } from './catalog-install.js';
import * as operations from './panel/operations.js';
import * as panelClient from './pterodactyl/client.js';
import * as ptero from './pterodactyl/application.js';

interface StoredCatalog {
  preset?: { slug?: string; version?: number } | null;
}

function presetOf(config: unknown): { slug: string; version: number } | null {
  const catalog = (config as { catalog?: StoredCatalog } | null)?.catalog;
  const slug = catalog?.preset?.slug;
  const version = catalog?.preset?.version;
  if (!slug || typeof version !== 'number') return null;
  return { slug, version };
}

function alreadyInstalled(manifest: unknown, presetSlug: string, version: number): boolean {
  const row = manifest as { presetSlug?: string; version?: number; status?: string } | null;
  return row?.status === 'installed' && row.presetSlug === presetSlug && row.version === version;
}

/** Writes the preset chosen at checkout into the customer container. A second pass does not write it again. */
export async function applyCatalogInstall(instanceId: string): Promise<'installed' | 'skipped' | 'failed' | 'none'> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { product: { select: { slug: true, generatedVariables: true } }, orderItem: { select: { config: true } } },
  });
  if (!instance?.pterodactylUuid || !instance.pterodactylServerId) return 'none';
  const preset = presetOf(instance.orderItem?.config);
  if (!preset) {
    if (!(instance.installationManifest as { status?: string } | null)?.status) {
      await prisma.instance.update({ where: { id: instance.id }, data: { installationManifest: { status: 'none', files: [] } } });
    }
    return 'none';
  }
  if (alreadyInstalled(instance.installationManifest, preset.slug, preset.version)) return 'skipped';
  const plan = catalogInstallPlan(instance.product.slug, preset.slug);
  if (!plan) {
    await prisma.instance.update({
      where: { id: instance.id },
      data: { installationManifest: { presetSlug: preset.slug, version: preset.version, status: 'none', files: [] } },
    });
    return 'none';
  }
  try {
    const token = await operations.customerToken({
      id: instance.id,
      userId: instance.userId,
      status: instance.status,
      pterodactylUuid: instance.pterodactylUuid,
      pterodactylServerId: instance.pterodactylServerId,
      generatedVariables: instance.generatedVariables,
      productVariables: instance.product.generatedVariables,
    });
    const files = await runCatalogInstall(plan, {
      read: async (path) => {
        try {
          return (await panelClient.readFile(token, instance.pterodactylUuid as string, path)).content;
        } catch {
          return null;
        }
      },
      write: (path, content) => panelClient.writeFile(token, instance.pterodactylUuid as string, path, content).then(() => undefined),
      startup: async (startup, environment) => {
        const current = await ptero.getServer(instance.pterodactylServerId as number);
        await ptero.updateServerStartup(instance.pterodactylServerId as number, {
          startup: startup ?? current.container.startup_command,
          environment: { ...current.container.environment, ...environment },
          skip_scripts: true,
        });
      },
    });
    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        installationManifest: {
          presetSlug: preset.slug,
          version: preset.version,
          status: 'installed',
          files,
          installedAt: new Date().toISOString(),
        },
      },
    });
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'preset', message: `Installed the ${preset.slug} preset.` },
    });
    return 'installed';
  } catch (error) {
    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        installationManifest: {
          presetSlug: preset.slug,
          version: preset.version,
          status: 'failed',
          error: error instanceof Error ? error.message : 'The preset could not be installed.',
        },
      },
    });
    return 'failed';
  }
}

/** Retries presets that were chosen and have not been installed. */
export async function retryCatalogInstalls(): Promise<number> {
  const rows = await prisma.instance.findMany({
    where: { status: 'ONLINE', pterodactylUuid: { not: null }, orderItemId: { not: null } },
    select: { id: true, installationManifest: true },
    take: 20,
    orderBy: { createdAt: 'asc' },
  });
  let count = 0;
  for (const row of rows) {
    const manifest = row.installationManifest as { status?: string } | null;
    if (manifest?.status === 'installed' || manifest?.status === 'none') continue;
    const result = await applyCatalogInstall(row.id);
    if (result === 'installed') count += 1;
  }
  return count;
}

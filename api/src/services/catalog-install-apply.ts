import { prisma } from '../db.js';
import { catalogInstallPlan, presetOutcome, runCatalogInstall } from './catalog-install.js';
import * as operations from './panel/operations.js';
import * as panelClient from './pterodactyl/client.js';
import * as ptero from './pterodactyl/application.js';
import { modpackFilesFor, pluginFileFor } from './minecraft.js';

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

async function verifyPreset(
  instance: { id: string; pterodactylUuid: string | null; userId: string; status: string; pterodactylServerId: number | null; generatedVariables: string | null; product: { generatedVariables: unknown }; orderId: string | null },
  preset: { slug: string; version: number },
  attempts: number,
  files: string[] = [],
): Promise<'installed' | 'failed'> {
  const token = await operations.customerToken({
    id: instance.id,
    userId: instance.userId,
    status: instance.status,
    pterodactylUuid: instance.pterodactylUuid,
    pterodactylServerId: instance.pterodactylServerId,
    generatedVariables: instance.generatedVariables,
    productVariables: instance.product.generatedVariables,
  });
  const resources = await panelClient.getResources(token, instance.pterodactylUuid as string);
  if (resources.state === 'starting' || resources.state === 'stopping' || resources.state === '') return 'failed';
  const outcome = presetOutcome(resources.state, attempts);
  if (outcome === 'retry') return 'failed';
  const installed = outcome === 'installed';
  await prisma.instance.update({
    where: { id: instance.id },
    data: {
      applicationReadyAt: installed ? new Date() : null,
      applicationError: installed ? null : 'The preset was written, but the server did not stay running.',
      installationManifest: {
        presetSlug: preset.slug,
        version: preset.version,
        status: installed ? 'installed' : 'gave_up',
        files,
        attempts,
        installedAt: installed ? new Date().toISOString() : null,
      },
    },
  });
  await prisma.instanceEvent.create({
    data: {
      instanceId: instance.id,
      type: 'preset',
      message: installed ? `The ${preset.slug} preset is running.` : `The ${preset.slug} preset did not stay running after ${attempts} tries.`,
    },
  });
  return installed ? 'installed' : 'failed';
}

/** Writes the preset chosen at checkout into the customer container. Installed means the process was running afterwards. */
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
  const previous = instance.installationManifest as { status?: string; attempts?: number; presetSlug?: string; version?: number } | null;
  if (previous?.status === 'gave_up' && previous.presetSlug === preset.slug && previous.version === preset.version) return 'failed';
  if (previous?.status === 'verifying' && previous.presetSlug === preset.slug && previous.version === preset.version) {
    return verifyPreset(instance, preset, previous.attempts ?? 1, (previous as { files?: string[] }).files ?? []);
  }
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
    const attempts = (previous?.attempts ?? 0) + 1;
    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        applicationReadyAt: null,
        installationManifest: {
          presetSlug: preset.slug,
          version: preset.version,
          status: 'verifying',
          files,
          attempts,
        },
      },
    });
    await panelClient.sendPower(token, instance.pterodactylUuid, 'restart').catch(() => undefined);
    return verifyPreset(instance, preset, attempts, files);
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
    where: {
      status: 'ONLINE',
      pterodactylUuid: { not: null },
      OR: [
        { installationManifest: { path: ['status'], equals: 'verifying' } },
        { installationManifest: { path: ['status'], equals: 'failed' } },
        { installationManifest: { path: ['status'], equals: 'installing' } },
      ],
    },
    select: { id: true, installationManifest: true },
    take: 20,
    orderBy: { updatedAt: 'asc' },
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

interface OrderInstall {
  gameVersion?: string;
  plugins?: { slug: string; version: string }[];
  modpack?: { slug: string; version: string };
}

/** Downloads Modrinth plugins or modpack files chosen at checkout into the running server. */
export async function applyCatalogOrderInstall(instanceId: string): Promise<'installed' | 'skipped' | 'failed' | 'none'> {
  const instance = await prisma.instance.findUnique({
    where: { id: instanceId },
    include: { product: { select: { slug: true, generatedVariables: true } }, orderItem: { select: { config: true } } },
  });
  if (!instance?.pterodactylUuid || !instance.orderItem?.config) return 'none';
  const install = (instance.orderItem.config as { catalog?: { install?: OrderInstall } }).catalog?.install;
  if (!install?.gameVersion && !install?.plugins?.length && !install?.modpack) return 'none';
  const manifest = instance.installationManifest as { orderInstall?: { status?: string } } | null;
  if (manifest?.orderInstall?.status === 'installed') return 'skipped';

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
    const uuid = instance.pterodactylUuid;
    const files: string[] = [];
    const version = install.gameVersion ?? '';
    if (install.plugins?.length && version && instance.product.slug === 'minecraft-paper') {
      try { await panelClient.createFolder(token, uuid, '/plugins'); } catch { /* exists */ }
      for (const plugin of install.plugins) {
        const file = await pluginFileFor(plugin.slug, version);
        await panelClient.pullFile(token, uuid, file.url, '/plugins', file.filename);
        files.push(`/plugins/${file.filename}`);
      }
    }
    if (install.modpack && version && instance.product.slug === 'minecraft-forge') {
      const pack = await modpackFilesFor(install.modpack.slug, version);
      for (const file of pack.files) {
        try { await panelClient.createFolder(token, uuid, file.directory); } catch { /* exists */ }
        await panelClient.pullFile(token, uuid, file.url, file.directory, file.filename);
        files.push(`${file.directory}/${file.filename}`);
      }
    }
    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        installationManifest: {
          ...(instance.installationManifest as object | null),
          orderInstall: { status: 'installed', files, installedAt: new Date().toISOString() },
        },
      },
    });
    await prisma.instanceEvent.create({
      data: { instanceId: instance.id, type: 'preset', message: files.length ? `Checkout install wrote ${files.length} file(s). Restart the server to load them.` : 'Checkout install finished.' },
    });
    return files.length ? 'installed' : 'none';
  } catch (error) {
    await prisma.instance.update({
      where: { id: instance.id },
      data: {
        installationManifest: {
          ...(instance.installationManifest as object | null),
          orderInstall: { status: 'failed', error: error instanceof Error ? error.message : 'Install failed.' },
        },
      },
    });
    return 'failed';
  }
}

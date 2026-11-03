import { randomUUID } from 'node:crypto';
import { prisma } from '../db.js';
import { installArchive, installGit } from './git-deploy.js';
import * as operations from './panel/operations.js';
import { enqueueGitDeploy } from './queue.js';
import type { Instance } from '@prisma/client';

/** After a server exists, build the project the customer approved. Failure is an event, not a second server. */
export async function applyStoredImport(instance: Instance): Promise<void> {
  if (!instance.orderItemId || !instance.pterodactylUuid || !instance.pterodactylServerId) return;
  const item = await prisma.orderItem.findUnique({ where: { id: instance.orderItemId }, select: { config: true } });
  const importSourceId = (item?.config as { importSourceId?: unknown } | null)?.importSourceId;
  if (typeof importSourceId !== 'string' || !importSourceId) return;
  const source = await prisma.importSource.findFirst({ where: { id: importSourceId, userId: instance.userId, appliedAt: null } });
  if (!source) return;
  const owned = await operations.loadOwnedInstance(instance.userId, instance.id);
  if (source.kind === 'git' && source.repoUrl) {
    const installed = await installGit(owned, {
      repoUrl: source.repoUrl,
      branch: source.branch || 'main',
      buildCommand: source.buildCommand,
      startCommand: source.startCommand,
    }, null);
    await prisma.gitDeploy.upsert({
      where: { instanceId: instance.id },
      create: { instanceId: instance.id, repoUrl: source.repoUrl, branch: source.branch || 'main', buildCommand: source.buildCommand, startCommand: source.startCommand, previousStartup: installed.previousStartup },
      update: { repoUrl: source.repoUrl, branch: source.branch || 'main', buildCommand: source.buildCommand, startCommand: source.startCommand },
    });
    await enqueueGitDeploy({ instanceId: instance.id, deployId: randomUUID(), action: 'build', by: 'import' });
  } else if (source.kind === 'zip' && source.zipBytes) {
    const installed = await installArchive(owned, { buildCommand: source.buildCommand, startCommand: source.startCommand }, Buffer.from(source.zipBytes));
    await prisma.gitDeploy.upsert({
      where: { instanceId: instance.id },
      create: { instanceId: instance.id, repoUrl: 'archive://project', branch: 'upload', buildCommand: source.buildCommand, startCommand: source.startCommand, previousStartup: installed.previousStartup },
      update: { repoUrl: 'archive://project', branch: 'upload', buildCommand: source.buildCommand, startCommand: source.startCommand },
    });
    await enqueueGitDeploy({ instanceId: instance.id, deployId: randomUUID(), action: 'archive', by: 'import' });
  } else {
    return;
  }
  await prisma.importSource.update({ where: { id: source.id }, data: { appliedAt: new Date() } });
  await prisma.instanceEvent.create({ data: { instanceId: instance.id, type: 'deploy', message: 'The imported project was handed to this server to build.' } });
}

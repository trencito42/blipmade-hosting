import { randomUUID } from 'node:crypto';
import { prisma } from '../../db.js';
import { enqueueGitDeploy } from '../queue.js';

/** Queue auto-deploy for instances linked to this GitHub repository and branch. */
export async function enqueueGithubPushDeploy(input: { repositoryId: string; branch: string; after: string | null }): Promise<void> {
  const imports = await prisma.importSource.findMany({
    where: {
      githubRepositoryId: input.repositoryId,
      branch: input.branch,
      phase: 'applied',
      instanceId: { not: null },
    },
    select: { instanceId: true },
  });
  for (const row of imports) {
    if (!row.instanceId) continue;
    const git = await prisma.gitDeploy.findFirst({
      where: { instanceId: row.instanceId, autoDeploy: true },
      orderBy: { updatedAt: 'desc' },
    });
    if (!git) continue;
    await enqueueGitDeploy({
      instanceId: row.instanceId,
      deployId: randomUUID(),
      action: 'build',
      by: `github-app push ${input.branch}`,
    });
  }
}

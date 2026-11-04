import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { githubAppJwt, mintInstallationToken } from './client.js';

/** Fetches account login/type from GitHub for an installation row. */
export async function refreshInstallationProfile(installationDbId: string): Promise<void> {
  const row = await prisma.gitHubAppInstallation.findUnique({ where: { id: installationDbId } });
  if (!row) return;
  const jwt = githubAppJwt();
  const res = await fetch(`https://api.github.com/app/installations/${row.installationId}`, {
    headers: { Authorization: `Bearer ${jwt}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Blipmade' },
  });
  if (!res.ok) return;
  const inst = (await res.json()) as {
    account?: { login?: string; type?: string };
    repository_selection?: string;
  };
  if (!inst.account?.login) return;
  await prisma.gitHubAppInstallation.update({
    where: { id: installationDbId },
    data: {
      accountLogin: inst.account.login,
      accountType: inst.account.type ?? row.accountType,
      repositorySelection: inst.repository_selection ?? row.repositorySelection,
    },
  });
}

export async function syncInstallationRepositories(installationDbId: string): Promise<number> {
  await refreshInstallationProfile(installationDbId);
  const row = await prisma.gitHubAppInstallation.findUnique({ where: { id: installationDbId } });
  if (!row) return 0;
  const token = await mintInstallationToken(row.installationId);
  const res = await fetch(`https://api.github.com/installation/repositories?per_page=100`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Blipmade' },
  });
  if (!res.ok) return 0;
  const json = (await res.json()) as {
    repositories: { id: number; full_name: string; default_branch?: string; private: boolean }[];
  };
  let count = 0;
  for (const repo of json.repositories ?? []) {
    await prisma.gitHubAuthorizedRepository.upsert({
      where: { installationId_repositoryId: { installationId: installationDbId, repositoryId: String(repo.id) } },
      create: {
        installationId: installationDbId,
        repositoryId: String(repo.id),
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? 'main',
        isPrivate: repo.private,
        revokedAt: null,
        syncedAt: new Date(),
      },
      update: {
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? 'main',
        isPrivate: repo.private,
        revokedAt: null,
        syncedAt: new Date(),
      },
    });
    count += 1;
  }
  return count;
}

export async function listUserRepositories(userId: string, query: string | undefined) {
  const installations = await prisma.gitHubAppInstallation.findMany({
    where: { userId, suspendedAt: null },
    include: {
      repositories: { where: { revokedAt: null }, orderBy: { fullName: 'asc' } },
    },
  });
  const q = query?.trim().toLowerCase() ?? '';
  const repos = installations.flatMap((inst) =>
    inst.repositories
      .filter((r) => !q || r.fullName.toLowerCase().includes(q))
      .map((r) => ({
        installationId: inst.id,
        githubInstallationId: inst.installationId,
        accountLogin: inst.accountLogin,
        repositoryId: r.repositoryId,
        fullName: r.fullName,
        defaultBranch: r.defaultBranch,
        isPrivate: r.isPrivate,
        syncedAt: r.syncedAt.toISOString(),
      })),
  );
  return { repositories: repos, githubAppEnabled: env.githubAppEnabled };
}

export async function revokeInstallationRepositories(
  installationDbId: string,
  repositoryIds: string[],
): Promise<number> {
  if (repositoryIds.length === 0) return 0;
  const res = await prisma.gitHubAuthorizedRepository.updateMany({
    where: { installationId: installationDbId, repositoryId: { in: repositoryIds }, revokedAt: null },
    data: { revokedAt: new Date() },
  });
  return res.count;
}

export async function upsertInstallationRepositories(
  installationDbId: string,
  repos: { id: number; full_name: string; default_branch?: string; private: boolean }[],
): Promise<number> {
  let count = 0;
  for (const repo of repos) {
    await prisma.gitHubAuthorizedRepository.upsert({
      where: { installationId_repositoryId: { installationId: installationDbId, repositoryId: String(repo.id) } },
      create: {
        installationId: installationDbId,
        repositoryId: String(repo.id),
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? 'main',
        isPrivate: repo.private,
        revokedAt: null,
        syncedAt: new Date(),
      },
      update: {
        fullName: repo.full_name,
        defaultBranch: repo.default_branch ?? 'main',
        isPrivate: repo.private,
        revokedAt: null,
        syncedAt: new Date(),
      },
    });
    count += 1;
  }
  return count;
}

export async function listRepositoryBranches(
  userId: string,
  installationDbId: string,
  repositoryId: string,
): Promise<{ branches: string[] }> {
  const { installation } = await assertUserRepositoryAccess(userId, installationDbId, repositoryId);
  const token = await mintInstallationToken(installation.installationId);
  const branches: string[] = [];
  let page = 1;
  for (;;) {
    const res = await fetch(
      `https://api.github.com/repositories/${repositoryId}/branches?per_page=100&page=${page}`,
      { headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github+json', 'User-Agent': 'Blipmade' } },
    );
    if (!res.ok) break;
    const batch = (await res.json()) as { name: string }[];
    if (!batch.length) break;
    branches.push(...batch.map((b) => b.name));
    if (batch.length < 100) break;
    page += 1;
    if (page > 10) break;
  }
  return { branches };
}

export async function assertUserRepositoryAccess(userId: string, installationDbId: string, repositoryId: string) {
  const inst = await prisma.gitHubAppInstallation.findFirst({
    where: { id: installationDbId, userId, suspendedAt: null },
    include: { repositories: { where: { repositoryId, revokedAt: null } } },
  });
  if (!inst || inst.repositories.length === 0) {
    const { forbidden } = await import('../../lib/errors.js');
    throw forbidden('This repository is not authorized for your account.');
  }
  return { installation: inst, repo: inst.repositories[0]! };
}

export async function cloneUrlForRepository(installationDbId: string, repositoryId: string): Promise<{ url: string; fullName: string; branch: string }> {
  const row = await prisma.gitHubAppInstallation.findUnique({
    where: { id: installationDbId },
    include: { repositories: { where: { repositoryId, revokedAt: null } } },
  });
  if (!row || row.repositories.length === 0) throw new Error('repository not authorized');
  const token = await mintInstallationToken(row.installationId);
  const repo = row.repositories[0]!;
  return {
    url: `https://x-access-token:${token}@github.com/${repo.fullName}.git`,
    fullName: repo.fullName,
    branch: repo.defaultBranch,
  };
}

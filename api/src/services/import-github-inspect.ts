import { mintInstallationToken } from './github-app/client.js';
import { assertUserRepositoryAccess } from './github-app/repositories.js';
import { inspectManifests, type ImportProposal } from './import-inspect.js';

async function fetchRepoFile(token: string, fullName: string, path: string): Promise<string | null> {
  const res = await fetch(`https://api.github.com/repos/${fullName}/contents/${path}`, {
    headers: { Authorization: `Bearer ${token}`, Accept: 'application/vnd.github.raw', 'User-Agent': 'Blipmade' },
  });
  if (!res.ok) return null;
  return res.text();
}

export async function inspectGithubRepository(userId: string, installationDbId: string, repositoryId: string, branch?: string): Promise<ImportProposal & { fullName: string; defaultBranch: string; isPrivate: boolean }> {
  const { installation, repo } = await assertUserRepositoryAccess(userId, installationDbId, repositoryId);
  const token = await mintInstallationToken(installation.installationId);
  const branchName = branch || repo.defaultBranch;
  const paths = ['package.json', 'requirements.txt', 'pyproject.toml', 'composer.json', 'prisma/schema.prisma', '.env.example'];
  const files: { path: string; text: string }[] = [];
  for (const path of paths) {
    const text = await fetchRepoFile(token, repo.fullName, path);
    if (text) files.push({ path, text });
  }
  const proposal = inspectManifests(files);
  return {
    ...proposal,
    fullName: repo.fullName,
    defaultBranch: branchName,
    isPrivate: repo.isPrivate,
  };
}

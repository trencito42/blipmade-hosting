import { createHash } from 'node:crypto';
import { beforeEach, describe, expect, it, vi } from 'vitest';

const db = vi.hoisted(() => ({
  findMany: vi.fn(),
  findFirst: vi.fn(),
  updateMany: vi.fn(),
  findUnique: vi.fn(),
}));

vi.mock('../src/db.js', () => ({
  prisma: {
    isolatedBuildJob: db,
  },
}));

vi.mock('../src/services/github-app/client.js', () => ({ mintInstallationToken: vi.fn() }));

import { cancelIsolatedBuild, runPendingIsolatedBuilds } from '../src/services/isolated-build.js';

describe('isolated build worker', () => {
  beforeEach(() => {
    vi.restoreAllMocks();
    db.findMany.mockReset();
    db.findFirst.mockReset();
    db.updateMany.mockReset();
    db.findUnique.mockReset();
    process.env.NODE_ENV = 'test';
    process.env.SMART_DEPLOY_SANDBOX_URL = 'http://127.0.0.1:3210';
    process.env.SMART_DEPLOY_SANDBOX_SECRET = 'worker-test-secret-that-is-long-enough';
  });

  it('claims once, verifies the returned artifact, and persists it', async () => {
    const source = Buffer.from('archive');
    const artifact = Buffer.from('built artifact');
    const artifactSha256 = createHash('sha256').update(artifact).digest('hex');
    db.findMany.mockResolvedValue([{ id: 'job-1' }]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUnique.mockResolvedValue({
      id: 'job-1',
      status: 'running',
      runtime: 'node',
      buildCommand: 'npm run build',
      importSource: {
        kind: 'zip',
        zipBytes: source,
        repoUrl: null,
        branch: null,
        githubRepositoryFullName: null,
        githubInstallation: null,
      },
    });
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'succeeded',
      log: 'built',
      artifactSha256,
      artifactBytesLength: artifact.length,
      artifactBase64: artifact.toString('base64'),
    }), { status: 200, headers: { 'content-type': 'application/json' } }));

    await expect(runPendingIsolatedBuilds()).resolves.toBe(1);
    expect(request).toHaveBeenCalledOnce();
    expect(request.mock.calls[0]?.[1]?.headers).toMatchObject({
      'x-blipmade-signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/),
    });
    expect(db.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'job-1', status: 'running' },
      data: expect.objectContaining({ status: 'succeeded', artifactSha256, artifactBytes: artifact }),
    }));
  });

  it('fails closed when the sandbox lies about the artifact checksum', async () => {
    db.findMany.mockResolvedValue([{ id: 'job-2' }]);
    db.updateMany.mockResolvedValue({ count: 1 });
    db.findUnique.mockResolvedValue({
      id: 'job-2', status: 'running', runtime: 'node', buildCommand: 'npm run build',
      importSource: { kind: 'zip', zipBytes: Buffer.from('archive'), repoUrl: null, branch: null, githubRepositoryFullName: null, githubInstallation: null },
    });
    vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({
      status: 'succeeded', log: 'sandbox checksum mismatch', artifactSha256: '0'.repeat(64), artifactBytesLength: 4, artifactBase64: Buffer.from('evil').toString('base64'),
    }), { status: 200 }));

    await expect(runPendingIsolatedBuilds()).resolves.toBe(1);
    expect(db.updateMany).toHaveBeenLastCalledWith(expect.objectContaining({
      where: { id: 'job-2', status: 'running' },
      data: expect.objectContaining({ status: 'failed', lastError: 'The sandbox artifact failed its checksum.', log: 'sandbox checksum mismatch' }),
    }));
  });

  it('sends a signed remote stop and discards late results', async () => {
    db.findFirst.mockResolvedValue({ id: 'job-3', status: 'running', sandboxHost: 'http://127.0.0.1:3210' });
    db.updateMany.mockResolvedValue({ count: 1 });
    const request = vi.spyOn(globalThis, 'fetch').mockResolvedValue(new Response(JSON.stringify({ status: 'cancelling' }), { status: 202 }));

    await expect(cancelIsolatedBuild('job-3', 'user-1')).resolves.toMatchObject({ ok: true, status: 'cancelled' });
    expect(request).toHaveBeenCalledWith('http://127.0.0.1:3210/builds/job-3', expect.objectContaining({
      method: 'DELETE',
      headers: expect.objectContaining({ 'x-blipmade-signature': expect.stringMatching(/^sha256=[a-f0-9]{64}$/) }),
    }));
    expect(db.updateMany).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'job-3', status: { in: ['planned', 'queued', 'running'] } } }));
  });
});

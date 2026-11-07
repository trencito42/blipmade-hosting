import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { assertSnapshot, buildSnapshot, snapshotSha256, streamHashes } from '../src/services/profile-snapshot.js';

const artifact = {
  slug: 'luckperms', status: 'installed' as const, filename: 'LuckPerms.jar', version: '5.4.0', project: 'luckperms', at: '2026-11-07T00:00:00.000Z',
  releaseId: 'release_1234', source: 'modrinth' as const, sourceProjectId: 'project_1234', sourceUrl: 'https://cdn.modrinth.com/data/x/LuckPerms.jar',
  sha256: 'a'.repeat(64), sourceSha512: 'b'.repeat(128), loader: 'paper', gameVersion: '1.21.1', dependencies: [],
};

function snapshot() {
  return buildSnapshot({
    catalog: { familyId: 'family', variantId: 'variant', productId: 'product', productSlug: 'minecraft-paper', presetVersionId: 'preset-v1' },
    runtime: { productSlug: 'minecraft-paper', loader: 'paper', gameVersion: '1.21.1' },
    resources: { ram: 2048, cpu: 2, disk: 20 },
    manifest: { addons: [artifact] },
  });
}

describe('immutable server profile snapshots', () => {
  it('has a stable hash independent of object key order and rejects tampering', () => {
    const saved = snapshot();
    const hash = snapshotSha256(saved);
    expect(assertSnapshot(saved, hash)).toBe(saved);
    expect(() => assertSnapshot({ ...saved, resources: { ...saved.resources, ram: 4096 } }, hash)).toThrow(/integrity/);
  });

  it('refuses mutable legacy artifacts', () => {
    expect(() => buildSnapshot({
      catalog: { familyId: 'family', variantId: 'variant', productId: 'product', productSlug: 'minecraft-paper', presetVersionId: null },
      runtime: { productSlug: 'minecraft-paper', loader: 'paper', gameVersion: '1.21.1' },
      resources: { ram: 2048, cpu: 2, disk: 20 },
      manifest: { addons: [{ slug: 'luckperms', status: 'installed', filename: 'LuckPerms.jar', version: 'latest', at: 'now' }] },
    })).toThrow(/immutable release identity/);
  });

  it('refuses preset files that have no immutable artifact identity', () => {
    expect(() => buildSnapshot({
      catalog: { familyId: 'family', variantId: 'variant', productId: 'product', productSlug: 'minecraft-paper', presetVersionId: 'preset-v1' },
      runtime: { productSlug: 'minecraft-paper', loader: 'paper', gameVersion: '1.21.1' },
      resources: { ram: 2048, cpu: 2, disk: 20 },
      manifest: { orderInstall: { files: ['/plugins/latest.jar'] } },
    })).toThrow(/without immutable release checksums/);
  });

  it('hashes the bytes actually read from the server', async () => {
    const hashes = await streamHashes(Readable.from([Buffer.from('abc'), Buffer.from('123')]));
    expect(hashes.bytes).toBe(6);
    expect(hashes.sha256).toBe('6ca13d52ca70c883e0f0bb101e425a89e8624de51db2d2392593af6a84118090');
  });
});

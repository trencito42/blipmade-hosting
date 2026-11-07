import { createHash } from 'node:crypto';
import type { Readable } from 'node:stream';
import { badRequest } from '../lib/errors.js';
import { installedArtifacts, type InstalledArtifact } from './addon-lifecycle.js';

export interface ServerProfileSnapshot {
  version: 1;
  catalog: {
    familyId: string;
    variantId: string;
    productId: string;
    productSlug: string;
    presetVersionId: string | null;
  };
  runtime: { productSlug: string; loader: string | null; gameVersion: string | null };
  resources: { ram: number; cpu: number; disk: number };
  manifest: unknown;
  artifacts: InstalledArtifact[];
}

function ordered(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(ordered);
  if (!value || typeof value !== 'object') return value;
  return Object.fromEntries(Object.entries(value as Record<string, unknown>).sort(([a], [b]) => a.localeCompare(b)).map(([key, row]) => [key, ordered(row)]));
}

export function canonicalSnapshot(snapshot: ServerProfileSnapshot): string {
  return JSON.stringify(ordered(snapshot));
}

export function snapshotSha256(snapshot: ServerProfileSnapshot): string {
  return createHash('sha256').update(canonicalSnapshot(snapshot)).digest('hex');
}

export function assertSnapshot(snapshot: ServerProfileSnapshot, expectedHash?: string | null): ServerProfileSnapshot {
  if (snapshot.version !== 1 || !snapshot.catalog.variantId || !snapshot.catalog.familyId) throw badRequest('This profile does not contain a reproducible catalogue snapshot.');
  const manifest = snapshot.manifest && typeof snapshot.manifest === 'object' ? snapshot.manifest as { files?: unknown[]; orderInstall?: { files?: unknown[] } } : null;
  if ((manifest?.files?.length ?? 0) > 0 || (manifest?.orderInstall?.files?.length ?? 0) > 0) {
    throw badRequest('This installation contains files without immutable release checksums and cannot be saved as a reproducible profile yet.');
  }
  for (const artifact of snapshot.artifacts) {
    if (artifact.source !== 'modrinth' || !artifact.releaseId || !artifact.sourceProjectId || !artifact.sourceUrl?.startsWith('https://cdn.modrinth.com/') || !/^[a-f0-9]{64}$/i.test(artifact.sha256 ?? '') || !/^[a-f0-9]{128}$/i.test(artifact.sourceSha512 ?? '') || !artifact.loader || !artifact.gameVersion) {
      throw badRequest(`The saved artifact ${artifact.slug} has no immutable release identity and cannot be restored safely.`);
    }
  }
  const actual = snapshotSha256(snapshot);
  if (expectedHash && actual !== expectedHash) throw badRequest('The saved profile snapshot failed its integrity check.');
  return snapshot;
}

export function buildSnapshot(input: Omit<ServerProfileSnapshot, 'version' | 'artifacts'> & { manifest: unknown }): ServerProfileSnapshot {
  const snapshot: ServerProfileSnapshot = { version: 1, ...input, artifacts: installedArtifacts(input.manifest) };
  return assertSnapshot(snapshot);
}

export async function streamHashes(stream: Readable): Promise<{ sha256: string; sha512: string; bytes: number }> {
  const sha256 = createHash('sha256');
  const sha512 = createHash('sha512');
  let bytes = 0;
  for await (const chunk of stream) {
    const data = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    bytes += data.length;
    sha256.update(data);
    sha512.update(data);
  }
  return { sha256: sha256.digest('hex'), sha512: sha512.digest('hex'), bytes };
}

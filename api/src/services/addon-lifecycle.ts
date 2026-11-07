/**
 * Catalogue add-on install, update and removal.
 * Bukkit plugins write only on Paper/Folia after a completed locked backup.
 * Forge is not a Bukkit loader. File writes fail closed when anything is unproven.
 */

import { backupCompleted } from './repurpose-gate.js';

export type AddonKind = 'SOFTWARE' | 'MANAGED_SERVICE' | 'PLATFORM_FEATURE';
export type AddonAction = 'install' | 'update' | 'remove' | 'reconcile';

export interface InstallSpec {
  adapter: 'minecraft-plugin' | 'unsupported';
  project?: string;
}

export interface InstalledArtifact {
  slug: string;
  status: 'installed';
  filename: string;
  version: string;
  project?: string;
  releaseId?: string;
  source?: 'modrinth';
  sourceProjectId?: string;
  sourceUrl?: string;
  sha256?: string;
  sourceSha512?: string;
  loader?: string;
  gameVersion?: string;
  dependencies?: { projectId: string | null; versionId: string | null; type: string }[];
  at: string;
}

export interface AddonDecision {
  ok: boolean;
  writes: boolean;
  backupRequired: boolean;
  reason: string;
  adapter: string | null;
}

export interface BackupRow {
  uuid: string;
  completed_at: string | null;
  is_successful: boolean;
}

const BUKKIT = new Set(['minecraft-paper', 'minecraft-folia']);

export function bukkitPluginAllowed(productSlug: string): boolean {
  return BUKKIT.has(productSlug);
}

export function parseInstallSpec(raw: unknown): InstallSpec | null {
  if (!raw || typeof raw !== 'object') return null;
  const adapter = (raw as { adapter?: unknown }).adapter;
  if (adapter === 'minecraft-plugin') {
    const project = (raw as { project?: unknown }).project;
    if (typeof project !== 'string' || !/^[A-Za-z0-9_-]{2,64}$/.test(project)) return { adapter: 'unsupported' };
    return { adapter: 'minecraft-plugin', project };
  }
  return { adapter: 'unsupported' };
}

export function verifiedGameVersion(value: string | null | undefined): string | null {
  if (!value || !/^\d+\.\d+(\.\d+)?$/.test(value)) return null;
  return value;
}

export function addonDecision(input: {
  kind: AddonKind;
  compatible: boolean;
  action: AddonAction;
  installed: boolean;
  backupCompleted: boolean;
  spec: InstallSpec | null;
  productSlug: string;
  gameVersion: string | null;
  artifact: InstalledArtifact | null;
}): AddonDecision {
  if (!input.compatible) {
    return { ok: false, writes: false, backupRequired: false, reason: 'This add-on is not compatible with this variant.', adapter: null };
  }
  if (input.kind === 'MANAGED_SERVICE' || input.kind === 'PLATFORM_FEATURE') {
    if (input.action === 'reconcile') {
      return { ok: true, writes: false, backupRequired: false, reason: 'Priced add-ons are reconciled from the order, not from files.', adapter: null };
    }
    return {
      ok: input.action === 'install' || input.action === 'remove',
      writes: false,
      backupRequired: false,
      reason: 'This add-on is billed on the order. It is not installed as a file.',
      adapter: null,
    };
  }
  if (input.action === 'install' && input.installed) {
    return { ok: false, writes: false, backupRequired: false, reason: 'This add-on is already installed.', adapter: input.spec?.adapter ?? null };
  }
  if ((input.action === 'remove' || input.action === 'update') && !input.installed) {
    return { ok: false, writes: false, backupRequired: false, reason: 'This add-on is not installed.', adapter: input.spec?.adapter ?? null };
  }
  if ((input.action === 'remove' || input.action === 'update') && !input.artifact?.filename) {
    return { ok: false, writes: false, backupRequired: false, reason: 'No recorded plugin file exists for this add-on. Reconcile first.', adapter: input.spec?.adapter ?? null };
  }
  if (!input.spec || input.spec.adapter === 'unsupported') {
    return { ok: false, writes: false, backupRequired: false, reason: 'No verified installer exists for this game. Use the game tab for configuration only.', adapter: input.spec?.adapter ?? null };
  }
  if (input.spec.adapter === 'minecraft-plugin' && !bukkitPluginAllowed(input.productSlug)) {
    return { ok: false, writes: false, backupRequired: false, reason: 'Bukkit plugins are only installed on Paper or Folia. Forge does not load them.', adapter: input.spec.adapter };
  }
  if (!input.gameVersion) {
    return { ok: false, writes: false, backupRequired: false, reason: 'The Minecraft version of this server is unknown. File writes are refused.', adapter: input.spec.adapter };
  }
  if (!input.backupCompleted) {
    return { ok: false, writes: false, backupRequired: true, reason: 'A completed locked backup is required before files change.', adapter: input.spec.adapter };
  }
  return {
    ok: true,
    writes: true,
    backupRequired: true,
    reason: input.action === 'remove' ? 'The recorded plugin file will be deleted after the backup.' : 'The plugin file will be pulled after the backup.',
    adapter: input.spec.adapter,
  };
}

export function installedArtifacts(manifest: unknown): InstalledArtifact[] {
  const addons = manifest && typeof manifest === 'object' ? (manifest as { addons?: unknown }).addons : null;
  if (!Array.isArray(addons)) return [];
  return addons.filter((row): row is InstalledArtifact => {
    if (!row || typeof row !== 'object') return false;
    const item = row as Partial<InstalledArtifact>;
    return item.status === 'installed' && typeof item.slug === 'string' && typeof item.filename === 'string';
  });
}

export function installedAddonSlugs(manifest: unknown): string[] {
  return installedArtifacts(manifest).map((row) => row.slug);
}

export function installedArtifact(manifest: unknown, slug: string): InstalledArtifact | null {
  return installedArtifacts(manifest).find((row) => row.slug === slug) ?? null;
}

export function mergeManifestAddons(
  manifest: unknown,
  slug: string,
  state: 'installed' | 'removed',
  artifact?: Omit<InstalledArtifact, 'slug' | 'status' | 'at'>,
): Record<string, unknown> {
  const base = manifest && typeof manifest === 'object' ? { ...(manifest as Record<string, unknown>) } : {};
  const current = Array.isArray(base.addons) ? [...(base.addons as unknown[])] : [];
  const rest = current.filter((row) => !(row && typeof row === 'object' && (row as { slug?: string }).slug === slug));
  if (state === 'installed' && artifact) {
    rest.push({
      slug,
      status: 'installed',
      ...artifact,
      at: new Date().toISOString(),
    } satisfies InstalledArtifact);
  }
  return { ...base, addons: rest };
}

export function busyAddonJob(jobs: { status: string }[]): boolean {
  return jobs.some((job) => job.status === 'pending' || job.status === 'running');
}

export async function waitForBackupCompletion(input: {
  created: BackupRow;
  list: () => Promise<BackupRow[]>;
  now?: () => number;
  sleep?: (ms: number) => Promise<void>;
  timeoutMs?: number;
  pollMs?: number;
}): Promise<{ ok: true; backup: BackupRow } | { ok: false; reason: string }> {
  const now = input.now ?? Date.now;
  const sleep = input.sleep ?? ((ms) => new Promise((resolve) => setTimeout(resolve, ms)));
  const timeoutMs = input.timeoutMs ?? 120_000;
  const pollMs = input.pollMs ?? 3_000;
  const deadline = now() + timeoutMs;
  let latest = input.created;
  if (latest.completed_at && !latest.is_successful) {
    return { ok: false, reason: 'The backup failed. Files were not changed.' };
  }
  while (!backupCompleted({ completedAt: latest.completed_at, successful: latest.is_successful })) {
    if (now() >= deadline) {
      return { ok: false, reason: 'The backup did not finish in time. Files were not changed.' };
    }
    await sleep(pollMs);
    const rows = await input.list();
    const row = rows.find((entry) => entry.uuid === input.created.uuid);
    if (!row) return { ok: false, reason: 'The backup disappeared before it finished. Files were not changed.' };
    if (row.completed_at && !row.is_successful) {
      return { ok: false, reason: 'The backup failed. Files were not changed.' };
    }
    latest = row;
  }
  return { ok: true, backup: latest };
}

export function pluginPresent(files: { name: string }[], filename: string): boolean {
  return files.some((file) => file.name === filename);
}

export function stalePluginFilename(action: AddonAction, current: string | null | undefined, next: string): string | null {
  return action === 'update' && current && current !== next ? current : null;
}

/**
 * Catalogue add-on install, update and removal.
 * SOFTWARE writes only through a known adapter (Minecraft plugins today).
 * A backup must exist before a write. Tests inject the writer; production uses the panel.
 */

export type AddonKind = 'SOFTWARE' | 'MANAGED_SERVICE' | 'PLATFORM_FEATURE';
export type AddonAction = 'install' | 'update' | 'remove' | 'reconcile';

export interface InstallSpec {
  adapter: 'minecraft-plugin' | 'unsupported';
  project?: string;
}

export interface AddonDecision {
  ok: boolean;
  writes: boolean;
  backupRequired: boolean;
  reason: string;
  adapter: string | null;
}

const MINECRAFT = new Set(['minecraft-paper', 'minecraft-folia', 'minecraft-forge']);

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

export function addonDecision(input: {
  kind: AddonKind;
  compatible: boolean;
  action: AddonAction;
  installed: boolean;
  hasBackup: boolean;
  spec: InstallSpec | null;
  productSlug: string;
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
    return { ok: false, writes: false, backupRequired: true, reason: 'This add-on is already installed.', adapter: input.spec?.adapter ?? null };
  }
  if ((input.action === 'remove' || input.action === 'update') && !input.installed) {
    return { ok: false, writes: false, backupRequired: true, reason: 'This add-on is not installed.', adapter: input.spec?.adapter ?? null };
  }
  if (!input.spec || input.spec.adapter === 'unsupported' || !MINECRAFT.has(input.productSlug)) {
    return {
      ok: false,
      writes: false,
      backupRequired: true,
      reason: 'No verified installer exists for this game. Use the game tab for configuration only.',
      adapter: input.spec?.adapter ?? null,
    };
  }
  if (!input.hasBackup) {
    return { ok: false, writes: false, backupRequired: true, reason: 'Make a locked backup first. Files are not changed without one.', adapter: input.spec.adapter };
  }
  return {
    ok: true,
    writes: true,
    backupRequired: true,
    reason: input.action === 'remove' ? 'The plugin file will be deleted after the backup.' : 'The plugin file will be pulled after the backup.',
    adapter: input.spec.adapter,
  };
}

export function mergeManifestAddons(
  manifest: unknown,
  slug: string,
  state: 'installed' | 'removed',
): Record<string, unknown> {
  const base = manifest && typeof manifest === 'object' ? { ...(manifest as Record<string, unknown>) } : {};
  const current = Array.isArray(base.addons) ? [...(base.addons as unknown[])] : [];
  const rest = current.filter((row) => !(row && typeof row === 'object' && (row as { slug?: string }).slug === slug));
  if (state === 'installed') rest.push({ slug, status: 'installed', at: new Date().toISOString() });
  return { ...base, addons: rest };
}

export function installedAddonSlugs(manifest: unknown): string[] {
  const addons = manifest && typeof manifest === 'object' ? (manifest as { addons?: unknown }).addons : null;
  if (!Array.isArray(addons)) return [];
  return addons
    .filter((row): row is { slug: string; status?: string } => Boolean(row && typeof row === 'object' && typeof (row as { slug?: unknown }).slug === 'string'))
    .filter((row) => row.status !== 'removed')
    .map((row) => row.slug);
}

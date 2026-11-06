import { describe, expect, it } from 'vitest';
import { addonDecision, installedAddonSlugs, mergeManifestAddons, parseInstallSpec } from '../src/services/addon-lifecycle.js';

describe('addon lifecycle', () => {
  it('refuses a write without a backup', () => {
    const decision = addonDecision({
      kind: 'SOFTWARE',
      compatible: true,
      action: 'install',
      installed: false,
      hasBackup: false,
      spec: { adapter: 'minecraft-plugin', project: 'luckperms' },
      productSlug: 'minecraft-paper',
    });
    expect(decision.ok).toBe(false);
    expect(decision.writes).toBe(false);
    expect(decision.reason).toMatch(/backup/i);
  });

  it('installs a Paper plugin after a backup', () => {
    const decision = addonDecision({
      kind: 'SOFTWARE',
      compatible: true,
      action: 'install',
      installed: false,
      hasBackup: true,
      spec: { adapter: 'minecraft-plugin', project: 'luckperms' },
      productSlug: 'minecraft-paper',
    });
    expect(decision.ok).toBe(true);
    expect(decision.writes).toBe(true);
    expect(decision.adapter).toBe('minecraft-plugin');
  });

  it('does not invent a plugin installer for Factorio', () => {
    const decision = addonDecision({
      kind: 'SOFTWARE',
      compatible: true,
      action: 'install',
      installed: false,
      hasBackup: true,
      spec: { adapter: 'minecraft-plugin', project: 'luckperms' },
      productSlug: 'factorio',
    });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/verified installer/i);
  });

  it('keeps priced add-ons off the filesystem', () => {
    const decision = addonDecision({
      kind: 'PLATFORM_FEATURE',
      compatible: true,
      action: 'install',
      installed: false,
      hasBackup: false,
      spec: null,
      productSlug: 'minecraft-paper',
    });
    expect(decision.writes).toBe(false);
    expect(decision.ok).toBe(true);
  });

  it('merges installed add-ons on the manifest', () => {
    const next = mergeManifestAddons({ presetSlug: 'survival' }, 'luckperms', 'installed');
    expect(installedAddonSlugs(next)).toEqual(['luckperms']);
    const gone = mergeManifestAddons(next, 'luckperms', 'removed');
    expect(installedAddonSlugs(gone)).toEqual([]);
  });

  it('rejects a broken install spec', () => {
    expect(parseInstallSpec({ adapter: 'minecraft-plugin', project: '../x' })?.adapter).toBe('unsupported');
  });
});

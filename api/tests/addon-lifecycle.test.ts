import { describe, expect, it } from 'vitest';
import {
  addonDecision,
  busyAddonJob,
  installedAddonSlugs,
  mergeManifestAddons,
  parseInstallSpec,
  pluginPresent,
  waitForBackupCompletion,
} from '../src/services/addon-lifecycle.js';

const paperInstall = {
  kind: 'SOFTWARE' as const,
  compatible: true,
  action: 'install' as const,
  installed: false,
  spec: { adapter: 'minecraft-plugin' as const, project: 'luckperms' },
  productSlug: 'minecraft-paper',
  gameVersion: '1.21.1',
  artifact: null,
};

describe('addon lifecycle', () => {
  it('refuses a write without a completed backup', () => {
    const decision = addonDecision({ ...paperInstall, backupCompleted: false });
    expect(decision.ok).toBe(false);
    expect(decision.writes).toBe(false);
    expect(decision.reason).toMatch(/completed locked backup/i);
  });

  it('installs a Paper plugin after a completed backup', () => {
    const decision = addonDecision({ ...paperInstall, backupCompleted: true });
    expect(decision.ok).toBe(true);
    expect(decision.writes).toBe(true);
  });

  it('refuses Forge for Bukkit plugins', () => {
    const decision = addonDecision({ ...paperInstall, backupCompleted: true, productSlug: 'minecraft-forge' });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/Forge/);
  });

  it('refuses when the runtime version is unknown', () => {
    const decision = addonDecision({ ...paperInstall, backupCompleted: true, gameVersion: null });
    expect(decision.ok).toBe(false);
    expect(decision.reason).toMatch(/unknown/);
  });

  it('does not invent a plugin installer for Factorio', () => {
    const decision = addonDecision({ ...paperInstall, backupCompleted: true, productSlug: 'factorio' });
    expect(decision.ok).toBe(false);
  });

  it('keeps priced add-ons off the filesystem', () => {
    const decision = addonDecision({
      kind: 'PLATFORM_FEATURE',
      compatible: true,
      action: 'install',
      installed: false,
      backupCompleted: false,
      spec: null,
      productSlug: 'minecraft-paper',
      gameVersion: null,
      artifact: null,
    });
    expect(decision.writes).toBe(false);
    expect(decision.ok).toBe(true);
  });

  it('tracks the installed filename', () => {
    const next = mergeManifestAddons({ presetSlug: 'survival' }, 'luckperms', 'installed', { filename: 'LuckPerms.jar', version: '5.4' });
    expect(installedAddonSlugs(next)).toEqual(['luckperms']);
    const gone = mergeManifestAddons(next, 'luckperms', 'removed');
    expect(installedAddonSlugs(gone)).toEqual([]);
  });

  it('rejects a broken install spec', () => {
    expect(parseInstallSpec({ adapter: 'minecraft-plugin', project: '../x' })?.adapter).toBe('unsupported');
  });

  it('waits until a backup completes', async () => {
    let n = 0;
    const result = await waitForBackupCompletion({
      created: { uuid: 'b1', completed_at: null, is_successful: false },
      list: async () => {
        n += 1;
        return [{ uuid: 'b1', completed_at: n > 1 ? '2026-01-01' : null, is_successful: n > 1 }];
      },
      now: () => n * 10,
      sleep: async () => undefined,
      timeoutMs: 100,
      pollMs: 1,
    });
    expect(result.ok).toBe(true);
  });

  it('fails closed when the backup times out', async () => {
    const result = await waitForBackupCompletion({
      created: { uuid: 'b1', completed_at: null, is_successful: false },
      list: async () => [{ uuid: 'b1', completed_at: null, is_successful: false }],
      now: (() => {
        let t = 0;
        return () => {
          t += 50;
          return t;
        };
      })(),
      sleep: async () => undefined,
      timeoutMs: 80,
      pollMs: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/did not finish/);
  });

  it('fails closed when createBackup already returned a failed backup', async () => {
    const result = await waitForBackupCompletion({
      created: { uuid: 'b1', completed_at: '2026-01-01', is_successful: false },
      list: async () => {
        throw new Error('list must not run');
      },
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/failed/);
  });

  it('fails closed when the backup fails', async () => {
    const result = await waitForBackupCompletion({
      created: { uuid: 'b1', completed_at: null, is_successful: false },
      list: async () => [{ uuid: 'b1', completed_at: '2026-01-01', is_successful: false }],
      now: () => 0,
      sleep: async () => undefined,
      timeoutMs: 1000,
      pollMs: 1,
    });
    expect(result.ok).toBe(false);
    if (!result.ok) expect(result.reason).toMatch(/failed/);
  });

  it('blocks a second in-flight job', () => {
    expect(busyAddonJob([{ status: 'running' }])).toBe(true);
    expect(busyAddonJob([{ status: 'succeeded' }])).toBe(false);
  });

  it('confirms the plugin file is present', () => {
    expect(pluginPresent([{ name: 'LuckPerms.jar' }], 'LuckPerms.jar')).toBe(true);
    expect(pluginPresent([{ name: 'other.jar' }], 'LuckPerms.jar')).toBe(false);
  });
});

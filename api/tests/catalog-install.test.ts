import { describe, expect, it } from 'vitest';
import { appendOnce, catalogInstallPlan, importPresetKind, mergeProperties, presetAwaitingFiles, presetOutcome, runCatalogInstall, safeInstallPath } from '../src/services/catalog-install.js';

describe('catalogue preset install', () => {
  it('does not call a preset installed until the server is running', () => {
    expect(presetOutcome('starting', 1)).toBe('retry');
    expect(presetOutcome('running', 2)).toBe('installed');
    expect(presetOutcome('offline', 5)).toBe('gave_up');
  });

  it('plans a blank Node bot, a blank Python bot, and leaves Git and ZIP to the existing importer', () => {
    const node = catalogInstallPlan('nodejs', 'blank');
    expect(node?.startup).toBe('npm install && node index.js');
    expect(node?.files.map((file) => file.path)).toEqual(['/package.json', '/index.js']);
    const python = catalogInstallPlan('python', 'blank');
    expect(python?.startup).toBe('pip install -r requirements.txt && python main.py');
    expect(python?.files.map((file) => file.path)).toEqual(['/requirements.txt', '/main.py']);
    expect(catalogInstallPlan('discord-bot', 'git')).toBeNull();
    expect(catalogInstallPlan('discord-bot', 'zip')).toBeNull();
    expect(catalogInstallPlan('python', 'py-blank')?.files.map((file) => file.path)).toEqual(['/requirements.txt', '/main.py']);
    expect(catalogInstallPlan('nodejs', 'tickets')).toBeNull();
    expect(importPresetKind('git')).toBe('git');
    expect(importPresetKind('py-zip')).toBe('zip');
    expect(importPresetKind('blank')).toBeNull();
    expect(presetAwaitingFiles('discord-bot', { catalog: { preset: { slug: 'blank' } } })).toBe(true);
    expect(presetAwaitingFiles('discord-bot', { catalog: { preset: { slug: 'git' } } })).toBe(false);
    expect(presetAwaitingFiles('nodejs', { catalog: { preset: { slug: 'blank' } } })).toBe(true);
  });

  it('writes the Discord ticket bot and installs its dependency on startup', () => {
    const plan = catalogInstallPlan('discord-bot', 'tickets');
    expect(plan?.startup).toBe('npm install && node index.js');
    expect(plan?.files.find((file) => file.path === '/index.js')?.content).toMatch(/PermissionFlagsBits/);
    expect(plan?.files.find((file) => file.path === '/package.json')?.content).toMatch(/discord\.js/);
  });

  it('merges survival settings into an existing server.properties', () => {
    const merged = mergeProperties('server-port=25565\nmotd=old\n', { gamemode: 'survival', motd: 'Blipmade survival' });
    expect(merged).toContain('server-port=25565');
    expect(merged).toContain('motd=Blipmade survival');
    expect(merged).toContain('gamemode=survival');
  });

  it('appends a FiveM ensure line once', () => {
    expect(appendOnce('sv_hostname "Town"\n', 'ensure blipmade-freeroam')).toBe('sv_hostname "Town"\nensure blipmade-freeroam\n');
    expect(appendOnce('ensure blipmade-freeroam\n', 'ensure blipmade-freeroam')).toBe('ensure blipmade-freeroam\n');
  });

  it('sets Counter-Strike mode through the egg environment and refuses a path that leaves the server', () => {
    expect(catalogInstallPlan('counter-strike-2', 'competitive')?.environment).toEqual({ GAME_TYPE: '0', GAME_MODE: '1', SRCDS_MAP: 'de_mirage' });
    expect(safeInstallPath('/resources/blipmade-freeroam/server.lua')).toBe(true);
    expect(safeInstallPath('/../etc/passwd')).toBe(false);
  });

  it('writes the plan through the supplied files and merges the environment', async () => {
    const files = new Map<string, string>();
    const plan = catalogInstallPlan('fivem', 'freeroam');
    expect(plan).not.toBeNull();
    files.set('/server.cfg', 'endpoint_add_tcp "0.0.0.0:30120"\n');
    let startup: string | null = 'kept';
    const written = await runCatalogInstall(plan!, {
      read: async (path) => files.get(path) ?? null,
      write: async (path, content) => { files.set(path, content); },
      startup: async (next) => { startup = next; },
    });
    expect(written).toContain('/resources/blipmade-freeroam/fxmanifest.lua');
    expect(files.get('/server.cfg')).toContain('ensure blipmade-freeroam');
    expect(files.get('/resources/blipmade-freeroam/server.lua')).toMatch(/RegisterCommand/);
    expect(startup).toBe('kept');
  });
});

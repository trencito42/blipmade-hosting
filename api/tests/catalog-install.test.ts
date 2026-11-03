import { describe, expect, it } from 'vitest';
import { appendOnce, catalogInstallPlan, mergeProperties, runCatalogInstall, safeInstallPath } from '../src/services/catalog-install.js';

describe('catalogue preset install', () => {
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

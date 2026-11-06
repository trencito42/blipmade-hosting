import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { GAME_WORKSPACES, mergeConfigLines, readConfigValue } from '../src/app/instance/game-settings.ts';

describe('game settings', () => {
  it('covers the games that do not share a plugin installer', () => {
    const slugs = GAME_WORKSPACES.map((workspace) => workspace.slug);
    assert.deepEqual(slugs, ['minecraft-bedrock', 'rust', 'fivem', 'counter-strike-1-6', 'counter-strike-2', 'valheim', 'factorio']);
    assert.equal(GAME_WORKSPACES.some((workspace) => workspace.summary.toLowerCase().includes('plugin installer') && workspace.slug !== 'minecraft-bedrock' && workspace.slug !== 'rust' && workspace.slug !== 'counter-strike-2'), false);
  });

  it('updates one FiveM line and keeps the rest of server.cfg', () => {
    const next = mergeConfigLines('endpoint_add_tcp "0.0.0.0:30120"\nsv_hostname "Town"\n', { sv_hostname: 'Blipmade' });
    assert.match(next, /endpoint_add_tcp/);
    assert.equal(readConfigValue(next, 'sv_hostname'), 'Blipmade');
  });

  it('adds a Bedrock key that was missing', () => {
    const next = mergeConfigLines('server-port=19132\n', { 'level-name': 'Dedicated' });
    assert.match(next, /server-port=19132/);
    assert.equal(readConfigValue(next, 'level-name'), 'Dedicated');
  });
});

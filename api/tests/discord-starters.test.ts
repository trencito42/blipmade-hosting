import { execFileSync, spawnSync } from 'node:child_process';
import { mkdtempSync, writeFileSync } from 'node:fs';
import { createRequire } from 'node:module';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';
import { DISCORD_TEMPLATES } from '../src/services/discord-templates.js';

const require = createRequire(import.meta.url);

/**
 * Installs the starter dependency once and runs each bot until Discord login.
 * Login cannot succeed without a token. A syntax error or a missing module fails the test.
 */
describe('discord starter bots', () => {
  it('installs discord.js and each starter reaches login', () => {
    const root = mkdtempSync(join(tmpdir(), 'blipmade-discord-'));
    writeFileSync(join(root, 'package.json'), JSON.stringify({ private: true, dependencies: { 'discord.js': '14.16.3' } }));
    const npm = process.execPath.replace(/\/node$/, '/npm');
    execFileSync(npm, ['install', '--omit=dev', '--no-audit', '--no-fund'], { cwd: root, stdio: 'pipe', timeout: 180_000 });
    for (const [name, files] of Object.entries(DISCORD_TEMPLATES)) {
      const dir = join(root, name);
      execFileSync('mkdir', ['-p', dir]);
      writeFileSync(join(dir, 'package.json'), files.packageJson);
      writeFileSync(join(dir, 'index.js'), files.index);
      execFileSync(process.execPath, ['--check', join(dir, 'index.js')], { stdio: 'pipe' });
      execFileSync('ln', ['-s', join(root, 'node_modules'), join(dir, 'node_modules')]);
      const ran = spawnSync(process.execPath, ['index.js'], { cwd: dir, encoding: 'utf8', timeout: 20_000, env: { ...process.env, DISCORD_TOKEN: '' } });
      const output = `${ran.stdout}\n${ran.stderr}`;
      expect(ran.status, output).not.toBe(0);
      expect(output.toLowerCase(), output).toMatch(/token/);
    }
    const tickets = require(join(root, 'tickets', 'index.js')) as { ticketChannelOptions: (guild: { roles: { everyone: { id: string } }; client: { user: { id: string } } }, user: { id: string; username: string }) => { permissionOverwrites: { id: string; deny?: bigint[] }[] } };
    const { PermissionFlagsBits } = require(join(root, 'node_modules', 'discord.js')) as { PermissionFlagsBits: { ViewChannel: bigint } };
    const options = tickets.ticketChannelOptions(
      { roles: { everyone: { id: 'everyone' } }, client: { user: { id: 'bot' } } },
      { id: 'member', username: 'Ada' },
    );
    const everyone = options.permissionOverwrites.find((row) => row.id === 'everyone');
    expect(everyone?.deny).toContain(PermissionFlagsBits.ViewChannel);
  }, 180_000);
});

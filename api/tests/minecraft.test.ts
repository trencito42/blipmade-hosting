import { afterEach, describe, expect, it, vi as spy } from 'vitest';
import { forgeVersions, papermcVersions, applyProperties, cleanPlayer, cleanRawCommand, commandFor, namesOfList, parseProperties } from '../src/services/minecraft.js';

describe('minecraft tools', () => {
  it('only lets real names into a command', () => {
    expect(commandFor('op', 'Steve_1')).toBe('op Steve_1');
    expect(commandFor('ban', 'Steve', 'griefing\nstop')).toBe('ban Steve griefing stop');
    for (const bad of ['a', 'two words', 'x;stop', 'name\nstop', 'a'.repeat(17)]) expect(() => cleanPlayer(bad)).toThrow();
  });
  it('keeps a raw command to one line', () => {
    expect(cleanRawCommand('/say hi')).toBe('say hi');
    expect(() => cleanRawCommand('say hi\nstop')).toThrow();
    expect(() => cleanRawCommand('x'.repeat(201))).toThrow();
  });
  it('changes a property without touching the rest of the file', () => {
    const text = '#Minecraft server properties\nmotd=A Minecraft Server\nmax-players=20\nrcon.password=secret\n';
    const next = applyProperties(text, { motd: 'Hello', 'max-players': '30', pvp: 'false' });
    expect(parseProperties(next)).toMatchObject({ motd: 'Hello', 'max-players': '30', pvp: 'false', 'rcon.password': 'secret' });
    expect(next.startsWith('#Minecraft server properties\n')).toBe(true);
    expect(() => applyProperties(text, { 'rcon.password': 'x' })).toThrow();
    expect(() => applyProperties(text, { difficulty: 'impossible' })).toThrow();
  });
  it('reads the names in a list file', () => {
    expect(namesOfList('[{"uuid":"1","name":"Alex"},{"name":"Steve"}]')).toEqual(['Alex', 'Steve']);
    expect(namesOfList('not json')).toEqual([]);
  });
});

import net from 'node:net';
import { pingJava } from '../src/services/minecraft.js';

function vi(n: number): Buffer { const b: number[] = []; let v = n >>> 0; do { let x = v & 0x7f; v >>>= 7; if (v) x |= 0x80; b.push(x); } while (v); return Buffer.from(b); }

describe('server list ping', () => {
  it('reads the answer of a server the way the game client does', async () => {
    const json = JSON.stringify({ version: { name: 'Paper 1.21.4' }, players: { online: 2, max: 20, sample: [{ name: 'Alex' }, { name: 'Steve' }] }, description: { text: '§aWelcome' } });
    const body = Buffer.from(json);
    const payload = Buffer.concat([vi(0), vi(body.length), body]);
    const server = net.createServer((socket) => {
      let seen = 0;
      socket.on('data', () => { seen += 1; if (seen === 1) socket.write(Buffer.concat([vi(payload.length), payload])); });
    });
    await new Promise<void>((resolve) => server.listen(0, '127.0.0.1', resolve));
    const port = (server.address() as net.AddressInfo).port;
    const status = await pingJava('127.0.0.1', port);
    server.close();
    expect(status).toMatchObject({ online: true, version: 'Paper 1.21.4', motd: 'Welcome', players: { online: 2, max: 20, sample: ['Alex', 'Steve'] } });
    expect((await pingJava('127.0.0.1', 1)).online).toBe(false);
  });
});

describe('versions to pick', () => {
  afterEach(() => spy.unstubAllGlobals());
  const answer = (body: unknown) => spy.stubGlobal('fetch', spy.fn(async () => new Response(JSON.stringify(body), { status: 200 })));

  it('reads the groups of PaperMC, newest first, without pre-releases', async () => {
    answer({ versions: { '26.1': ['26.1.2', '26.1.1'], '1.21': ['1.21.11', '1.21.11-rc1', '1.21.10', '1.21'] } });
    expect(await papermcVersions('folia')).toEqual(['26.1.2', '26.1.1', '1.21.11', '1.21.10', '1.21']);
  });
  it('lists the Minecraft versions Forge builds for, newest first', async () => {
    answer({ promos: { '1.20.1-latest': 'a', '1.20.1-recommended': 'b', '1.21.11-latest': 'c', '1.9.4-latest': 'd', '26.2-recommended': 'e', 'junk': 'x' } });
    expect(await forgeVersions()).toEqual(['26.2', '1.21.11', '1.20.1', '1.9.4']);
  });
});

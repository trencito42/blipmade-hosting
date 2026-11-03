import { mkdtempSync, readFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { Readable } from 'node:stream';
import { describe, expect, it } from 'vitest';
import { archiveIntegrity, packTarGz, packZip, restoreArchive, verifyBackupStream } from '../src/services/backup-archive.js';

const files = [
  { name: 'server.properties', data: Buffer.from('motd=hello\n') },
  { name: 'world/level.dat', data: Buffer.from('level') },
];

describe('backup archive integrity', () => {
  it('rejects a truncated or corrupt gzip tar and restores a complete one', async () => {
    const archive = packTarGz(files);
    const checked = archiveIntegrity(archive);
    expect(checked.entries).toBe(2);
    const streamed = await verifyBackupStream(Readable.from([archive.subarray(0, 3), archive.subarray(3)]));
    expect(streamed).toEqual(checked);
    const directory = mkdtempSync(join(tmpdir(), 'blipmade-restore-'));
    expect(restoreArchive(archive, directory).sort()).toEqual(['server.properties', 'world/level.dat']);
    expect(readFileSync(join(directory, 'world/level.dat')).toString()).toBe('level');
    expect(() => archiveIntegrity(archive.subarray(0, archive.length - 8))).toThrow(/not a complete archive/);
    const corrupt = Buffer.from(archive);
    corrupt[corrupt.length - 20] ^= 0xff;
    expect(() => archiveIntegrity(corrupt)).toThrow(/not a complete archive/);
  });

  it('rejects a zip whose CRC does not match and restores one that does', () => {
    const archive = packZip(files);
    expect(archiveIntegrity(archive).entries).toBe(2);
    const directory = mkdtempSync(join(tmpdir(), 'blipmade-zip-'));
    restoreArchive(archive, directory);
    expect(readFileSync(join(directory, 'server.properties')).toString()).toBe('motd=hello\n');
    const corrupt = Buffer.from(archive);
    const text = corrupt.indexOf(Buffer.from('motd=hello'));
    corrupt[text] ^= 0xff;
    expect(() => archiveIntegrity(corrupt)).toThrow(/not a complete archive/);
    expect(() => restoreArchive(packZip([{ name: '../secret', data: Buffer.from('no') }]), directory)).toThrow(/leaves its folder/);
  });
});

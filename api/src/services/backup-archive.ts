import { createHash } from 'node:crypto';
import { mkdirSync, writeFileSync } from 'node:fs';
import { dirname, join, normalize, sep } from 'node:path';
import { Readable, Transform } from 'node:stream';
import { pipeline } from 'node:stream/promises';
import { crc32, createGunzip, gunzipSync, gzipSync, inflateRawSync } from 'node:zlib';

export class ArchiveError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'ArchiveError';
  }
}

export interface ArchiveFile {
  name: string;
  data: Buffer;
}

export interface ArchiveIntegrity {
  sha256: string;
  bytes: number;
  entries: number;
}

const reason = 'The backup is not a complete archive, so the server was not switched.';

function checksumHeader(header: Buffer): number {
  let sum = 0;
  for (let index = 0; index < 512; index += 1) {
    sum += index >= 148 && index < 156 ? 0x20 : header[index]!;
  }
  return sum;
}

function octal(field: Buffer): number {
  const text = field.toString('utf8').replace(/\0.*$/, '').trim();
  if (!text) return 0;
  const value = Number.parseInt(text, 8);
  if (!Number.isFinite(value) || value < 0) throw new ArchiveError(reason);
  return value;
}

function safeName(name: string): string {
  const cleaned = name.replaceAll('\\', '/').replace(/\0.*$/, '');
  if (!cleaned || cleaned.startsWith('/') || cleaned.split('/').some((part) => part === '..')) {
    throw new ArchiveError('The backup contains a path that leaves its folder.');
  }
  return cleaned;
}

/** Reads a tar and checks every header checksum. A missing end marker is a truncated archive. */
export function readTar(tar: Buffer): ArchiveFile[] {
  const files: ArchiveFile[] = [];
  let offset = 0;
  let zeroBlocks = 0;
  while (offset + 512 <= tar.length) {
    const header = tar.subarray(offset, offset + 512);
    offset += 512;
    if (header.every((byte) => byte === 0)) {
      zeroBlocks += 1;
      if (zeroBlocks === 2) return files;
      continue;
    }
    zeroBlocks = 0;
    const stored = octal(header.subarray(148, 156));
    if (stored !== checksumHeader(header)) throw new ArchiveError(reason);
    const size = octal(header.subarray(124, 136));
    const type = String.fromCharCode(header[156] ?? 0);
    const name = safeName(header.subarray(0, 100).toString('utf8'));
    if (offset + size > tar.length) throw new ArchiveError(reason);
    const data = Buffer.from(tar.subarray(offset, offset + size));
    offset += Math.ceil(size / 512) * 512;
    if (offset > tar.length) throw new ArchiveError(reason);
    if (type === '0' || type === '\0') files.push({ name, data });
  }
  if (zeroBlocks < 2) throw new ArchiveError(reason);
  return files;
}

function readZip(zip: Buffer): ArchiveFile[] {
  let eocd = -1;
  for (let index = zip.length - 22; index >= Math.max(0, zip.length - 22 - 65_535); index -= 1) {
    if (zip.readUInt32LE(index) === 0x06054b50) {
      eocd = index;
      break;
    }
  }
  if (eocd < 0) throw new ArchiveError(reason);
  const count = zip.readUInt16LE(eocd + 8);
  let cursor = zip.readUInt32LE(eocd + 16);
  if (count > 100_000 || cursor >= zip.length) throw new ArchiveError(reason);
  const files: ArchiveFile[] = [];
  for (let index = 0; index < count; index += 1) {
    if (cursor + 46 > zip.length || zip.readUInt32LE(cursor) !== 0x02014b50) throw new ArchiveError(reason);
    const method = zip.readUInt16LE(cursor + 10);
    const expected = zip.readUInt32LE(cursor + 16);
    const compressedSize = zip.readUInt32LE(cursor + 20);
    const size = zip.readUInt32LE(cursor + 24);
    const nameLength = zip.readUInt16LE(cursor + 28);
    const extraLength = zip.readUInt16LE(cursor + 30);
    const commentLength = zip.readUInt16LE(cursor + 32);
    const localOffset = zip.readUInt32LE(cursor + 42);
    const name = safeName(zip.subarray(cursor + 46, cursor + 46 + nameLength).toString('utf8'));
    cursor += 46 + nameLength + extraLength + commentLength;
    if (name.endsWith('/')) continue;
    if (localOffset + 30 > zip.length || zip.readUInt32LE(localOffset) !== 0x04034b50) throw new ArchiveError(reason);
    const localName = zip.readUInt16LE(localOffset + 26);
    const localExtra = zip.readUInt16LE(localOffset + 28);
    const start = localOffset + 30 + localName + localExtra;
    const compressed = zip.subarray(start, start + compressedSize);
    if (compressed.length !== compressedSize) throw new ArchiveError(reason);
    const data = method === 0 ? Buffer.from(compressed) : method === 8 ? inflateRawSync(compressed) : null;
    if (!data || data.length !== size || (crc32(data) >>> 0) !== expected) throw new ArchiveError(reason);
    files.push({ name, data });
  }
  return files;
}

/** Opens a whole archive and checks gzip CRC, tar checksums, or zip CRCs. */
export function readArchive(bytes: Buffer): ArchiveFile[] {
  if (bytes.length >= 2 && bytes[0] === 0x1f && bytes[1] === 0x8b) {
    let tar: Buffer;
    try {
      tar = gunzipSync(bytes);
    } catch {
      throw new ArchiveError(reason);
    }
    return readTar(tar);
  }
  if (bytes.length >= 4 && bytes.readUInt32LE(0) === 0x04034b50) return readZip(bytes);
  if (bytes.length >= 262 && bytes.subarray(257, 262).toString('utf8') === 'ustar') return readTar(bytes);
  throw new ArchiveError('The backup is not a gzip, zip, or tar archive, so the server was not switched.');
}

export function archiveIntegrity(bytes: Buffer): ArchiveIntegrity {
  const files = readArchive(bytes);
  return {
    sha256: createHash('sha256').update(bytes).digest('hex'),
    bytes: bytes.length,
    entries: files.length,
  };
}

/** Writes the archive back to a directory. A path that leaves the directory is refused. */
export function restoreArchive(bytes: Buffer, destination: string): string[] {
  const root = normalize(destination);
  const written: string[] = [];
  for (const file of readArchive(bytes)) {
    const target = normalize(join(root, file.name));
    if (target !== root && !target.startsWith(root + sep)) throw new ArchiveError('The backup contains a path that leaves its folder.');
    mkdirSync(dirname(target), { recursive: true });
    writeFileSync(target, file.data);
    written.push(file.name);
  }
  return written;
}

class CountingHash extends Transform {
  readonly hash = createHash('sha256');
  bytes = 0;
  override _transform(chunk: Buffer, _encoding: BufferEncoding, callback: (error?: Error | null, data?: Buffer) => void): void {
    this.hash.update(chunk);
    this.bytes += chunk.length;
    callback(null, chunk);
  }
}

/** Streams a gzip tar, checking the gzip trailer and every tar checksum without keeping the archive. */
export async function verifyGzipTarStream(source: Readable): Promise<ArchiveIntegrity> {
  const hashed = new CountingHash();
  let pending = Buffer.alloc(0);
  let zeroBlocks = 0;
  let entries = 0;
  let expect = 0;
  const consume = new Transform({
    transform(chunk: Buffer, _encoding, callback) {
      pending = Buffer.concat([pending, chunk]);
      try {
        for (;;) {
          if (expect > 0) {
            if (pending.length === 0) break;
            const take = Math.min(expect, pending.length);
            pending = pending.subarray(take);
            expect -= take;
            continue;
          }
          if (pending.length < 512) break;
          const header = pending.subarray(0, 512);
          pending = pending.subarray(512);
          if (header.every((byte) => byte === 0)) {
            zeroBlocks += 1;
            continue;
          }
          if (zeroBlocks > 0) throw new ArchiveError(reason);
          if (octal(header.subarray(148, 156)) !== checksumHeader(header)) throw new ArchiveError(reason);
          const size = octal(header.subarray(124, 136));
          const type = String.fromCharCode(header[156] ?? 0);
          safeName(header.toString('utf8', 0, 100));
          expect = Math.ceil(size / 512) * 512;
          if (type === '0' || type === '\0') entries += 1;
        }
        callback();
      } catch (error) {
        callback(error instanceof Error ? error : new ArchiveError(reason));
      }
    },
  });
  try {
    await pipeline(source, hashed, createGunzip(), consume);
  } catch (error) {
    if (error instanceof ArchiveError) throw error;
    throw new ArchiveError(reason);
  }
  if (zeroBlocks < 2 || expect !== 0 || pending.length > 0) throw new ArchiveError(reason);
  return { sha256: hashed.hash.digest('hex'), bytes: hashed.bytes, entries };
}

/** Verifies a backup download. Gzip tars are streamed. Zip and raw tar are checked in full, including CRCs. */
export async function verifyBackupStream(source: AsyncIterable<Uint8Array | Buffer>): Promise<ArchiveIntegrity> {
  const iterator = source[Symbol.asyncIterator]();
  const first = await iterator.next();
  if (first.done) throw new ArchiveError('The backup archive is too small to open, so the server was not switched.');
  const head = Buffer.from(first.value);
  async function* chunks(): AsyncGenerator<Buffer> {
    yield head;
    let next = await iterator.next();
    while (!next.done) {
      yield Buffer.from(next.value);
      next = await iterator.next();
    }
  }
  if (head.length >= 2 && head[0] === 0x1f && head[1] === 0x8b) return verifyGzipTarStream(Readable.from(chunks()));
  const all: Buffer[] = [];
  for await (const chunk of chunks()) all.push(chunk);
  return archiveIntegrity(Buffer.concat(all));
}

/** Builds a ustar gzip archive. Used to prove the reader, and not to pack customer servers. */
export function packTarGz(files: ArchiveFile[]): Buffer {
  const parts: Buffer[] = [];
  for (const file of files) {
    const header = Buffer.alloc(512);
    header.write(file.name);
    header.write('0000644\0', 100);
    header.write('0000000\0', 108);
    header.write('0000000\0', 116);
    header.write(`${file.data.length.toString(8).padStart(11, '0')}\0`, 124);
    header.write('00000000000\0', 136);
    header.write('0', 156);
    header.write('ustar\0', 257);
    header.write('00', 263);
    header.fill(0x20, 148, 156);
    header.write(`${checksumHeader(header).toString(8).padStart(6, '0')}\0 `, 148);
    parts.push(header, file.data, Buffer.alloc((512 - (file.data.length % 512)) % 512));
  }
  parts.push(Buffer.alloc(1024));
  return gzipSync(Buffer.concat(parts));
}

/** Builds a stored zip so a bad CRC can be told apart from a real archive. */
export function packZip(files: ArchiveFile[]): Buffer {
  const locals: Buffer[] = [];
  const centrals: Buffer[] = [];
  let offset = 0;
  for (const file of files) {
    const name = Buffer.from(file.name);
    const checksum = crc32(file.data) >>> 0;
    const local = Buffer.alloc(30 + name.length);
    local.writeUInt32LE(0x04034b50, 0);
    local.writeUInt16LE(20, 4);
    local.writeUInt32LE(checksum, 14);
    local.writeUInt32LE(file.data.length, 18);
    local.writeUInt32LE(file.data.length, 22);
    local.writeUInt16LE(name.length, 26);
    name.copy(local, 30);
    locals.push(local, file.data);
    const central = Buffer.alloc(46 + name.length);
    central.writeUInt32LE(0x02014b50, 0);
    central.writeUInt16LE(20, 4);
    central.writeUInt16LE(20, 6);
    central.writeUInt32LE(checksum, 16);
    central.writeUInt32LE(file.data.length, 20);
    central.writeUInt32LE(file.data.length, 24);
    central.writeUInt16LE(name.length, 28);
    central.writeUInt32LE(offset, 42);
    name.copy(central, 46);
    centrals.push(central);
    offset += local.length + file.data.length;
  }
  const centralBytes = Buffer.concat(centrals);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralBytes.length, 12);
  eocd.writeUInt32LE(offset, 16);
  return Buffer.concat([...locals, centralBytes, eocd]);
}

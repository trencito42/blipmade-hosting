import { Readable } from 'node:stream';

/** Reads the start of a stream and stops. The rest of a backup is not stored here. */
export async function readStreamPrefix(stream: Readable | AsyncIterable<Uint8Array | Buffer>, bytes = 512): Promise<Buffer> {
  const chunks: Buffer[] = [];
  let total = 0;
  for await (const chunk of stream) {
    const piece = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
    chunks.push(piece);
    total += piece.length;
    if (total >= bytes) break;
  }
  if (stream instanceof Readable) stream.destroy();
  return Buffer.concat(chunks).subarray(0, bytes);
}

/** A finished panel backup. Completion alone is not enough to switch the server. */
export function backupCompleted(backup: { completedAt: string | null; successful: boolean } | null): boolean {
  return Boolean(backup?.completedAt) && backup?.successful === true;
}

/**
 * Whether the bytes at the start of a backup are an archive we could hand back to the panel.
 * A successful flag with an HTML page or an empty body is not restorable.
 */
export function archiveHeaderProblem(header: Buffer): string | null {
  if (header.length < 4) return 'The backup archive is too small to open, so the server was not switched.';
  const gzip = header[0] === 0x1f && header[1] === 0x8b;
  const zip = header[0] === 0x50 && header[1] === 0x4b;
  const ustar = header.length >= 262 && header.subarray(257, 262).toString('utf8') === 'ustar';
  if (!gzip && !zip && !ustar) return 'The backup is not a readable archive, so the server was not switched.';
  return null;
}

/** The egg changes only after a completed backup whose archive header opens. */
export function maySwitchProduct(input: { completed: boolean; archiveProblem: string | null }): { ok: true } | { ok: false; reason: string } {
  if (!input.completed) return { ok: false, reason: 'The backup did not finish successfully, so the server was not switched.' };
  if (input.archiveProblem) return { ok: false, reason: input.archiveProblem };
  return { ok: true };
}

import { createHash, randomBytes } from 'node:crypto';
import { mkdir, readFile, rm, writeFile } from 'node:fs/promises';
import { dirname, join, resolve } from 'node:path';
import { env } from '../env.js';
import { badRequest } from './errors.js';

/**
 * Storage for the files attached to support tickets.
 *
 * The bytes live on a volume that is not served by the web container, so a
 * file is only reachable through an API route that checks who may read it.
 * Every file gets a random name, the original name is only kept as
 * metadata, and the path is always resolved inside the attachment root so a
 * crafted name cannot escape it.
 */

/** The largest file a customer may attach. */
export const MAX_ATTACHMENT_BYTES = 5 * 1024 * 1024;

/** The file types a customer may attach. */
export const ALLOWED_ATTACHMENT_TYPES = [
  'text/plain',
  'text/csv',
  'text/markdown',
  'text/html',
  'application/json',
  'application/pdf',
  'application/zip',
  'application/gzip',
  'application/x-tar',
  'application/octet-stream',
  'image/png',
  'image/jpeg',
  'image/gif',
  'image/webp',
];

function root(): string {
  return resolve(env.ATTACHMENT_DIR);
}

/**
 * Makes a safe file name. The name is only used for the download header, so
 * it is reduced to characters that cannot be used to build a path.
 */
export function safeFilename(name: string): string {
  const base = name.split(/[\\/]/).pop() ?? 'file';
  const cleaned = base.replace(/[^a-zA-Z0-9._-]/g, '_').replace(/^\.+/, '').slice(0, 120);
  return cleaned || 'file';
}

/** The absolute path of a stored file, guaranteed to stay inside the root. */
export function attachmentPath(storageKey: string): string {
  const target = resolve(join(root(), storageKey));
  if (target !== root() && !target.startsWith(root() + '/')) {
    throw badRequest('That attachment path is not allowed.');
  }
  return target;
}

/** The key a new attachment is stored under. */
export function storageKeyFor(ticketId: string, messageId: string, filename: string): string {
  const random = randomBytes(12).toString('hex');
  return `${ticketId}/${messageId}/${random}-${safeFilename(filename)}`;
}

export interface StoredAttachment {
  storageKey: string;
  sha256: string;
  size: number;
}

/** Writes the bytes of an attachment and returns its metadata. */
export async function storeAttachment(params: {
  storageKey: string;
  content: Buffer;
}): Promise<StoredAttachment> {
  const target = attachmentPath(params.storageKey);
  await mkdir(dirname(target), { recursive: true });
  await writeFile(target, params.content, { mode: 0o640 });
  return {
    storageKey: params.storageKey,
    sha256: createHash('sha256').update(params.content).digest('hex'),
    size: params.content.byteLength,
  };
}

/** Reads a stored attachment. */
export async function readAttachment(storageKey: string): Promise<Buffer> {
  return readFile(attachmentPath(storageKey));
}

/** Removes a stored attachment. */
export async function removeAttachment(storageKey: string): Promise<void> {
  await rm(attachmentPath(storageKey), { force: true });
}

/** Checks the type and the size of an upload before it is stored. */
export function validateAttachment(contentType: string, size: number): void {
  if (!ALLOWED_ATTACHMENT_TYPES.includes(contentType)) {
    throw badRequest('That file type cannot be attached.');
  }
  if (size > MAX_ATTACHMENT_BYTES) {
    throw badRequest(`A file may not be larger than ${Math.round(MAX_ATTACHMENT_BYTES / 1024 / 1024)} MB.`);
  }
}

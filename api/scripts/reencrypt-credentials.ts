/**
 * One-time migration from SESSION_SECRET-derived v1 ciphertext to independently
 * keyed v2 ciphertext. Read and follow docs/SECURE-KEY-ROTATION.md first.
 *
 * Default is preflight only. --apply requires DATA_ENCRYPTION_SECRET and a
 * verified backup. Run before rotating SESSION_SECRET.
 */
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { decryptSecret, upgradeSecretEncryption } from '../src/lib/secrets.js';

const apply = process.argv.includes('--apply');
const unexpected = process.argv.filter((arg) => arg.startsWith('--') && arg !== '--apply' && arg !== '--dry-run');
if (unexpected.length) throw new Error('Unknown arguments; use --dry-run or --apply.');
if (!env.DATA_ENCRYPTION_SECRET) throw new Error('DATA_ENCRYPTION_SECRET is required.');
if (apply && process.argv.includes('--dry-run')) throw new Error('Choose --apply OR --dry-run.');

type Item = { kind: 'panel'; id: string; field: 'tokenEnc'; old: string } |
  { kind: 'instance'; id: string; field: 'generatedVariables' | 'customerVariables'; old: string };

async function scan(): Promise<Item[]> {
  const items: Item[] = [];
  let cursor: string | undefined;
  do {
    const page = await prisma.panelCredential.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, tokenEnc: true },
    });
    for (const row of page) if (row.tokenEnc.startsWith('v1.')) items.push({
      kind: 'panel', id: row.id, field: 'tokenEnc', old: row.tokenEnc,
    });
    cursor = page.length === 100 ? page[page.length - 1]!.id : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const page = await prisma.instance.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, generatedVariables: true, customerVariables: true },
    });
    for (const row of page) {
      for (const field of ['generatedVariables', 'customerVariables'] as const) {
        const old = row[field];
        if (old?.startsWith('v1.')) items.push({ kind: 'instance', id: row.id, field, old });
      }
    }
    cursor = page.length === 100 ? page[page.length - 1]!.id : undefined;
  } while (cursor);
  return items;
}

try {
  const pending = await scan();
  // All legacy records must be decryptable with the existing SESSION_SECRET.
  // Abort before changing anything if one cannot be opened.
  const invalid = pending.filter((item) => decryptSecret(item.old) === null);
  console.log('Legacy ciphertext records:', pending.length);
  console.log('Unreadable legacy records:', invalid.length);
  if (invalid.length) throw new Error('Preflight failed. Restore original SESSION_SECRET and investigate before retrying.');
  if (!apply) {
    console.log('DRY RUN: no database changes. Re-run with --apply after backup verification.');
  } else {
    let updated = 0;
    for (const item of pending) {
      const encrypted = upgradeSecretEncryption(item.old);
      if (!encrypted?.startsWith('v2.')) throw new Error('Re-encryption failed.');
      const change = item.kind === 'panel'
        ? await prisma.panelCredential.updateMany({
            where: { id: item.id, tokenEnc: item.old },
            data: { tokenEnc: encrypted },
          })
        : await prisma.instance.updateMany({
            where: { id: item.id, [item.field]: item.old },
            data: { [item.field]: encrypted },
          });
      if (change.count !== 1) {
        throw new Error('A row changed concurrently; stop and repeat the preflight.');
      }
      updated++;
    }
    const remaining = await scan();
    console.log('Migrated records:', updated);
    console.log('Legacy records remaining:', remaining.length);
    if (remaining.length) throw new Error('Some legacy ciphertext remains; do not rotate SESSION_SECRET.');
    console.log('All scanned v1 customer credentials migrated. Validate decryptions before rotating SESSION_SECRET.');
  }
} finally {
  await prisma.$disconnect();
}

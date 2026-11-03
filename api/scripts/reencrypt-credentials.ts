/**
 * Dry-run-first migration from SESSION_SECRET-derived v1 ciphertext to v2.
 * Read docs/SECURE-KEY-ROTATION.md before use. No secret value is printed.
 */
import { prisma } from '../src/db.js';
import { env } from '../src/env.js';
import { decryptSecret, upgradeSecretEncryption } from '../src/lib/secrets.js';

const apply = process.argv.includes('--apply');
const dryRun = process.argv.includes('--dry-run');
const unexpected = process.argv.filter((arg) => arg.startsWith('--') && arg !== '--apply' && arg !== '--dry-run');
if (unexpected.length) throw new Error('Unknown arguments; use --dry-run or --apply.');
if (!env.DATA_ENCRYPTION_SECRET) throw new Error('DATA_ENCRYPTION_SECRET is required.');
if (apply && dryRun) throw new Error('Choose --apply OR --dry-run.');

type Item =
  | { kind: 'panel'; id: string; old: string }
  | { kind: 'instance-generated'; id: string; old: string }
  | { kind: 'instance-customer'; id: string; old: string }
  | { kind: 'two-factor'; id: string; old: string }
  | { kind: 'git-webhook'; id: string; old: string };

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
    for (const row of page) if (row.tokenEnc.startsWith('v1.')) items.push({ kind: 'panel', id: row.id, old: row.tokenEnc });
    cursor = page.length === 100 ? page.at(-1)!.id : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const page: { id: string; generatedVariables: string | null; customerVariables: string | null }[] = await prisma.instance.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, generatedVariables: true, customerVariables: true },
    });
    for (const row of page) {
      if (row.generatedVariables?.startsWith('v1.')) items.push({ kind: 'instance-generated', id: row.id, old: row.generatedVariables });
      if (row.customerVariables?.startsWith('v1.')) items.push({ kind: 'instance-customer', id: row.id, old: row.customerVariables });
    }
    cursor = page.length === 100 ? page.at(-1)!.id : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const page: { userId: string; secretEnc: string }[] = await prisma.userTwoFactor.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { userId: cursor } } : {}),
      orderBy: { userId: 'asc' },
      select: { userId: true, secretEnc: true },
    });
    for (const row of page) if (row.secretEnc.startsWith('v1.')) items.push({ kind: 'two-factor', id: row.userId, old: row.secretEnc });
    cursor = page.length === 100 ? page.at(-1)!.userId : undefined;
  } while (cursor);

  cursor = undefined;
  do {
    const page: { id: string; webhookSecret: string | null }[] = await prisma.gitDeploy.findMany({
      take: 100,
      ...(cursor ? { skip: 1, cursor: { id: cursor } } : {}),
      orderBy: { id: 'asc' },
      select: { id: true, webhookSecret: true },
    });
    for (const row of page) if (row.webhookSecret?.startsWith('v1.')) items.push({ kind: 'git-webhook', id: row.id, old: row.webhookSecret });
    cursor = page.length === 100 ? page.at(-1)!.id : undefined;
  } while (cursor);
  return items;
}

async function update(item: Item, encrypted: string): Promise<number> {
  switch (item.kind) {
    case 'panel':
      return (await prisma.panelCredential.updateMany({ where: { id: item.id, tokenEnc: item.old }, data: { tokenEnc: encrypted } })).count;
    case 'instance-generated':
      return (await prisma.instance.updateMany({ where: { id: item.id, generatedVariables: item.old }, data: { generatedVariables: encrypted } })).count;
    case 'instance-customer':
      return (await prisma.instance.updateMany({ where: { id: item.id, customerVariables: item.old }, data: { customerVariables: encrypted } })).count;
    case 'two-factor':
      return (await prisma.userTwoFactor.updateMany({ where: { userId: item.id, secretEnc: item.old }, data: { secretEnc: encrypted } })).count;
    case 'git-webhook':
      return (await prisma.gitDeploy.updateMany({ where: { id: item.id, webhookSecret: item.old }, data: { webhookSecret: encrypted } })).count;
  }
}

try {
  const pending = await scan();
  const invalid = pending.filter((item) => decryptSecret(item.old) === null);
  console.log('Legacy ciphertext records:', pending.length);
  console.log('Unreadable legacy records:', invalid.length);
  if (invalid.length) throw new Error('Preflight failed. Restore the original SESSION_SECRET and investigate.');
  if (!apply) {
    console.log('DRY RUN: no database changes. Re-run with --apply only after backup verification.');
  } else {
    let updated = 0;
    for (const item of pending) {
      const encrypted = upgradeSecretEncryption(item.old);
      if (!encrypted?.startsWith('v2.')) throw new Error('Re-encryption failed.');
      if (await update(item, encrypted) !== 1) throw new Error('A row changed concurrently; repeat the preflight.');
      updated += 1;
    }
    const remaining = await scan();
    console.log('Migrated records:', updated);
    console.log('Legacy records remaining:', remaining.length);
    if (remaining.length) throw new Error('Legacy ciphertext remains; do not rotate SESSION_SECRET.');
    console.log('Migration complete. Validate credential reads before rotating SESSION_SECRET.');
  }
} finally {
  await prisma.$disconnect();
}

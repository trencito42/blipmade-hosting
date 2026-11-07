import { prisma } from '../src/db.js';
import { assertDisposableDatabase } from '../src/lib/test-target.js';
import { setGateFactsSource } from '../src/services/readiness-gate.js';

/**
 * Safety net. The suite truncates every table, so it must never be pointed at
 * a database that holds real data. The guard is the one of the platform, so
 * the rule is written once and the same rule applies to the scripts that
 * change data.
 */
assertDisposableDatabase({ label: 'run the tests' });

/**
 * Every test file starts from an empty database. The list is read from the
 * database so a new table is emptied too. The migration history stays.
 */
export async function resetDatabase(): Promise<void> {
  const rows = await prisma.$queryRaw<{ tablename: string }[]>`
    SELECT tablename FROM pg_tables
    WHERE schemaname = 'public' AND tablename <> '_prisma_migrations'
  `;
  const names = rows
    .map((row) => row.tablename)
    .filter((name) => /^[A-Za-z0-9_]+$/.test(name))
    .map((name) => `"${name}"`);
  if (!names.length) return;

  await prisma.$transaction(
    async (tx) => {
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(8723341)`;
      await tx.$executeRawUnsafe(`TRUNCATE TABLE ${names.join(', ')} CASCADE`);
    },
    { timeout: 30000, maxWait: 30000 },
  );
}

/**
 * The suite has no panel, so the readiness gate reads facts that say the
 * panel answers and has room. The gate itself is tested with its own facts.
 */
setGateFactsSource(async () => ({
  panelConfigured: true,
  eggs: { known: false, ids: new Set(), names: new Set() },
  nodes: [{ freeMemoryMb: 1_000_000, freeDiskMb: 100_000_000 }],
  proxmoxConfigured: true,
  vpsCapacity: { freeMemoryMb: 1_000_000, freeDiskGb: 1_000, usedSlots: 0, maxSlots: 150 },
}));

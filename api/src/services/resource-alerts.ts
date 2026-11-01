import { prisma } from '../db.js';
import * as client from './pterodactyl/client.js';
import * as operations from './panel/operations.js';
import { notifyResourceHigh } from './notifications.js';

/** An alert is not sent again for 6 hours while the use stays high; it is armed again once the use is back below. */
const REPEAT_MS = 6 * 3_600_000;

/** The percentage of a limit that is used, rounded. A limit of zero is no limit. */
export function percentOf(usedBytes: number, limitBytes: number): number | null {
  return limitBytes > 0 ? Math.round((usedBytes / limitBytes) * 100) : null;
}

/** Which of the thresholds are passed, as sentences for the message. Empty when none is. */
export function passedThresholds(
  memory: { used: number | null; threshold: number | null },
  disk: { used: number | null; threshold: number | null },
): string[] {
  const lines: string[] = [];
  if (memory.threshold !== null && memory.used !== null && memory.used >= memory.threshold) lines.push(`Memory use is at ${memory.used}% of the plan (you asked to be told at ${memory.threshold}%).`);
  if (disk.threshold !== null && disk.used !== null && disk.used >= disk.threshold) lines.push(`Disk use is at ${disk.used}% of the plan (you asked to be told at ${disk.threshold}%).`);
  return lines;
}

/** The pass over the services that have an alert on. One failure is skipped and the pass goes on. */
export async function sweepResourceAlerts(limit = 300): Promise<{ checked: number; sent: number }> {
  const rows = await prisma.instance.findMany({
    where: { status: 'ONLINE', pterodactylUuid: { not: null }, OR: [{ alertMemoryPercent: { not: null } }, { alertDiskPercent: { not: null } }] },
    select: { id: true, name: true, userId: true, ram: true, disk: true, alertMemoryPercent: true, alertDiskPercent: true, resourceAlertedAt: true, pterodactylUuid: true, pterodactylServerId: true, status: true, generatedVariables: true, product: { select: { generatedVariables: true } } },
    take: limit,
  });
  let sent = 0;
  for (const row of rows) {
    try {
      const instance = { id: row.id, userId: row.userId, pterodactylUuid: row.pterodactylUuid, pterodactylServerId: row.pterodactylServerId, status: row.status, generatedVariables: row.generatedVariables, productVariables: row.product.generatedVariables };
      const token = await operations.customerToken(instance);
      const usage = await client.getResources(token, row.pterodactylUuid as string);
      const memory = percentOf(usage.memory_bytes, row.ram * 1024 * 1024);
      const disk = percentOf(usage.disk.used, row.disk * 1024 * 1024 * 1024);
      const lines = passedThresholds({ used: memory, threshold: row.alertMemoryPercent }, { used: disk, threshold: row.alertDiskPercent });
      if (lines.length === 0) {
        if (row.resourceAlertedAt) await prisma.instance.update({ where: { id: row.id }, data: { resourceAlertedAt: null } });
        continue;
      }
      if (row.resourceAlertedAt && Date.now() - row.resourceAlertedAt.getTime() < REPEAT_MS) continue;
      await notifyResourceHigh({ userId: row.userId, instanceName: row.name, message: lines.join(' '), occurrence: new Date().toISOString().slice(0, 13) });
      await prisma.instance.update({ where: { id: row.id }, data: { resourceAlertedAt: new Date() } });
      sent += 1;
    } catch {
      /* a service that cannot be read is skipped */
    }
  }
  return { checked: rows.length, sent };
}

import { createHmac } from 'node:crypto';
import { prisma } from '../db.js';
import { env } from '../env.js';

/** What the browser sends: a short token made of letters and digits. Anything else is ignored. */
const DEVICE_ID = /^[A-Za-z0-9]{8,64}$/;

/**
 * Remembers, as a keyed hash, which browser an account used to activate a free service.
 *
 * The identifier comes from the client, so it can be absent, copied or made up. It is a hint for the
 * risk score and never a reason to refuse by itself. Only the hash is stored.
 */
export async function recordDeviceSignal(userId: string, deviceId: string | undefined): Promise<void> {
  if (!env.DEVICE_FINGERPRINT_SECRET || !deviceId || !DEVICE_ID.test(deviceId)) return;
  const hash = createHmac('sha256', env.DEVICE_FINGERPRINT_SECRET).update(`device:${deviceId}`).digest('hex');
  await prisma.deviceSignal.upsert({
    where: { userId_hash: { userId, hash } },
    create: { userId, hash },
    update: {},
  });
}

/** Other accounts that activated a free service from a browser this account also used. */
export async function deviceLinkedTrials(userId: string): Promise<number> {
  const mine = await prisma.deviceSignal.findMany({ where: { userId }, select: { hash: true }, take: 20 });
  if (!mine.length) return 0;
  const others = await prisma.deviceSignal.findMany({
    where: { hash: { in: mine.map((row) => row.hash) }, userId: { not: userId } },
    select: { userId: true },
    distinct: ['userId'],
    take: 50,
  });
  if (!others.length) return 0;
  return prisma.promotionRedemption.groupBy({
    by: ['userId'],
    where: { userId: { in: others.map((row) => row.userId) }, order: { total: 0, status: { in: ['PAID', 'FULFILLED'] } } },
  }).then((rows) => rows.length);
}

export async function pruneDeviceSignals(): Promise<number> {
  const cutoff = new Date(Date.now() - env.DEVICE_SIGNAL_RETENTION_DAYS * 86_400_000);
  return (await prisma.deviceSignal.deleteMany({ where: { createdAt: { lt: cutoff } } })).count;
}

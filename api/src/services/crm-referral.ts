import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { randomToken } from '../lib/tokens.js';

function codeOf(): string {
  return randomToken(6).replace(/[^a-zA-Z0-9]/g, 'X').slice(0, 8).toUpperCase();
}

export async function ensureReferralCode(userId: string): Promise<string> {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { referralCode: true } });
  if (current?.referralCode) return current.referralCode;
  for (let attempt = 0; attempt < 8; attempt += 1) {
    const code = codeOf();
    try {
      const updated = await prisma.user.update({ where: { id: userId }, data: { referralCode: code }, select: { referralCode: true } });
      if (updated.referralCode) return updated.referralCode;
    } catch (error) {
      if (!(error instanceof Prisma.PrismaClientKnownRequestError) || error.code !== 'P2002') throw error;
    }
  }
  throw new Error('A referral code could not be allocated.');
}

export async function claimReferral(referredId: string, code: string): Promise<{ ok: true } | { ok: false; reason: string }> {
  const trimmed = code.trim().toUpperCase();
  if (!trimmed) return { ok: false, reason: 'The referral code is missing.' };
  const referrer = await prisma.user.findUnique({ where: { referralCode: trimmed }, select: { id: true, emailIdentity: true } });
  if (!referrer) return { ok: false, reason: 'This referral code is not valid.' };
  if (referrer.id === referredId) return { ok: false, reason: 'An account cannot refer itself.' };
  const referred = await prisma.user.findUnique({ where: { id: referredId }, select: { emailIdentity: true } });
  if (referrer.emailIdentity && referred?.emailIdentity && referrer.emailIdentity === referred.emailIdentity) {
    return { ok: false, reason: 'An account cannot refer itself.' };
  }
  const existing = await prisma.referralAttribution.findUnique({ where: { referredId } });
  if (existing) return { ok: false, reason: 'This account already has a referrer.' };
  try {
    await prisma.referralAttribution.create({
      data: { referrerId: referrer.id, referredId, code: trimmed, status: 'pending' },
    });
  } catch (error) {
    if (error instanceof Prisma.PrismaClientKnownRequestError && error.code === 'P2002') {
      return { ok: false, reason: 'This account already has a referrer.' };
    }
    throw error;
  }
  return { ok: true };
}

export async function qualifyReferral(userId: string, orderId: string): Promise<void> {
  const row = await prisma.referralAttribution.findUnique({ where: { referredId: userId } });
  if (!row || row.status !== 'pending') return;
  const paid = await prisma.order.count({ where: { userId, status: { in: ['PAID', 'FULFILLED'] } } });
  if (paid < 1) return;
  await prisma.referralAttribution.update({
    where: { id: row.id },
    data: { status: 'qualified', orderId },
  });
}

export async function reverseReferralOnOrder(orderId: string): Promise<void> {
  await prisma.referralAttribution.updateMany({
    where: { orderId, status: 'qualified' },
    data: { status: 'reversed' },
  });
}

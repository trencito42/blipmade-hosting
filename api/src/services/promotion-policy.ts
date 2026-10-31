import { prisma } from '../db.js';
import { env } from '../env.js';
import { audit } from '../lib/audit.js';
import { badRequest } from '../lib/errors.js';
import { assessCustomer, type Risk } from './risk.js';

/**
 * What an order that a promotion covers entirely may contain.
 *
 * A fully sponsored order provisions real compute without a payment, so it is
 * kept to one small starter service. The limits can be raised with the
 * environment; the defaults suit a small app, bot or game server. Servers and
 * mail are never sponsored.
 */
export const sponsoredPolicy = {
  maxRamMb: env.PROMOTION_FREE_MAX_RAM_MB,
  maxCpu: env.PROMOTION_FREE_MAX_CPU,
  maxDiskGb: env.PROMOTION_FREE_MAX_DISK_GB,
};

interface QuoteLine {
  quantity?: number;
  ram: number;
  cpu: number;
  disk: number;
  fulfilment: string;
  vps?: unknown;
}

/** Refuses a fully sponsored order that is more than one small starter service. */
export function assertSponsoredShape(items: QuoteLine[]): void {
  if (items.length !== 1 || (items[0].quantity ?? 1) !== 1) {
    throw badRequest('A free promotion covers exactly one service. Remove the other items or lower the quantity to 1.');
  }
  const [line] = items;
  if (line.fulfilment !== 'SERVER' || line.vps) {
    throw badRequest('This promotion only covers an app, bot or game server, not a virtual server or a mail plan.');
  }
  if (line.ram > sponsoredPolicy.maxRamMb || line.cpu > sponsoredPolicy.maxCpu || line.disk > sponsoredPolicy.maxDiskGb) {
    throw badRequest(
      `A free promotion covers up to ${sponsoredPolicy.maxRamMb} MB of memory, ${sponsoredPolicy.maxCpu} CPU and ${sponsoredPolicy.maxDiskGb} GB of disk. Choose a smaller size.`,
    );
  }
}

export type SponsoredDecision = { decision: 'approve' | 'review'; risk: Risk | null; cardCheck: boolean };

/**
 * Decides whether a fully sponsored order may be provisioned automatically.
 *
 * Low risk is approved. Medium risk is approved with one more safeguard: a
 * real card must be verified when a payment provider is available. High risk
 * is not provisioned automatically and goes to support. A shared address, a
 * VPN or a new account only add to the score, they never refuse by themselves.
 * Every decision is written to the audit trail with its reasons.
 */
export async function decideSponsoredOrder(user: { id: string; email: string }, orderRef: string | null): Promise<SponsoredDecision> {
  const risk = await assessCustomer(user.id);
  const level = risk?.level ?? 'medium';
  const decision: SponsoredDecision = {
    decision: level === 'high' ? 'review' : 'approve',
    risk,
    cardCheck: level === 'medium' && env.paymentsEnabled,
  };
  await audit({
    actorId: user.id,
    actorEmail: user.email,
    action: `promotion.free_${decision.decision === 'approve' ? 'approved' : 'held'}`,
    targetType: orderRef ? 'order' : 'user',
    targetId: orderRef ?? user.id,
    meta: { level, score: risk?.score ?? null, cardCheck: decision.cardCheck, reasons: risk?.signals.map((s) => s.id) ?? [] },
  });
  return decision;
}

export function heldForReview(): never {
  throw badRequest('We could not approve this free service automatically. Please contact support and we will review it.');
}

/** True when this account already holds or reserved a free service from any code. */
export async function hasFreeEntitlement(userId: string, exceptOrderId: string, cutoff: Date): Promise<boolean> {
  const found = await prisma.promotionRedemption.findFirst({
    where: {
      userId,
      orderId: { not: exceptOrderId },
      order: {
        total: 0,
        OR: [
          { status: { in: ['PAID', 'FULFILLED'] } },
          { status: { in: ['PENDING', 'AWAITING_PAYMENT'] }, createdAt: { gte: cutoff } },
        ],
      },
    },
    select: { id: true },
  });
  return Boolean(found);
}

/** Cloudflare Turnstile, checked on the server. Off unless a secret is configured. */
export async function verifyTurnstile(token: string | undefined, ip: string): Promise<void> {
  if (!env.TURNSTILE_SECRET_KEY) return;
  if (!token) throw badRequest('Complete the human check to activate this free service.');
  let ok = false;
  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'content-type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ secret: env.TURNSTILE_SECRET_KEY, response: token, remoteip: ip }),
      signal: AbortSignal.timeout(5000),
    });
    ok = response.ok && ((await response.json()) as { success?: boolean }).success === true;
  } catch {
    throw badRequest('The human check could not be completed right now. Try again in a moment.');
  }
  if (!ok) throw badRequest('The human check failed. Reload the page and try again.');
}

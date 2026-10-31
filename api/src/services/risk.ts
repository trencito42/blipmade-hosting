import { prisma } from '../db.js';
import { env } from '../env.js';
import { isDisposableEmail } from '../lib/email-identity.js';

/**
 * A score for how much a person at the staff desk should look twice at an account.
 *
 * It is a set of plain signals, each with a weight and a sentence, added up to a number from 0 to
 * 100. It decides nothing by itself: it tells the team where to look, and why. Nothing here uses
 * what a person is, only what the account does.
 */
export interface RiskSignal { id: string; weight: number; text: string }
export interface Risk { score: number; level: 'low' | 'medium' | 'high'; signals: RiskSignal[] }

export interface RiskFacts {
  ageHours: number;
  emailVerified: boolean;
  disposableEmail: boolean;
  /** Other accounts that signed in from an address this one used. */
  sharedAddressAccounts: number;
  /** Other accounts with the same canonical address (an alias of the same mailbox). */
  sameIdentityAccounts: number;
  failedPayments: number;
  ordersLast24h: number;
  refunds: number;
  openAbuseReports: number;
  suspended: boolean;
  paidBefore: boolean;
}

/** The pure part: facts in, score out. */
export function scoreRisk(facts: RiskFacts): Risk {
  const signals: RiskSignal[] = [];
  const add = (id: string, weight: number, text: string) => signals.push({ id, weight, text });

  if (facts.ageHours < 24) add('new', 10, 'The account is less than a day old.');
  if (!facts.emailVerified) add('unverified', 10, 'The email address was never confirmed.');
  if (facts.disposableEmail) add('disposable', 20, 'The address belongs to a service of throwaway mailboxes.');
  if (facts.sameIdentityAccounts > 0) add('same-identity', 25, `${facts.sameIdentityAccounts} other account(s) use the same mailbox under another spelling.`);
  if (facts.sharedAddressAccounts > 0) add('shared-address', Math.min(30, 12 + facts.sharedAddressAccounts * 6), `${facts.sharedAddressAccounts} other account(s) signed in from the same address.`);
  if (facts.failedPayments >= 2) add('failed-payments', Math.min(25, facts.failedPayments * 8), `${facts.failedPayments} payments failed.`);
  if (facts.ordersLast24h >= 3) add('burst', 15, `${facts.ordersLast24h} orders in the last day.`);
  if (facts.refunds > 0) add('refunds', Math.min(20, facts.refunds * 10), `${facts.refunds} refund(s) in the history.`);
  if (facts.openAbuseReports > 0) add('abuse', 35, `${facts.openAbuseReports} open report(s) of abuse about its services.`);
  if (facts.suspended) add('suspended', 10, 'The account is suspended.');
  // A customer who has paid before is a known quantity: that lowers the score.
  if (facts.paidBefore) signals.push({ id: 'paid-before', weight: -20, text: 'A payment was made and kept before.' });

  const score = Math.max(0, Math.min(100, signals.reduce((sum, signal) => sum + signal.weight, 0)));
  return { score, level: score >= 55 ? 'high' : score >= 25 ? 'medium' : 'low', signals };
}

/** Reads the facts of an account from the tables of the platform. */
export async function assessCustomer(userId: string): Promise<Risk | null> {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return null;
  const since = new Date(Date.now() - 86_400_000);

  const [sessions, failedPayments, ordersLast24h, refunds, paid, instances] = await Promise.all([
    prisma.session.findMany({ where: { userId }, select: { ip: true }, take: 200 }),
    prisma.payment.count({ where: { userId, status: 'FAILED' } }),
    prisma.order.count({ where: { userId, createdAt: { gte: since } } }),
    prisma.payment.count({ where: { userId, status: 'REFUNDED' } }),
    prisma.payment.count({ where: { userId, status: 'SUCCEEDED' } }),
    prisma.instance.findMany({ where: { userId }, select: { id: true } }),
  ]);
  const ips = [...new Set(sessions.map((session) => session.ip).filter((ip): ip is string => Boolean(ip)))];
  // The canonical address of an account is unique, so a second account with the same mailbox cannot
  // exist and that signal stays at zero here; it is kept in the score for the day it can.
  const sameIdentity = 0;
  const [shared, abuse] = await Promise.all([
    ips.length ? prisma.session.findMany({ where: { ip: { in: ips }, userId: { not: userId } }, select: { userId: true }, distinct: ['userId'], take: 50 }) : Promise.resolve([]),
    instances.length ? prisma.abuseReport.count({ where: { instanceId: { in: instances.map((instance) => instance.id) }, status: { in: ['open', 'investigating'] } } }) : Promise.resolve(0),
  ]);

  return scoreRisk({
    ageHours: (Date.now() - user.createdAt.getTime()) / 3_600_000,
    emailVerified: Boolean(user.emailVerifiedAt),
    disposableEmail: isDisposableEmail(user.email, env.DISPOSABLE_EMAIL_DOMAINS),
    sharedAddressAccounts: shared.length,
    sameIdentityAccounts: sameIdentity,
    failedPayments,
    ordersLast24h,
    refunds,
    openAbuseReports: abuse,
    suspended: Boolean(user.suspendedAt),
    paidBefore: paid > 0 && refunds === 0,
  });
}

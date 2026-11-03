import type { Role } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, conflict, forbidden } from '../lib/errors.js';
import { emailIdentity } from '../lib/email-identity.js';
import { hashPassword, staffPasswordProblems } from '../lib/password.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { env } from '../env.js';
import { sendMail } from '../lib/mailer.js';

export const STAFF_INVITE_TTL_MS = 72 * 60 * 60 * 1000;

/** Ends administrative sessions and API keys. Customer password, passkeys and two-factor stay. */
export async function revokeAdministrativeAccess(userId: string): Promise<void> {
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.apiKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } });
}

export async function activeAdministratorCount(exceptUserId?: string): Promise<number> {
  return prisma.user.count({
    where: {
      role: 'ADMIN',
      suspendedAt: null,
      ...(exceptUserId ? { id: { not: exceptUserId } } : {}),
    },
  });
}

export async function assertNotLastAdministrator(userId: string, nextRole: Role): Promise<void> {
  const current = await prisma.user.findUnique({ where: { id: userId }, select: { role: true, suspendedAt: true } });
  if (!current || current.role !== 'ADMIN' || current.suspendedAt || nextRole === 'ADMIN') return;
  if ((await activeAdministratorCount(userId)) < 1) {
    throw conflict('This is the last active administrator. Add another administrator first.');
  }
}

export async function searchStaffCandidates(query: string) {
  const needle = query.trim();
  const users = await prisma.user.findMany({
    where: {
      role: 'CUSTOMER',
      isGuest: false,
      suspendedAt: null,
      OR: [
        { email: { contains: needle, mode: 'insensitive' } },
        { firstName: { contains: needle, mode: 'insensitive' } },
        { lastName: { contains: needle, mode: 'insensitive' } },
      ],
    },
    select: { id: true, email: true, firstName: true, lastName: true, emailVerifiedAt: true },
    orderBy: { email: 'asc' },
    take: 8,
  });
  return users.map((user) => ({
    userId: user.id,
    email: user.email,
    name: `${user.firstName} ${user.lastName}`.trim(),
    emailVerified: Boolean(user.emailVerifiedAt),
  }));
}

export async function grantExistingCustomer(userId: string, role: 'STAFF' | 'ADMIN') {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, isGuest: true, suspendedAt: true, email: true } });
  if (!user || user.isGuest) throw badRequest('Choose a registered customer account.');
  if (user.suspendedAt) throw conflict('A suspended account cannot be given staff access.');
  if (user.role !== 'CUSTOMER') throw conflict('This account already has staff access. Change it from the staff list.');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role } }),
    prisma.staffMember.upsert({ where: { userId }, update: {}, create: { userId, permissions: [] } }),
  ]);
  return { userId, email: user.email, role };
}

export async function removeStaffAccess(userId: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, role: true, email: true } });
  if (!user || (user.role !== 'STAFF' && user.role !== 'ADMIN')) throw badRequest('This account does not have staff access.');
  await assertNotLastAdministrator(userId, 'CUSTOMER');
  await prisma.$transaction([
    prisma.user.update({ where: { id: userId }, data: { role: 'CUSTOMER' } }),
    prisma.staffMember.deleteMany({ where: { userId } }),
    prisma.session.deleteMany({ where: { userId } }),
    prisma.apiKey.updateMany({ where: { userId, revokedAt: null }, data: { revokedAt: new Date() } }),
  ]);
  return { userId, email: user.email, previousRole: user.role };
}

export async function createStaffInvitation(input: { email: string; role: 'STAFF' | 'ADMIN'; invitedById: string }) {
  const email = input.email.trim().toLowerCase();
  const identity = emailIdentity(email);
  const existing = await prisma.user.findFirst({ where: { OR: [{ email }, { emailIdentity: identity }] }, select: { id: true, role: true } });
  if (existing) throw conflict('An account already uses this email address. Add that customer instead of inviting a new one.');
  const token = randomToken();
  const expiresAt = new Date(Date.now() + STAFF_INVITE_TTL_MS);
  await prisma.staffInvitation.deleteMany({ where: { email, usedAt: null } });
  const invitation = await prisma.staffInvitation.create({
    data: { email, role: input.role, tokenHash: hashToken(token), expiresAt, invitedById: input.invitedById },
    select: { id: true, email: true, role: true, expiresAt: true },
  });
  const link = `${env.publicWebUrl}/staff-invite?token=${encodeURIComponent(token)}`;
  const sent = await sendMail({
    to: email,
    kind: 'staff-invite',
    subject: 'You are invited to the Blipmade staff area',
    text: `Use this single-use link within 72 hours to create your staff sign-in. It will not be sent again.\n\n${link}\n`,
    idempotencyKey: `staff-invite:${invitation.id}`,
  });
  if (sent.state === 'failed') {
    await prisma.staffInvitation.delete({ where: { id: invitation.id } });
    throw badRequest('The invitation could not be sent.');
  }
  return invitation;
}

export async function acceptStaffInvitation(input: { token: string; password: string; firstName: string; lastName: string }) {
  const problems = staffPasswordProblems(input.password);
  if (problems.length) throw badRequest(problems.join(' '), { password: problems.join(' ') });
  const tokenHash = hashToken(input.token);
  const record = await prisma.staffInvitation.findUnique({ where: { tokenHash } });
  if (!record || record.usedAt || record.expiresAt.getTime() <= Date.now() || (record.role !== 'STAFF' && record.role !== 'ADMIN')) {
    throw badRequest('This invitation is invalid or has expired.');
  }
  const identity = emailIdentity(record.email);
  const existing = await prisma.user.findFirst({ where: { OR: [{ email: record.email }, { emailIdentity: identity }] }, select: { id: true } });
  if (existing) throw conflict('An account already uses this email address.');
  const passwordHash = await hashPassword(input.password);
  return prisma.$transaction(async (tx) => {
    const claimed = await tx.staffInvitation.updateMany({
      where: { id: record.id, usedAt: null, expiresAt: { gt: new Date() } },
      data: { usedAt: new Date() },
    });
    if (claimed.count !== 1) throw badRequest('This invitation is invalid or has expired.');
    const user = await tx.user.create({
      data: {
        email: record.email,
        emailIdentity: identity,
        passwordHash,
        firstName: input.firstName.trim(),
        lastName: input.lastName.trim(),
        role: record.role,
        emailVerifiedAt: new Date(),
        staff: { create: { permissions: [] } },
      },
      select: { id: true, email: true, role: true },
    });
    return user;
  });
}

export function assertAdministrator(role: string): void {
  if (role !== 'ADMIN') throw forbidden('Only an administrator can change who has staff access.');
}

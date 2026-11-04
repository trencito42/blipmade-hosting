import { prisma } from '../db.js';

/** Whether the account can sign in with an email password. */
export function userHasPassword(passwordHash: string | null | undefined): boolean {
  return Boolean(passwordHash && passwordHash.length > 0);
}

export async function countUsableAuthMethods(userId: string): Promise<number> {
  const [user, identities, passkeys] = await Promise.all([
    prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } }),
    prisma.connectedIdentity.count({ where: { userId } }),
    prisma.passkey.count({ where: { userId } }),
  ]);
  let count = identities + passkeys;
  if (user && userHasPassword(user.passwordHash)) count += 1;
  return count;
}

export async function assertCanUnlink(userId: string): Promise<void> {
  const count = await countUsableAuthMethods(userId);
  if (count <= 1) {
    const { badRequest } = await import('../lib/errors.js');
    throw badRequest('Connect another sign-in method before removing this one.');
  }
}

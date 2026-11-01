import { prisma } from '../db.js';
import { verifyPassword } from '../lib/password.js';

/**
 * Whether a password is already the password of another member of staff.
 *
 * Passwords are stored salted, so two equal passwords do not look equal in the database: the new
 * password is tried against each staff hash. There are few of them, so it is cheap.
 */
export async function passwordUsedByOtherStaff(password: string, exceptUserId: string): Promise<boolean> {
  const staff = await prisma.user.findMany({
    where: { id: { not: exceptUserId }, OR: [{ role: 'ADMIN' }, { staff: { isNot: null } }] },
    select: { passwordHash: true },
    take: 200,
  });
  for (const member of staff) {
    if (await verifyPassword(password, member.passwordHash)) return true;
  }
  return false;
}

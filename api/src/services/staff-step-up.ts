import { prisma } from '../db.js';
import { AppError } from '../lib/errors.js';
import { verifyPassword } from '../lib/password.js';
import { decryptSecret } from '../lib/secrets.js';
import { verifyTotp } from '../lib/two-factor.js';

export type StaffStepUpCredential = { password: string } | { code: string };

/**
 * Verifies and consumes one credential for a sensitive staff action.
 *
 * TOTP steps are consumed with a conditional update so two concurrent requests
 * cannot reuse the same code. The caller only receives the method; credential
 * values never leave this function and must never be written to the audit log.
 */
export async function verifyStaffStepUp(userId: string, credential: StaffStepUpCredential): Promise<'password' | 'totp' | null> {
  if ('password' in credential) {
    const user = await prisma.user.findUnique({ where: { id: userId }, select: { passwordHash: true } });
    if (!user || !(await verifyPassword(credential.password, user.passwordHash))) return null;
    return 'password';
  }

  const row = await prisma.userTwoFactor.findUnique({ where: { userId } });
  if (!row?.enabledAt) return null;
  const secret = decryptSecret(row.secretEnc);
  if (!secret) return null;
  const step = verifyTotp(secret, credential.code, row.lastUsedStep);
  if (step === null) return null;
  const consumed = await prisma.userTwoFactor.updateMany({
    where: { userId, lastUsedStep: row.lastUsedStep },
    data: { lastUsedStep: step },
  });
  return consumed.count === 1 ? 'totp' : null;
}

/** A staff role or access change needs a confirmation from this browser session. */
export async function assertFreshStepUp(sessionId: string | undefined): Promise<void> {
  if (!sessionId) {
    throw new AppError(403, 'step_up_required', 'Confirm your password or authenticator code before changing a staff role or permissions.');
  }
  const session = await prisma.session.findUnique({ where: { id: sessionId }, select: { stepUpUntil: true } });
  if (!session?.stepUpUntil || session.stepUpUntil.getTime() <= Date.now()) {
    throw new AppError(403, 'step_up_required', 'Confirm your password or authenticator code before changing a staff role or permissions.');
  }
}

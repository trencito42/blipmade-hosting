import type { FastifyRequest } from 'fastify';
import { prisma } from '../db.js';
import { audit } from '../lib/audit.js';
import { fullName } from '../lib/people.js';
import { notifyAccountSecurity } from './notifications.js';
import { describeAgent } from '../routes/settings.js';

/**
 * A sign-in, written to the log of the account.
 *
 * The device is the short name of the browser and the system. When the account has been
 * signed in before, and never from this device, the person is told by e-mail and in the
 * notification centre: a sign-in from a place they do not know is the first sign of a stolen
 * password. The very first sign-in of an account is never reported, because everything is new.
 */
export async function recordSignIn(
  request: FastifyRequest,
  user: { id: string; email: string; firstName: string; lastName: string },
  via: string,
): Promise<void> {
  const device = describeAgent((request.headers['user-agent'] ?? null) as string | null);
  const ip = request.ip ?? 'unknown';
  let known = true;
  let first = false;
  try {
    const previous = await prisma.auditLog.findMany({
      where: { actorId: user.id, action: 'auth.login' },
      select: { meta: true },
      orderBy: { createdAt: 'desc' },
      take: 200,
    });
    first = previous.length === 0;
    known = previous.some((entry) => (entry.meta as { device?: string } | null)?.device === device);
  } catch {
    // Without the history nothing is reported: a false alarm teaches people to ignore the real one.
    known = true;
  }
  await audit({ actorId: user.id, actorEmail: user.email, action: 'auth.login', targetType: 'user', targetId: user.id, meta: { via, device }, ip });
  if (!known && !first) {
    await notifyAccountSecurity('account.sign_in_new_device', {
      userId: user.id,
      name: fullName(user) || null,
      device,
      ip,
      when: new Date().toUTCString(),
    });
  }
}

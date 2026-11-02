import { z } from 'zod';
import { prisma } from '../db.js';

/**
 * The guests of the public chat: the switch, the notice they are shown, and how long what they wrote is kept.
 *
 * Guests are off until an operator turns them on. A guest who never comes back is removed with everything they wrote after the
 * retention period; a guest who signs in and claims the conversation keeps it under their own account.
 */

export const guestConfigSchema = z.object({
  enabled: z.boolean().default(false),
  retentionDays: z.number().int().min(1).max(365).default(30),
  notice: z.string().trim().min(10).max(1000).default('We keep this conversation and the name you give us for the time needed to answer you and for support records. We do not verify who you are, so do not write passwords or payment details here.'),
});
export type GuestConfig = z.infer<typeof guestConfigSchema>;

const KEY = 'support.guest';

export async function readGuestConfig(): Promise<GuestConfig> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const parsed = guestConfigSchema.safeParse(row?.value ?? {});
  return parsed.success ? parsed.data : guestConfigSchema.parse({});
}

export async function saveGuestConfig(value: GuestConfig): Promise<void> {
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value }, update: { value } });
}

/**
 * Removes the tokens that expired, and the guests that have not come back for the retention period together with their
 * conversations. A guest with a valid token is never removed.
 */
export async function sweepGuests(now = new Date()): Promise<{ tokens: number; guests: number }> {
  const config = await readGuestConfig();
  const tokens = await prisma.supportGuestToken.deleteMany({ where: { expiresAt: { lt: now } } });
  const cutoff = new Date(now.getTime() - config.retentionDays * 86_400_000);
  const gone = await prisma.user.deleteMany({
    where: { isGuest: true, supportGuestTokens: { none: {} }, OR: [{ updatedAt: { lt: cutoff } }, { tickets: { every: { updatedAt: { lt: cutoff } } } }] },
  });
  return { tokens: tokens.count, guests: gone.count };
}

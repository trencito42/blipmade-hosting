import { prisma } from '../db.js';

/** A staff member counts as present while a connection of theirs was alive in this time. */
export const PRESENCE_WINDOW_MS = 60_000;

/**
 * Whether a person of the staff is here to answer a chat. It is read from the presence that the connections of the staff
 * keep alive, never from a flag that was written once: when nobody is connected the answer is no, and the customer is told
 * so and offered a message that stays in the queue.
 */
export async function humanAvailable(departmentId?: string | null): Promise<boolean> {
  const alive = new Date(Date.now() - PRESENCE_WINDOW_MS);
  const count = await prisma.supportPresence.count({
    where: {
      status: 'AVAILABLE',
      lastSeenAt: { gte: alive },
      ...(departmentId ? { staff: { departments: { some: { departmentId } } } } : {}),
    },
  });
  return count > 0;
}

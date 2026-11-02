import { prisma } from '../db.js';

/**
 * The small picture of a member of the staff, shown to a customer at the top of the chat.
 *
 * It is kept as a data address of an image of at most 40 KB, written by the browser after it shrank the photo, in a setting:
 * the site does not load images from other places, and nothing is stored on a disk. The staff member can only change their own.
 */

export const MAX_AVATAR_CHARS = 60_000;
export const DATA_IMAGE = /^data:image\/(png|jpeg|webp);base64,[A-Za-z0-9+/=]+$/;

export const validAvatar = (value: string) => value.length <= MAX_AVATAR_CHARS && DATA_IMAGE.test(value);

const KEY = 'support.agents';

export async function readAvatars(): Promise<Record<string, string>> {
  const row = await prisma.setting.findUnique({ where: { key: KEY } });
  const value = row?.value;
  return value && typeof value === 'object' && !Array.isArray(value) ? (value as Record<string, string>) : {};
}

export async function setAvatar(userId: string, dataUrl: string | null): Promise<void> {
  const all = await readAvatars();
  if (dataUrl) all[userId] = dataUrl;
  else delete all[userId];
  await prisma.setting.upsert({ where: { key: KEY }, create: { key: KEY, value: all }, update: { value: all } });
}

/** First name and the initial of the last, which is how a customer is introduced to a person of the staff. */
export const shownName = (user: { firstName: string; lastName: string }) => `${user.firstName}${user.lastName ? ` ${user.lastName.slice(0, 1)}.` : ''}`.trim();

import { prisma } from '../db.js';

/**
 * The words of a template of email that the staff changed from the back office.
 *
 * The structure of a template (its blocks, its conditions, its facts) stays in the code, because a
 * change there can break a message. What the staff may change is the wording of four parts: the
 * subject, the heading, the line under the subject in the inbox, and the note at the end. They are
 * kept in the settings of the platform, read into memory, and read again every minute, so a change
 * reaches every process without a deploy.
 */
export interface EmailOverride {
  subject?: string;
  heading?: string;
  preheader?: string;
  note?: string;
}

const KEY = (id: string) => `email.template.${id}`;
const FIELDS: (keyof EmailOverride)[] = ['subject', 'heading', 'preheader', 'note'];

let cache = new Map<string, EmailOverride>();

export function emailOverrideOf(id: string): EmailOverride | undefined {
  return cache.get(id);
}

export async function loadEmailOverrides(): Promise<void> {
  try {
    const rows = await prisma.setting.findMany({ where: { key: { startsWith: 'email.template.' } } });
    const next = new Map<string, EmailOverride>();
    for (const row of rows) {
      const value = row.value as Record<string, unknown> | null;
      if (!value || typeof value !== 'object') continue;
      const override: EmailOverride = {};
      for (const field of FIELDS) {
        const text = value[field];
        if (typeof text === 'string' && text.trim()) override[field] = text.trim().slice(0, 300);
      }
      if (Object.keys(override).length) next.set(row.key.slice('email.template.'.length), override);
    }
    cache = next;
  } catch (error) {
    console.error('[email] the changed templates could not be read:', (error as Error).message);
  }
}

export async function saveEmailOverride(id: string, override: EmailOverride): Promise<void> {
  const clean: EmailOverride = {};
  for (const field of FIELDS) if (override[field]?.trim()) clean[field] = override[field]!.trim();
  if (Object.keys(clean).length === 0) {
    await prisma.setting.deleteMany({ where: { key: KEY(id) } });
  } else {
    await prisma.setting.upsert({ where: { key: KEY(id) }, create: { key: KEY(id), value: clean as never }, update: { value: clean as never } });
  }
  await loadEmailOverrides();
}

export const OVERRIDE_FIELDS = FIELDS;

import { z } from 'zod';
import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';
import { badRequest, notFound } from '../lib/errors.js';

/**
 * The editable words of the public site.
 *
 * Only the blocks named here can be edited, and each has a shape. Every value is plain text: the pages
 * draw it with React, which escapes it, and a value with markup is refused when it is written, so the
 * editor cannot put script on the site. A block has a draft, a published version and a history; the
 * site keeps its own words in the code and uses them until a version is published, and again when it is
 * taken down. The numbers of the catalogue are not typed: a text carries a placeholder, such as
 * {{ramPerGb}}, and the site fills it with the rate it really charges.
 */

export const PLACEHOLDERS = ['ramPerGb', 'cpuPerUnit', 'diskPerGb', 'baseFee', 'from'] as const;

const text = (max: number, min = 1) =>
  z
    .string()
    .trim()
    .min(min)
    .max(max)
    .refine((value) => !/[<>]/.test(value), 'Write plain text, without < or >.')
    .refine((value) => [...value.matchAll(/\{\{\s*([^}]*?)\s*\}\}/g)].every((match) => (PLACEHOLDERS as readonly string[]).includes(match[1]!)), `Use only these placeholders: ${PLACEHOLDERS.map((name) => `{{${name}}}`).join(', ')}.`);

const slug = z.string().regex(/^[a-z0-9-]{2,60}$/);
const path = z.string().regex(/^\/[A-Za-z0-9\-_/]{0,100}$/, 'Use a path such as /apps.');

export interface BlockDefinition {
  label: string;
  description: string;
  schema: z.ZodTypeAny;
  example: unknown;
}

export const BLOCKS: Record<string, BlockDefinition> = {
  'home.hero': {
    label: 'Home page: heading and introduction',
    description: 'The title and the paragraph at the top of the home page. The sentence with the starting price is added after the introduction unless the text carries {{from}}.',
    schema: z.object({ title: text(120), lead: text(500), primaryLabel: text(40).optional(), secondaryLabel: text(40).optional() }).strict(),
    example: { title: 'Hosting for everything you run.', lead: 'Bots, game servers, databases and developer tools.', primaryLabel: 'Get started', secondaryLabel: 'Browse the catalog' },
  },
  'home.faq': {
    label: 'Home page: questions people ask first',
    description: 'The questions of the home page. Use {{ramPerGb}}, {{cpuPerUnit}}, {{diskPerGb}} and {{baseFee}} for the rates, so the page never quotes a rate that is not charged.',
    schema: z.object({ items: z.array(z.object({ q: text(200), a: text(2000) }).strict()).min(1).max(30) }).strict(),
    example: { items: [{ q: 'What will I pay?', a: 'The configurator shows the price. Memory costs {{ramPerGb}} per GB.' }] },
  },
  'site.announcement': {
    label: 'Every public page: a notice above the menu',
    description: 'A short notice shown above the menu of the public pages, for example a maintenance window. Take it down when it is no longer true. A link needs both its label and its path.',
    schema: z
      .object({ message: text(200), linkLabel: text(40).optional(), linkTo: path.optional() })
      .strict()
      .refine((value) => (value.linkLabel === undefined) === (value.linkTo === undefined), 'Give both the label and the path of the link, or neither.'),
    example: { message: 'Scheduled maintenance on Sunday from 02:00 to 03:00 UTC.', linkLabel: 'Status', linkTo: '/status' },
  },
  'product.copy': {
    label: 'Products: marketing words',
    description: 'For each product (by slug): the tagline, the introduction, the list of what it fits and an optional note.',
    schema: z.record(slug, z.object({ tagline: text(200), lead: text(800), fits: z.array(text(200)).max(8), note: text(400).optional() }).strict()).refine((value) => Object.keys(value).length <= 100, 'Too many products.'),
    example: { 'discord-bot': { tagline: 'A bot that stays online.', lead: 'Run a bot around the clock.', fits: ['Moderation bots'] } },
  },
  'seo.pages': {
    label: 'Search results: title and description of pages',
    description: 'For each page (by path): the title (up to 70 characters) and the description (up to 170) that search engines show.',
    schema: z.record(path, z.object({ title: text(70), description: text(170) }).strict()).refine((value) => Object.keys(value).length <= 60, 'Too many pages.'),
    example: { '/apps': { title: 'Apps and game servers | Blipmade', description: 'Pick an app and size it to the megabyte.' } },
  },
};

export function blockOf(key: string): BlockDefinition {
  const block = BLOCKS[key];
  if (!block) throw notFound('That block does not exist.');
  return block;
}

/** Checks the data against the shape of the block and returns what is stored. */
export function validateBlock(key: string, data: unknown): unknown {
  const parsed = blockOf(key).schema.safeParse(data);
  if (!parsed.success) {
    const issue = parsed.error.issues[0];
    throw badRequest(`${issue?.path.join('.') || 'The content'}: ${issue?.message ?? 'is not valid'}`);
  }
  return parsed.data;
}

type Actor = { id: string; email: string };

export async function saveDraft(key: string, data: unknown, actor: Actor, note?: string) {
  const clean = validateBlock(key, data);
  const existing = await prisma.contentRevision.findFirst({ where: { key, status: 'DRAFT' } });
  const values = { data: clean as Prisma.InputJsonValue, note: note?.slice(0, 200) ?? null, authorId: actor.id, authorEmail: actor.email };
  return existing
    ? prisma.contentRevision.update({ where: { id: existing.id }, data: { ...values, createdAt: new Date() } })
    : prisma.contentRevision.create({ data: { key, status: 'DRAFT', ...values } });
}

export async function discardDraft(key: string): Promise<void> {
  blockOf(key);
  await prisma.contentRevision.deleteMany({ where: { key, status: 'DRAFT' } });
}

let cache: { at: number; value: Record<string, unknown> } | null = null;
const CACHE_MS = 30_000;
export const forgetContent = () => {
  cache = null;
};

/** Publishes the draft: the published version before it goes to the history. */
export async function publishDraft(key: string, actor: Actor) {
  blockOf(key);
  const draft = await prisma.contentRevision.findFirst({ where: { key, status: 'DRAFT' } });
  if (!draft) throw badRequest('There is no draft to publish.');
  validateBlock(key, draft.data);
  const published = await prisma.$transaction(async (tx) => {
    await tx.contentRevision.updateMany({ where: { key, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
    return tx.contentRevision.update({ where: { id: draft.id }, data: { status: 'PUBLISHED', publishedAt: new Date(), authorId: actor.id, authorEmail: actor.email } });
  });
  forgetContent();
  return published;
}

/** Takes the published version down: the site uses the words of the code again. */
export async function unpublish(key: string): Promise<void> {
  blockOf(key);
  await prisma.contentRevision.updateMany({ where: { key, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
  forgetContent();
}

/** Puts an earlier version back as the published one. It is a new version, so the history stays whole. */
export async function rollback(key: string, revisionId: string, actor: Actor) {
  blockOf(key);
  const old = await prisma.contentRevision.findFirst({ where: { id: revisionId, key, status: { in: ['PUBLISHED', 'ARCHIVED'] } } });
  if (!old) throw notFound('That version was not found.');
  const clean = validateBlock(key, old.data);
  const created = await prisma.$transaction(async (tx) => {
    await tx.contentRevision.updateMany({ where: { key, status: 'PUBLISHED' }, data: { status: 'ARCHIVED' } });
    return tx.contentRevision.create({ data: { key, status: 'PUBLISHED', data: clean as Prisma.InputJsonValue, note: `Rolled back to ${old.id}`, authorId: actor.id, authorEmail: actor.email, publishedAt: new Date() } });
  });
  forgetContent();
  return created;
}

/** The published blocks, for the public site. A block whose data no longer fits its shape is left out. */
export async function publishedContent(): Promise<Record<string, unknown>> {
  if (cache && Date.now() - cache.at < CACHE_MS) return cache.value;
  const rows = await prisma.contentRevision.findMany({ where: { status: 'PUBLISHED', key: { in: Object.keys(BLOCKS) } }, orderBy: { publishedAt: 'desc' } });
  const value: Record<string, unknown> = {};
  for (const row of rows) {
    if (row.key in value) continue;
    const parsed = BLOCKS[row.key]?.schema.safeParse(row.data);
    if (parsed?.success) value[row.key] = parsed.data;
  }
  cache = { at: Date.now(), value };
  return value;
}

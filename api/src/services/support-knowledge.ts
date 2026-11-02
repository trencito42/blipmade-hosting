import { prisma } from '../db.js';
import { searchDocs, type Article, type DocItem } from './support-bot.js';

/**
 * Where the assistant and the bots look for what to tell a customer.
 *
 * There are two sources and they are not the same thing. The public documentation is the pages of the site (`/docs`), written
 * in the repository. The knowledge base of the team (`/admin/knowledge`) is notes the staff keeps for itself and is never
 * shown to a customer, unless the operator marks a note "the assistant may use this with customers": that note is then
 * searched with the public pages, which lets the operator add an answer (the payment methods, for example) without a change
 * of the site.
 */

export interface TeamNote {
  id: string;
  title: string;
  body: string;
  tags?: string[];
  assistant?: boolean;
}

export async function customerNotes(): Promise<DocItem[]> {
  const row = await prisma.setting.findUnique({ where: { key: 'support.knowledge' } });
  const notes = Array.isArray(row?.value) ? (row!.value as unknown as TeamNote[]) : [];
  return notes
    .filter((note) => note.assistant === true)
    .map((note) => ({ id: `note-${note.id}`, title: note.title, summary: note.body.slice(0, 200), keywords: note.tags ?? [], url: '', text: note.body.slice(0, 1600) }));
}

/** The public pages and the notes marked for customers, best first. */
export async function searchKnowledge(query: string, limit = 3): Promise<Article[]> {
  return searchDocs(query, limit, await customerNotes());
}

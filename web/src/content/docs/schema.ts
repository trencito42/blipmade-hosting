/**
 * The shape of the documentation content, and the rules it has to follow.
 *
 * The content of the documentation is two files of plain data:
 *
 *   - groups.json holds the groups of the navigation, in the order a customer
 *     walks through them;
 *   - pages.json holds the pages themselves.
 *
 * Both are read here, checked once, and given to the interface as typed
 * values. The check is the same one the validator of the repository runs
 * (scripts/validate-docs.mjs): a page that points at a page that does not
 * exist, or a block of a kind nobody renders, is a mistake that the customer
 * finds first. It is much cheaper to find it here.
 */

import groupsJson from './groups.json' with { type: 'json' };
import pagesJson from './pages.json' with { type: 'json' };

// --- the model --------------------------------------------------------------

export interface DocGroup {
  /** The id of the group. A page holds this id, not the label. */
  id: string;
  /** The name the navigation shows. */
  label: string;
  /** The place of the group in the journey of the customer. */
  order: number;
  /** One line about what the group holds. */
  description: string;
}

export interface DocStep {
  title: string;
  body: string;
  result: string;
}

export type DocCalloutTone = 'note' | 'tip' | 'warning' | 'danger';

export type DocBlock =
  | { t: 'p'; text: string }
  | { t: 'list'; items: string[] }
  | { t: 'callout'; tone: DocCalloutTone; text: string }
  | { t: 'code'; lang: string; code: string }
  | { t: 'steps'; items: DocStep[] }
  | { t: 'trouble'; items: { q: string; a: string }[] }
  | { t: 'spec'; rows: { k: string; v: string }[] };

export interface DocSection {
  /** The anchor of the section. It has to be unique inside its page. */
  id: string;
  title: string;
  blocks: DocBlock[];
}

export interface DocPage {
  id: string;
  /** The id of the group the page belongs to. */
  group: string;
  title: string;
  summary: string;
  keywords: string[];
  /** The day the page was written, as an ISO day. */
  updated: string;
  /**
   * The slug of the product in the catalog. Only the page of a product has
   * one: such a page is published only when the catalog offers the product.
   */
  catalogSlug?: string;
  /** The pages that answer the same question from another angle. */
  related: string[];
  sections: DocSection[];
  /** The pages a customer reads next. */
  next: string[];
}

export interface DocsContent {
  groups: DocGroup[];
  pages: DocPage[];
}

// --- the check --------------------------------------------------------------

/** The kinds of block the interface knows how to render. */
const BLOCK_KINDS = ['p', 'list', 'callout', 'code', 'steps', 'trouble', 'spec'] as const;

/** The tones a callout can have. */
const CALLOUT_TONES: readonly DocCalloutTone[] = ['note', 'tip', 'warning', 'danger'];

/** The groups whose pages are the pages of a product of the catalog. */
const PRODUCT_GROUPS: readonly string[] = ['apps', 'databases'];

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value);
}

function isText(value: unknown): value is string {
  return typeof value === 'string' && value.trim().length > 0;
}

function isDay(value: unknown): value is string {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

function isListOfText(value: unknown): value is string[] {
  return Array.isArray(value) && value.every(isText);
}

/**
 * Checks one block. Returns the block when it is well formed, and null when
 * it is not; the reason is added to the problems in both cases.
 */
function parseBlock(raw: unknown, where: string, problems: string[]): DocBlock | null {
  if (!isRecord(raw)) {
    problems.push(`${where} is not a block.`);
    return null;
  }
  const kind = raw.t;
  if (typeof kind !== 'string' || !BLOCK_KINDS.includes(kind as (typeof BLOCK_KINDS)[number])) {
    problems.push(`${where} has the unknown kind "${String(kind)}".`);
    return null;
  }

  switch (kind) {
    case 'p': {
      if (!isText(raw.text)) {
        problems.push(`${where} has no text.`);
        return null;
      }
      return { t: 'p', text: raw.text };
    }
    case 'list': {
      if (!isListOfText(raw.items) || raw.items.length === 0) {
        problems.push(`${where} has no items.`);
        return null;
      }
      return { t: 'list', items: raw.items };
    }
    case 'callout': {
      if (typeof raw.tone !== 'string' || !CALLOUT_TONES.includes(raw.tone as DocCalloutTone)) {
        problems.push(`${where} has the unknown tone "${String(raw.tone)}".`);
        return null;
      }
      if (!isText(raw.text)) {
        problems.push(`${where} has no text.`);
        return null;
      }
      return { t: 'callout', tone: raw.tone as DocCalloutTone, text: raw.text };
    }
    case 'code': {
      if (!isText(raw.lang)) {
        problems.push(`${where} has no language.`);
        return null;
      }
      if (typeof raw.code !== 'string') {
        problems.push(`${where} has no code.`);
        return null;
      }
      return { t: 'code', lang: raw.lang, code: raw.code };
    }
    case 'steps': {
      if (!Array.isArray(raw.items) || raw.items.length === 0) {
        problems.push(`${where} has no steps.`);
        return null;
      }
      const steps: DocStep[] = [];
      raw.items.forEach((rawStep, index) => {
        if (!isRecord(rawStep)) {
          problems.push(`${where}, step ${index} is not an object.`);
          return;
        }
        if (!isText(rawStep.title) || !isText(rawStep.body) || !isText(rawStep.result)) {
          problems.push(`${where}, step ${index} has no title, body or result.`);
          return;
        }
        steps.push({ title: rawStep.title, body: rawStep.body, result: rawStep.result });
      });
      if (!steps.length) return null;
      return { t: 'steps', items: steps };
    }
    case 'trouble': {
      if (!Array.isArray(raw.items) || raw.items.length === 0) {
        problems.push(`${where} has no questions.`);
        return null;
      }
      const items: { q: string; a: string }[] = [];
      raw.items.forEach((rawItem, index) => {
        if (!isRecord(rawItem)) {
          problems.push(`${where}, question ${index} is not an object.`);
          return;
        }
        if (!isText(rawItem.q) || !isText(rawItem.a)) {
          problems.push(`${where}, question ${index} has no question or no answer.`);
          return;
        }
        items.push({ q: rawItem.q, a: rawItem.a });
      });
      if (!items.length) return null;
      return { t: 'trouble', items };
    }
    case 'spec': {
      if (!Array.isArray(raw.rows) || raw.rows.length === 0) {
        problems.push(`${where} has no rows.`);
        return null;
      }
      const rows: { k: string; v: string }[] = [];
      raw.rows.forEach((rawRow, index) => {
        if (!isRecord(rawRow)) {
          problems.push(`${where}, row ${index} is not an object.`);
          return;
        }
        if (!isText(rawRow.k) || typeof rawRow.v !== 'string') {
          problems.push(`${where}, row ${index} has no name or no value.`);
          return;
        }
        rows.push({ k: rawRow.k, v: rawRow.v });
      });
      if (!rows.length) return null;
      return { t: 'spec', rows };
    }
    default:
      return null;
  }
}

/**
 * Checks the groups and the pages, and gives back what was checked.
 *
 * Every problem is collected, so one run says everything that is wrong and
 * not only the first mistake.
 */
export function parseDocs(groupsInput: unknown, pagesInput: unknown): DocsContent {
  const problems: string[] = [];

  // --- the groups -----------------------------------------------------------
  const groups: DocGroup[] = [];
  const groupIds = new Set<string>();
  const groupOrders = new Map<number, string>();

  if (!Array.isArray(groupsInput)) {
    problems.push('the groups are not a list.');
  } else {
    groupsInput.forEach((raw, index) => {
      const where = `groups[${index}]`;
      if (!isRecord(raw)) {
        problems.push(`${where} is not an object.`);
        return;
      }
      const id = raw.id;
      if (!isText(id)) {
        problems.push(`${where} has no id.`);
      } else if (groupIds.has(id)) {
        problems.push(`${where} has the id "${id}", which is already used.`);
      } else {
        groupIds.add(id);
      }

      const label = raw.label;
      if (!isText(label)) problems.push(`${where} has no label.`);

      const order = raw.order;
      if (typeof order !== 'number' || !Number.isFinite(order)) {
        problems.push(`${where} has no order.`);
      } else {
        const other = groupOrders.get(order);
        if (other !== undefined) {
          problems.push(`${where} has the order ${order}, which "${other}" already uses.`);
        } else {
          groupOrders.set(order, isText(id) ? id : where);
        }
      }

      const description = raw.description;
      if (!isText(description)) problems.push(`${where} has no description.`);

      if (isText(id) && isText(label) && isText(description) && typeof order === 'number' && Number.isFinite(order)) {
        groups.push({ id, label, order, description });
      }
    });
  }

  // --- the pages ------------------------------------------------------------
  const pages: DocPage[] = [];
  const seenIds = new Set<string>();
  const knownIds = new Set<string>();

  if (!Array.isArray(pagesInput)) {
    problems.push('the pages are not a list.');
  } else {
    for (const raw of pagesInput) {
      if (isRecord(raw) && isText(raw.id)) knownIds.add(raw.id);
    }

    pagesInput.forEach((raw, index) => {
      const where = `pages[${index}]`;
      if (!isRecord(raw)) {
        problems.push(`${where} is not a page.`);
        return;
      }

      const id = raw.id;
      if (!isText(id)) {
        problems.push(`${where} has no id.`);
      } else if (seenIds.has(id)) {
        problems.push(`${where} has the id "${id}", which is already used.`);
      } else {
        seenIds.add(id);
      }
      const name = isText(id) ? id : where;

      const group = raw.group;
      if (!isText(group)) {
        problems.push(`${where} ("${name}") has no group.`);
      } else if (!groupIds.has(group)) {
        problems.push(`${where} ("${name}") is in the group "${group}", which does not exist.`);
      }

      const title = raw.title;
      if (!isText(title)) problems.push(`${where} ("${name}") has no title.`);

      const summary = raw.summary;
      if (!isText(summary)) problems.push(`${where} ("${name}") has no summary.`);

      const keywords = raw.keywords;
      if (!isListOfText(keywords) || keywords.length === 0) {
        problems.push(`${where} ("${name}") has no keywords.`);
      }

      const updated = raw.updated;
      if (!isDay(updated)) {
        problems.push(`${where} ("${name}") has no date, or the date is not a day like 2026-10-18.`);
      }

      for (const key of ['next', 'related'] as const) {
        const targets = raw[key];
        if (!Array.isArray(targets) || !targets.every(isText)) {
          problems.push(`${where} ("${name}") has no list of "${key}" pages.`);
          continue;
        }
        for (const target of targets) {
          if (!knownIds.has(target)) {
            problems.push(`${where} ("${name}") points at the page "${target}", which does not exist.`);
          }
        }
      }

      const catalogSlug = raw.catalogSlug;
      if (catalogSlug !== undefined && catalogSlug !== null) {
        if (!isText(catalogSlug)) {
          problems.push(`${where} ("${name}") has an empty catalogSlug.`);
        } else if (!isText(group) || !PRODUCT_GROUPS.includes(group)) {
          problems.push(`${where} ("${name}") has a catalogSlug, but it is not the page of a product.`);
        }
      }

      const sections: DocSection[] = [];
      const rawSections = raw.sections;
      if (!Array.isArray(rawSections) || rawSections.length === 0) {
        problems.push(`${where} ("${name}") has no sections.`);
      } else {
        const sectionIds = new Set<string>();
        rawSections.forEach((rawSection, sectionIndex) => {
          const sectionWhere = `${where} ("${name}"), section ${sectionIndex}`;
          if (!isRecord(rawSection)) {
            problems.push(`${sectionWhere} is not a section.`);
            return;
          }
          const sectionId = rawSection.id;
          if (!isText(sectionId)) {
            problems.push(`${sectionWhere} has no id.`);
          } else if (sectionIds.has(sectionId)) {
            problems.push(`${sectionWhere} has the id "${sectionId}", which the page already uses.`);
          } else {
            sectionIds.add(sectionId);
          }
          const sectionTitle = rawSection.title;
          if (!isText(sectionTitle)) problems.push(`${sectionWhere} has no title.`);

          const blocks: DocBlock[] = [];
          const rawBlocks = rawSection.blocks;
          if (!Array.isArray(rawBlocks) || rawBlocks.length === 0) {
            problems.push(`${sectionWhere} has no blocks.`);
          } else {
            rawBlocks.forEach((rawBlock, blockIndex) => {
              const block = parseBlock(rawBlock, `${sectionWhere}, block ${blockIndex}`, problems);
              if (block) blocks.push(block);
            });
          }

          if (isText(sectionId) && isText(sectionTitle)) {
            sections.push({ id: sectionId, title: sectionTitle, blocks });
          }
        });
      }

      const ok =
        isText(id) &&
        isText(group) &&
        groupIds.has(group) &&
        isText(title) &&
        isText(summary) &&
        isListOfText(keywords) &&
        keywords.length > 0 &&
        isDay(updated) &&
        isListOfText(raw.next) &&
        isListOfText(raw.related) &&
        sections.length > 0;
      if (!ok) return;

      const page: DocPage = {
        id,
        group,
        title,
        summary,
        keywords,
        updated,
        related: raw.related as string[],
        sections,
        next: raw.next as string[],
      };
      if (isText(catalogSlug)) page.catalogSlug = catalogSlug;
      pages.push(page);
    });
  }

  if (problems.length) {
    throw new Error(
      `The documentation content is not valid:\n${problems.map((problem) => `  - ${problem}`).join('\n')}`,
    );
  }

  return { groups, pages };
}

// --- the content ------------------------------------------------------------

const content = parseDocs(groupsJson, pagesJson);

/** The groups of the navigation, in the order of the journey. */
export const DOC_GROUPS: DocGroup[] = content.groups;

/** The pages of the documentation. */
export const DOC_PAGES: DocPage[] = content.pages;

/** The group of every id, for the labels the navigation shows. */
export const DOC_GROUP_BY_ID: Map<string, DocGroup> = new Map(DOC_GROUPS.map((group) => [group.id, group]));

/** The page of every id. */
export const DOC_PAGE_BY_ID: Map<string, DocPage> = new Map(DOC_PAGES.map((page) => [page.id, page]));

/** The page of an id, when there is one. */
export function docPageById(id: string): DocPage | undefined {
  return DOC_PAGE_BY_ID.get(id);
}

/** The label of a group, or the id itself when the group is unknown. */
export function docGroupLabel(id: string): string {
  return DOC_GROUP_BY_ID.get(id)?.label ?? id;
}

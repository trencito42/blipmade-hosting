#!/usr/bin/env node
/**
 * The check of the documentation content.
 *
 * The content of the documentation is two files of plain data:
 *
 *   web/src/content/docs/groups.json
 *   web/src/content/docs/pages.json
 *
 * The frontend checks them too (web/src/content/docs/schema.ts), but that
 * check only runs when the frontend is built, and it says that something is
 * wrong without saying what. This one runs on its own, needs no dependency,
 * and says what is wrong.
 *
 * The rules are the ones of the schema, plus the ones that are about the
 * truth of the words:
 *
 *   - the structure: every group and every page is well formed, every link
 *     of the navigation points at a page that exists, and every section of a
 *     page has its own anchor;
 *   - the links of the text: a link to a page of the documentation points at
 *     a page that exists, and a link inside the site points at a route that
 *     exists;
 *   - the words: the brand is written the same way everywhere, and the
 *     documentation does not promise what the platform does not promise;
 *   - the catalog: the page of a product is published only when the catalog
 *     offers the product. This check needs the catalog, so it is skipped
 *     unless a catalog file is given;
 *   - the age of a page: a page that is older than the last change of the
 *     platform is worth a look. This one is a warning, not an error.
 *
 * Usage:
 *
 *   node scripts/validate-docs.mjs [--catalog <file.json>]
 */

import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const root = resolve(here, '..');
// The directory of the content can be pointed somewhere else, so a copy of
// the content can be checked without touching the real one.
const contentDir = process.env.DOCS_CONTENT_DIR
  ? resolve(process.env.DOCS_CONTENT_DIR)
  : join(root, 'web', 'src', 'content', 'docs');
const groupsPath = join(contentDir, 'groups.json');
const pagesPath = join(contentDir, 'pages.json');
const routesPath = join(root, 'web', 'src', 'routes.tsx');

// --- the command line -------------------------------------------------------

function usage() {
  console.log('Usage: node scripts/validate-docs.mjs [--catalog <file.json>]');
  console.log('');
  console.log('  --catalog <file.json>  the catalog of the platform, to check that');
  console.log('                         the page of a product exists only when the');
  console.log('                         catalog offers the product.');
}

const args = process.argv.slice(2);
let catalogPath = null;
for (let index = 0; index < args.length; index++) {
  const arg = args[index];
  if (arg === '--catalog') {
    catalogPath = args[index + 1] ?? null;
    index++;
    if (!catalogPath) {
      console.error('--catalog needs the path of a catalog file.');
      process.exit(2);
    }
  } else if (arg === '--help' || arg === '-h') {
    usage();
    process.exit(0);
  } else {
    console.error(`Unknown argument "${arg}".`);
    usage();
    process.exit(2);
  }
}

// --- the files --------------------------------------------------------------

function readJson(path, what) {
  let raw;
  try {
    raw = readFileSync(path, 'utf8');
  } catch {
    console.error(`The ${what} is not there: ${path}`);
    process.exit(2);
  }
  try {
    return JSON.parse(raw);
  } catch (error) {
    console.error(`The ${what} is not valid JSON: ${path}`);
    console.error(String(error));
    process.exit(2);
  }
}

const groupsInput = readJson(groupsPath, 'groups of the documentation');
const pagesInput = readJson(pagesPath, 'pages of the documentation');

const problems = [];
const warnings = [];

function problem(message) {
  problems.push(message);
}

function warn(message) {
  warnings.push(message);
}

// --- the structure ----------------------------------------------------------

const BLOCK_KINDS = ['p', 'list', 'callout', 'code', 'steps', 'trouble', 'spec'];
const CALLOUT_TONES = ['note', 'tip', 'warning', 'danger'];
const PRODUCT_GROUPS = ['apps', 'databases'];

function isText(value) {
  return typeof value === 'string' && value.trim().length > 0;
}

function isListOfText(value) {
  return Array.isArray(value) && value.every(isText);
}

function isDay(value) {
  return typeof value === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(value);
}

const groupIds = new Set();
const groupOrders = new Map();
const structureStart = problems.length;

if (!Array.isArray(groupsInput)) {
  problem('the groups are not a list.');
} else {
  groupsInput.forEach((raw, index) => {
    const where = `groups[${index}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      problem(`${where} is not an object.`);
      return;
    }
    if (!isText(raw.id)) problem(`${where} has no id.`);
    else if (groupIds.has(raw.id)) problem(`${where} has the id "${raw.id}", which is already used.`);
    else groupIds.add(raw.id);

    if (!isText(raw.label)) problem(`${where} has no label.`);

    if (typeof raw.order !== 'number' || !Number.isFinite(raw.order)) {
      problem(`${where} has no order.`);
    } else if (groupOrders.has(raw.order)) {
      problem(`${where} has the order ${raw.order}, which "${groupOrders.get(raw.order)}" already uses.`);
    } else {
      groupOrders.set(raw.order, isText(raw.id) ? raw.id : where);
    }

    if (!isText(raw.description)) problem(`${where} has no description.`);
  });
}

const pages = [];
const pageIds = new Set();
const seenIds = new Set();

if (!Array.isArray(pagesInput)) {
  problem('the pages are not a list.');
} else {
  for (const raw of pagesInput) {
    if (raw && typeof raw === 'object' && isText(raw.id)) pageIds.add(raw.id);
  }

  pagesInput.forEach((raw, index) => {
    const where = `pages[${index}]`;
    if (!raw || typeof raw !== 'object' || Array.isArray(raw)) {
      problem(`${where} is not a page.`);
      return;
    }
    if (!isText(raw.id)) problem(`${where} has no id.`);
    else if (seenIds.has(raw.id)) problem(`${where} has the id "${raw.id}", which is already used.`);
    else seenIds.add(raw.id);
    const name = isText(raw.id) ? raw.id : where;

    if (!isText(raw.group)) problem(`${where} ("${name}") has no group.`);
    else if (!groupIds.has(raw.group)) {
      problem(`${where} ("${name}") is in the group "${raw.group}", which does not exist.`);
    }

    if (!isText(raw.title)) problem(`${where} ("${name}") has no title.`);
    if (!isText(raw.summary)) problem(`${where} ("${name}") has no summary.`);
    if (!isListOfText(raw.keywords) || raw.keywords.length === 0) {
      problem(`${where} ("${name}") has no keywords.`);
    }
    if (!isDay(raw.updated)) {
      problem(`${where} ("${name}") has no date, or the date is not a day like 2026-10-18.`);
    }

    for (const key of ['next', 'related']) {
      if (!isListOfText(raw[key])) {
        problem(`${where} ("${name}") has no list of "${key}" pages.`);
        continue;
      }
      for (const target of raw[key]) {
        if (!pageIds.has(target)) {
          problem(`${where} ("${name}") points at the page "${target}", which does not exist.`);
        }
      }
    }

    if (raw.catalogSlug !== undefined && raw.catalogSlug !== null) {
      if (!isText(raw.catalogSlug)) problem(`${where} ("${name}") has an empty catalogSlug.`);
      else if (!isText(raw.group) || !PRODUCT_GROUPS.includes(raw.group)) {
        problem(`${where} ("${name}") has a catalogSlug, but it is not the page of a product.`);
      }
    }

    const sections = Array.isArray(raw.sections) ? raw.sections : [];
    if (sections.length === 0) {
      problem(`${where} ("${name}") has no sections.`);
    }
    const sectionIds = new Set();
    sections.forEach((section, sectionIndex) => {
      const sectionWhere = `${where} ("${name}"), section ${sectionIndex}`;
      if (!section || typeof section !== 'object' || Array.isArray(section)) {
        problem(`${sectionWhere} is not a section.`);
        return;
      }
      if (!isText(section.id)) problem(`${sectionWhere} has no id.`);
      else if (sectionIds.has(section.id)) {
        problem(`${sectionWhere} has the id "${section.id}", which the page already uses.`);
      } else sectionIds.add(section.id);
      if (!isText(section.title)) problem(`${sectionWhere} has no title.`);

      const blocks = Array.isArray(section.blocks) ? section.blocks : [];
      if (blocks.length === 0) problem(`${sectionWhere} has no blocks.`);
      blocks.forEach((block, blockIndex) => {
        const blockWhere = `${sectionWhere}, block ${blockIndex}`;
        if (!block || typeof block !== 'object' || Array.isArray(block)) {
          problem(`${blockWhere} is not a block.`);
          return;
        }
        if (!BLOCK_KINDS.includes(block.t)) {
          problem(`${blockWhere} has the unknown kind "${String(block.t)}".`);
          return;
        }
        if (block.t === 'p' && !isText(block.text)) problem(`${blockWhere} has no text.`);
        if (block.t === 'list' && (!isListOfText(block.items) || block.items.length === 0)) {
          problem(`${blockWhere} has no items.`);
        }
        if (block.t === 'callout') {
          if (!CALLOUT_TONES.includes(block.tone)) problem(`${blockWhere} has the unknown tone "${String(block.tone)}".`);
          if (!isText(block.text)) problem(`${blockWhere} has no text.`);
        }
        if (block.t === 'code') {
          if (!isText(block.lang)) problem(`${blockWhere} has no language.`);
          if (typeof block.code !== 'string') problem(`${blockWhere} has no code.`);
        }
        if (block.t === 'steps') {
          const items = Array.isArray(block.items) ? block.items : [];
          if (items.length === 0) problem(`${blockWhere} has no steps.`);
          items.forEach((step, stepIndex) => {
            if (!step || typeof step !== 'object') {
              problem(`${blockWhere}, step ${stepIndex} is not an object.`);
              return;
            }
            if (!isText(step.title) || !isText(step.body) || !isText(step.result)) {
              problem(`${blockWhere}, step ${stepIndex} has no title, body or result.`);
            }
          });
        }
        if (block.t === 'trouble') {
          const items = Array.isArray(block.items) ? block.items : [];
          if (items.length === 0) problem(`${blockWhere} has no questions.`);
          items.forEach((item, itemIndex) => {
            if (!item || typeof item !== 'object') {
              problem(`${blockWhere}, question ${itemIndex} is not an object.`);
              return;
            }
            if (!isText(item.q) || !isText(item.a)) {
              problem(`${blockWhere}, question ${itemIndex} has no question or no answer.`);
            }
          });
        }
        if (block.t === 'spec') {
          const rows = Array.isArray(block.rows) ? block.rows : [];
          if (rows.length === 0) problem(`${blockWhere} has no rows.`);
          rows.forEach((row, rowIndex) => {
            if (!row || typeof row !== 'object') {
              problem(`${blockWhere}, row ${rowIndex} is not an object.`);
              return;
            }
            if (!isText(row.k) || typeof row.v !== 'string') {
              problem(`${blockWhere}, row ${rowIndex} has no name or no value.`);
            }
          });
        }
      });
    });

    pages.push(raw);
  });
}

// --- the links of the text --------------------------------------------------

const structureProblems = problems.length - structureStart;
const linkStart = problems.length;

/** The routes of the application, so a link inside the site can be checked. */
function readRoutes() {
  try {
    const raw = readFileSync(routesPath, 'utf8');
    const patterns = [];
    const pattern = /pattern:\s*'([^']+)'/g;
    let match = pattern.exec(raw);
    while (match) {
      patterns.push(match[1]);
      match = pattern.exec(raw);
    }
    return patterns;
  } catch {
    return [];
  }
}

const routes = readRoutes();

/** A route of the application, with its parameters. */
function routeMatches(route, path) {
  const parts = route.split('/').filter(Boolean);
  const target = path.split('/').filter(Boolean);
  if (parts.length !== target.length) return false;
  return parts.every((part, index) => part.startsWith(':') || part === target[index]);
}

/** The text of a page, everywhere it is written. */
function pageTexts(page) {
  const texts = [page.title ?? '', page.summary ?? '', ...(Array.isArray(page.keywords) ? page.keywords : [])];
  for (const section of Array.isArray(page.sections) ? page.sections : []) {
    for (const block of Array.isArray(section?.blocks) ? section.blocks : []) {
      if (block.t === 'p' || block.t === 'callout') texts.push(block.text ?? '');
      if (block.t === 'list') texts.push(...(Array.isArray(block.items) ? block.items : []));
      if (block.t === 'code') texts.push(block.code ?? '');
      if (block.t === 'spec') {
        for (const row of Array.isArray(block.rows) ? block.rows : []) {
          texts.push(row?.k ?? '', row?.v ?? '');
        }
      }
      if (block.t === 'steps') {
        for (const step of Array.isArray(block.items) ? block.items : []) {
          texts.push(step?.title ?? '', step?.body ?? '', step?.result ?? '');
        }
      }
      if (block.t === 'trouble') {
        for (const item of Array.isArray(block.items) ? block.items : []) {
          texts.push(item?.q ?? '', item?.a ?? '');
        }
      }
    }
  }
  return texts.filter((text) => typeof text === 'string' && text.length > 0);
}

const LINK = /\[([^\]]+)\]\(([^)\s]+)\)/g;
let linkCount = 0;

for (const page of pages) {
  for (const text of pageTexts(page)) {
    LINK.lastIndex = 0;
    let match = LINK.exec(text);
    while (match) {
      linkCount++;
      const label = match[1];
      const target = match[2];
      if (target.startsWith('/docs')) {
        const query = target.includes('?') ? target.slice(target.indexOf('?')) : '';
        const id = new URLSearchParams(query).get('p');
        if (!id) problem(`the page "${page.id}" links to "${target}", which names no page.`);
        else if (!pageIds.has(id)) {
          problem(`the page "${page.id}" links to the page "${id}", which does not exist.`);
        }
      } else if (target.startsWith('/')) {
        const path = target.split('?')[0];
        if (routes.length && !routes.some((route) => routeMatches(route, path))) {
          problem(`the page "${page.id}" links to "${path}", which is not a route of the application.`);
        }
      } else if (!/^https?:\/\//.test(target)) {
        problem(`the page "${page.id}" links to "${target}", which is not a link of the site.`);
      }
      if (!isText(label)) problem(`the page "${page.id}" has a link without a text.`);
      match = LINK.exec(text);
    }
  }
}

// --- the words --------------------------------------------------------------

const linkProblems = problems.length - linkStart;
const wordingStart = problems.length;

/**
 * The promises the documentation may not make.
 *
 * The service level agreement of the platform publishes no figure of
 * availability and no service credit, and the refund policy only refunds
 * automatically when a provisioning or a plan change fails. A page that
 * promises more than that is wrong, whatever the platform does later.
 *
 * A rule that carries `inQuestion` is not a promise when the text is a
 * question. Asking whether the money comes back is honest, and the answer
 * next to it is what has to be exact.
 */
const FORBIDDEN = [
  {
    why: 'the service level agreement publishes no figure of availability',
    pattern: /\b\d{1,3}(?:[.,]\d+)?\s*%\s*(?:uptime|availability|available)\b/i,
  },
  {
    why: 'the service level agreement publishes no figure of availability',
    pattern: /\b(?:uptime|availability)\b[^.!?]{0,40}\b\d{1,3}(?:[.,]\d+)?\s*%/i,
  },
  {
    why: 'the service level agreement publishes no figure of availability',
    pattern: /\b(?:uptime|availability)\b[^.!?]{0,40}\bguarantee(?:d|s)?\b/i,
  },
  {
    why: 'the service level agreement publishes no figure of availability',
    pattern: /\bguarantee(?:d|s)?\b[^.!?]{0,40}\b(?:uptime|availability)\b/i,
  },
  {
    why: 'the service level agreement promises no service level',
    pattern: /\bSLA\b/,
  },
  {
    why: 'the service level agreement promises no service level',
    pattern: /\bservice level agreement\b/i,
  },
  {
    why: 'the refund policy only refunds automatically when a provisioning or a plan change fails',
    pattern: /\b(?:we|blipmade)\s+(?:will\s+|always\s+|automatically\s+)?refund\b/i,
    inQuestion: true,
  },
  {
    why: 'the refund policy only refunds automatically when a provisioning or a plan change fails',
    pattern: /\bfull refund\b/i,
    inQuestion: true,
  },
  {
    why: 'the refund policy only refunds automatically when a provisioning or a plan change fails',
    pattern: /\bmoney[- ]back\b/i,
    inQuestion: true,
  },
  {
    why: 'the refund policy only refunds automatically when a provisioning or a plan change fails',
    pattern: /\brefund(?:ed|s)?\s+(?:you|your\s+money|to\s+you)\b/i,
    inQuestion: true,
  },
  {
    why: 'the panel is an implementation detail the customer does not know',
    pattern: /\bpterodactyl\b/i,
  },
];

/** The name of the brand, written the same way everywhere. */
const BRAND = 'Blipmade';

for (const page of pages) {
  for (const text of pageTexts(page)) {
    // A question is not a promise. A customer that asks whether the money
    // comes back is answered with the policy of the refunds, and it is the
    // answer that is checked. The rules that carry `inQuestion` are the ones
    // about the refunds, because they are the ones a question is about.
    const isQuestion = /\?\s*$/.test(text.trim());
    for (const rule of FORBIDDEN) {
      const match = rule.pattern.exec(text);
      if (!match) continue;
      if (rule.inQuestion && isQuestion) continue;
      problem(`the page "${page.id}" says "${match[0]}", and ${rule.why}.`);
    }

    const brand = /blip[\s-]?made/gi;
    let match = brand.exec(text);
    while (match) {
      const before = text.slice(Math.max(0, match.index - 2), match.index);
      const after = text.slice(match.index + match[0].length, match.index + match[0].length + 4);
      // A hostname is not a mention of the brand.
      const isHost = before.endsWith('//') || /^\.[a-z]{2,4}/i.test(after);
      // A name of a record of the DNS is not a mention of the brand either.
      // The verification of a domain is published under the name
      // `_blipmade-verify`, and that name is read by the resolver of the
      // DNS, not by a visitor.
      const isIdentifier = /[_-]$/.test(before) || /^[_-]/.test(after);
      if (!isHost && !isIdentifier && match[0] !== BRAND) {
        problem(`the page "${page.id}" writes the brand as "${match[0]}". It is written "${BRAND}".`);
      }
      match = brand.exec(text);
    }
  }
}

// --- the catalog ------------------------------------------------------------

const wordingProblems = problems.length - wordingStart;

/** The slugs the catalog offers. */
function readCatalogSlugs(path) {
  const catalog = readJson(path, 'catalog of the platform');
  const list = Array.isArray(catalog) ? catalog : Array.isArray(catalog?.products) ? catalog.products : [];
  const slugs = new Set();
  for (const product of list) {
    if (isText(product?.slug)) slugs.add(product.slug);
    else if (isText(product?.id)) slugs.add(product.id);
  }
  return slugs;
}

let catalogState = 'skipped';
if (catalogPath) {
  const slugs = readCatalogSlugs(resolve(process.cwd(), catalogPath));
  for (const page of pages) {
    if (!isText(page.catalogSlug)) continue;
    if (!slugs.has(page.catalogSlug)) {
      problem(`the page "${page.id}" is the page of "${page.catalogSlug}", which the catalog does not offer.`);
    }
  }
  catalogState = 'ok';
} else {
  catalogState = 'skipped';
}

// --- the age of a page ------------------------------------------------------

/** The day of the last change of the platform. */
function lastChange() {
  try {
    const out = execFileSync('git', ['log', '-1', '--format=%cI', '--', 'api', 'web'], {
      cwd: root,
      encoding: 'utf8',
      stdio: ['ignore', 'pipe', 'ignore'],
    }).trim();
    const time = new Date(out).getTime();
    return Number.isNaN(time) ? null : time;
  } catch {
    return null;
  }
}

const lastChangeTime = lastChange();
if (lastChangeTime === null) {
  warn('the age of the pages could not be read, so no page was checked for it.');
} else {
  const stale = pages.filter((page) => {
    if (!isDay(page.updated)) return false;
    return new Date(`${page.updated}T00:00:00Z`).getTime() < lastChangeTime;
  });
  if (stale.length) {
    const day = new Date(lastChangeTime).toISOString().slice(0, 10);
    warn(
      `${stale.length} page(s) are older than the last change of the platform (${day}): ` +
        stale
          .slice(0, 10)
          .map((page) => `${page.id} (${page.updated})`)
          .join(', ') +
        (stale.length > 10 ? `, and ${stale.length - 10} more` : ''),
    );
  }
}

// --- the report -------------------------------------------------------------

const perGroup = new Map();
for (const group of groupsInput) {
  if (!group || typeof group !== 'object') continue;
  const count = pages.filter((page) => page.group === group.id).length;
  perGroup.set(group.id, count);
}

const sectionCount = pages.reduce(
  (total, page) => total + (Array.isArray(page.sections) ? page.sections.length : 0),
  0,
);
const blockCount = pages.reduce(
  (total, page) =>
    total +
    (Array.isArray(page.sections)
      ? page.sections.reduce((sum, section) => sum + (Array.isArray(section?.blocks) ? section.blocks.length : 0), 0)
      : 0),
  0,
);

console.log('The documentation content');
console.log(`  groups        ${Array.isArray(groupsInput) ? groupsInput.length : 0}`);
console.log(`  pages         ${pages.length}`);
console.log(`  sections      ${sectionCount}`);
console.log(`  blocks        ${blockCount}`);
console.log(`  links         ${linkCount} in the text`);
for (const group of groupsInput) {
  if (!group || typeof group !== 'object') continue;
  console.log(`    ${String(group.order ?? '?').padStart(2)} ${String(group.id).padEnd(20)} ${perGroup.get(group.id) ?? 0} page(s)`);
}
console.log('');
console.log('The checks');
console.log(`  structure     ${structureProblems === 0 ? 'ok' : `${structureProblems} problem(s)`}`);
console.log(`  links         ${linkProblems === 0 ? 'ok' : `${linkProblems} problem(s)`}`);
console.log(`  terminology   ${wordingProblems === 0 ? 'ok' : `${wordingProblems} problem(s)`}`);
console.log(
  `  catalog       ${catalogState === 'ok' ? 'ok' : 'skipped — pass --catalog <file.json> to check it'}`,
);
console.log('');

if (warnings.length) {
  console.log('These warnings do not fail the check:');
  for (const warning of warnings) console.log(`  - ${warning}`);
  console.log('');
}

if (problems.length) {
  console.log('These problems were found:');
  for (const item of problems) console.log(`  - ${item}`);
  console.log('');
  console.log(`${problems.length} problem(s) were found.`);
  process.exit(1);
}

console.log('Everything is fine.');

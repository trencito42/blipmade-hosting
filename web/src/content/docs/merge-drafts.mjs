#!/usr/bin/env node
/**
 * Merges the drafts of the documentation into the content of the pages.
 *
 * The three writers each own a part of the documentation and write their own
 * JSON file. This script puts the parts together, adds what belongs to every
 * application page (the slug of the catalog), and writes the result as the
 * content of the pages.
 *
 * It fails when a page is written twice, when a page is missing, or when a
 * page points at a page that does not exist. A page that points at nothing is
 * a dead end for the customer, and the validation of the documentation has to
 * catch it.
 */
import { readFileSync, writeFileSync, readdirSync } from 'node:fs';
import { join, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const contentDir = here;
const draftDir = join(contentDir, 'drafts');

const APP_GROUPS = new Set(['apps', 'databases']);

const drafts = readdirSync(draftDir)
  .filter((name) => name.endsWith('.json'))
  .sort();

const pages = [];
const seen = new Map();

for (const name of drafts) {
  const parsed = JSON.parse(readFileSync(join(draftDir, name), 'utf8'));
  if (!Array.isArray(parsed)) throw new Error(`${name} is not an array of pages.`);
  for (const page of parsed) {
    if (!page.id) throw new Error(`${name} holds a page without an id.`);
    if (seen.has(page.id)) {
      throw new Error(`The page "${page.id}" is written twice: in ${seen.get(page.id)} and in ${name}.`);
    }
    seen.set(page.id, name);
    // The page of an application is published only when the catalog offers
    // the product, and the product is found by its slug.
    if (APP_GROUPS.has(page.group) && !page.catalogSlug) page.catalogSlug = page.id;
    pages.push(page);
  }
}

// The order of the pages: the applications and the databases first (so the
// first page of the documentation is the first product), then the pages of
// the journey of the customer, in the order of their groups.
const groups = JSON.parse(readFileSync(join(contentDir, 'groups.json'), 'utf8'));
const orderOfGroup = new Map(groups.map((group) => [group.id, group.order ?? 0]));
pages.sort((a, b) => {
  const groupA = orderOfGroup.get(a.group) ?? 99;
  const groupB = orderOfGroup.get(b.group) ?? 99;
  if (groupA !== groupB) return groupA - groupB;
  const appA = APP_GROUPS.has(a.group) ? 0 : 1;
  const appB = APP_GROUPS.has(b.group) ? 0 : 1;
  if (appA !== appB) return appA - appB;
  return 0;
});

// Every link of the documentation has to point at a page that exists.
const ids = new Set(pages.map((page) => page.id));
const broken = [];
for (const page of pages) {
  for (const key of ['next', 'related']) {
    for (const target of page[key] ?? []) {
      if (!ids.has(target)) broken.push(`${page.id}.${key} -> ${target}`);
    }
  }
}
if (broken.length) {
  console.error('These links point at a page that does not exist:');
  for (const link of broken) console.error(`  ${link}`);
  process.exit(1);
}

writeFileSync(join(contentDir, 'pages.json'), `${JSON.stringify(pages, null, 2)}\n`);
console.log(`pages written : ${pages.length}`);
console.log(`groups        : ${groups.length}`);
const perGroup = new Map();
for (const page of pages) perGroup.set(page.group, (perGroup.get(page.group) ?? 0) + 1);
for (const group of groups) {
  console.log(`  ${String(group.order ?? 0).padStart(2)} ${group.id.padEnd(22)} ${perGroup.get(group.id) ?? 0} page(s)`);
}

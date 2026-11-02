// Writes the index of the public documentation that the API searches for the support bots.
// The API container does not hold the pages of the site, so the index is a file that is kept in step with them:
//   node scripts/sync-docs-index.mjs          writes api/src/data/docs-index.json
//   node scripts/sync-docs-index.mjs --check  fails when the file is out of date (the web tests run it)
import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pages = JSON.parse(readFileSync(join(root, 'web/src/content/docs/pages.json'), 'utf8'));
/** The words of a page, for finding it and for giving a model something to answer from: the titles of its sections and the start of its text. */
function excerpt(page) {
  const parts = [];
  for (const section of page.sections ?? []) {
    parts.push(section.title);
    for (const block of section.blocks ?? []) {
      if (block.t === 'p' && block.text) parts.push(block.text.replace(/\[([^\]]+)\]\([^)]+\)/g, '$1'));
      if (block.t === 'steps') for (const step of block.items ?? []) parts.push(`${step.title}: ${step.body ?? ''}`);
      if (block.t === 'callout' && block.text) parts.push(block.text);
    }
  }
  return parts.join(' ').replace(/\s+/g, ' ').trim().slice(0, 1600);
}

const index = pages.map((page) => ({
  id: page.id,
  title: page.title,
  summary: page.summary,
  keywords: page.keywords ?? [],
  url: `/docs?p=${page.id}`,
  updated: page.updated ?? null,
  text: excerpt(page),
}));
const text = `${JSON.stringify(index, null, 2)}\n`;
const target = join(root, 'api/src/data/docs-index.json');
if (process.argv.includes('--check')) {
  let current = '';
  try {
    current = readFileSync(target, 'utf8');
  } catch {
    /* missing */
  }
  if (current !== text) {
    console.error('api/src/data/docs-index.json is out of date: run node scripts/sync-docs-index.mjs');
    process.exit(1);
  }
} else {
  writeFileSync(target, text);
  console.log(`${index.length} pages`);
}

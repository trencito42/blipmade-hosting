// Writes the small summary of the documentation that the meta of the pages needs.
//
// The content of the documentation is a large file: it holds every block of
// every page. The head of a page needs much less of it: the name of the page,
// the line under the name, the group it belongs to and the day it was written.
//
// This script writes that summary next to the catalog, so the head of a page
// can be written without the whole of the documentation. Run it after a
// change of the content:  npm run sync:docs
//
// The test of the documentation checks that the summary and the content are
// the same, so the two cannot drift apart.
import fs from 'node:fs';
import path from 'node:path';

const contentDir = process.env.DOCS_CONTENT_DIR ?? path.resolve('src/content/docs');
const out = path.resolve('src/site/data/meta.json');

const pages = JSON.parse(fs.readFileSync(path.join(contentDir, 'pages.json'), 'utf8'));
const groups = JSON.parse(fs.readFileSync(path.join(contentDir, 'groups.json'), 'utf8'));

const labels = new Map(groups.map((group) => [group.id, group.label]));

const summary = pages.map((page) => ({
  id: page.id,
  title: page.title,
  summary: page.summary,
  group: page.group,
  groupLabel: labels.get(page.group) ?? page.group,
  keywords: page.keywords ?? [],
  updated: page.updated,
  ...(page.catalogSlug ? { catalogSlug: page.catalogSlug } : {}),
}));

fs.mkdirSync(path.dirname(out), { recursive: true });
fs.writeFileSync(out, `${JSON.stringify(summary, null, 2)}\n`);
console.log(`documentation summary: ${summary.length} pages`);

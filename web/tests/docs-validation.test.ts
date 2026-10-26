/**
 * The content of the documentation, checked without a browser.
 *
 * The file runs with the test runner of Node:
 *
 *     node --test web/tests/
 *
 * The content of the documentation is two files of plain data. The interface
 * reads them and checks them (src/content/docs/schema.ts), and the validator
 * of the repository checks them again (scripts/validate-docs.mjs). Both
 * checks are here:
 *
 *   1. the content of the repository is well formed: every group and every
 *      page is there, and every link points at something that exists;
 *   2. the check refuses every kind of mistake, and it names all of them at
 *      once, so one run is enough to fix the content;
 *   3. the validator of the repository passes on the content, and it fails
 *      on content that is broken.
 */

import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

import { DOC_GROUPS, DOC_PAGES, parseDocs, type DocPage } from '../src/content/docs/schema.ts';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
const repoRoot = join(webRoot, '..');
const contentDir = join(webRoot, 'src', 'content', 'docs');
const validator = join(repoRoot, 'scripts', 'validate-docs.mjs');

const groupsInput = JSON.parse(readFileSync(join(contentDir, 'groups.json'), 'utf8'));
const pagesInput = JSON.parse(readFileSync(join(contentDir, 'pages.json'), 'utf8'));

/**
 * The rules of the validator of the repository, written the same way.
 *
 * The check of the content and the check of the words have to agree, so the
 * rules live here too and both checks refuse the same text.
 */
const FORBIDDEN: { pattern: RegExp; inQuestion?: boolean }[] = [
  { pattern: /\b\d{1,3}(?:[.,]\d+)?\s*%\s*(?:uptime|availability|available)\b/i },
  { pattern: /\b(?:uptime|availability)\b[^.!?]{0,40}\b\d{1,3}(?:[.,]\d+)?\s*%/i },
  { pattern: /\b(?:uptime|availability)\b[^.!?]{0,40}\bguarantee(?:d|s)?\b/i },
  { pattern: /\bguarantee(?:d|s)?\b[^.!?]{0,40}\b(?:uptime|availability)\b/i },
  { pattern: /\bSLA\b/ },
  { pattern: /\bservice level agreement\b/i },
  { pattern: /\b(?:we|blipmade)\s+(?:will\s+|always\s+|automatically\s+)?refund\b/i, inQuestion: true },
  { pattern: /\bfull refund\b/i, inQuestion: true },
  { pattern: /\bmoney[- ]back\b/i, inQuestion: true },
  { pattern: /\brefund(?:ed|s)?\s+(?:you|your\s+money|to\s+you)\b/i, inQuestion: true },
  { pattern: /\bpterodactyl\b/i },
];

/** The promise a text makes, when it makes one the platform does not keep. */
function promiseIn(text: string): string | null {
  // A question is not a promise. A customer that asks whether the money
  // comes back is answered with the policy, and the answer is checked.
  const isQuestion = /\?\s*$/.test(text.trim());
  for (const rule of FORBIDDEN) {
    const match = rule.pattern.exec(text);
    if (!match) continue;
    if (rule.inQuestion && isQuestion) continue;
    return match[0];
  }
  return null;
}

/** The way the brand is written, when it is not written the right way. */
function misspelledBrand(text: string): string | null {
  const brand = /blip[\s-]?made/gi;
  let match = brand.exec(text);
  while (match) {
    const before = text.slice(Math.max(0, match.index - 2), match.index);
    const after = text.slice(match.index + match[0].length, match.index + match[0].length + 4);
    // A hostname and the name of a record of the DNS are not mentions of
    // the brand.
    const isHost = before.endsWith('//') || /^\.[a-z]{2,4}/i.test(after);
    const isIdentifier = /[_-]$/.test(before) || /^[_-]/.test(after);
    if (!isHost && !isIdentifier && match[0] !== 'Blipmade') return match[0];
    match = brand.exec(text);
  }
  return null;
}

/** The pages the documentation had before the content was moved into files. */
const KNOWN_PAGES = [
  'getting-started',
  'first-app',
  'account',
  'dashboard',
  'wordpress',
  'ghost',
  'forgejo',
  'code-server',
  'uptime-kuma',
  'grafana',
  'n8n',
  'discord-bot',
  'postgresql',
  'mysql',
  'redis',
  'mongodb',
  'resources',
  'billing',
  'upgrade',
  'cancel',
  'refunds',
  'domains',
  'dns',
  'ssl',
  'platform-domains',
  'files',
  'console',
  'logs',
  'account-security',
  'instance-access',
  'permissions',
  'email-hosting',
  'mailboxes',
  'mail-dns',
  'webmail',
  'notifications',
  'backups',
  'troubleshooting',
  'support',
  'tickets',
  'status',
  'limits',
  'glossary',
  'faq',
  'common-errors',
];

/** The groups the documentation is read in, in the order of the journey. */
const KNOWN_GROUPS = [
  'getting-started',
  'apps',
  'databases',
  'resources-billing',
  'domains-ssl',
  'files-console',
  'security',
  'email-hosting',
  'notifications',
  'backups-recovery',
  'troubleshooting',
  'support',
  'status-incidents',
  'limits-fair-use',
  'reference',
];

/** Every text of a page, everywhere it is written. */
function pageTexts(page: DocPage): string[] {
  const texts: string[] = [page.title, page.summary, ...page.keywords];
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (block.t === 'p' || block.t === 'callout') texts.push(block.text);
      if (block.t === 'list') texts.push(...block.items);
      if (block.t === 'code') texts.push(block.code);
      if (block.t === 'spec') for (const row of block.rows) texts.push(row.k, row.v);
      if (block.t === 'steps') for (const step of block.items) texts.push(step.title, step.body, step.result);
      if (block.t === 'trouble') for (const item of block.items) texts.push(item.q, item.a);
    }
  }
  return texts;
}

/** A copy of the content, with one change in it. */
function brokenContent(change: (pages: DocPage[], groups: unknown[]) => void): { groups: unknown[]; pages: unknown[] } {
  const pages = JSON.parse(JSON.stringify(pagesInput)) as DocPage[];
  const groups = JSON.parse(JSON.stringify(groupsInput)) as unknown[];
  change(pages, groups);
  return { groups, pages };
}

/** The problem the check reports for a content that is broken. */
function problemsOf(content: { groups: unknown[]; pages: unknown[] }): string {
  try {
    parseDocs(content.groups, content.pages);
  } catch (error) {
    return String((error as Error).message);
  }
  return '';
}

/** Runs the validator of the repository and gives back what it said. */
function runValidator(options: { contentDir?: string; catalog?: string } = {}): { code: number; out: string } {
  const env = { ...process.env };
  if (options.contentDir) env.DOCS_CONTENT_DIR = options.contentDir;
  else delete env.DOCS_CONTENT_DIR;
  const args = [validator];
  if (options.catalog) args.push('--catalog', options.catalog);
  try {
    const out = execFileSync(process.execPath, args, { cwd: repoRoot, encoding: 'utf8', env });
    return { code: 0, out };
  } catch (error) {
    const failure = error as { status?: number; stdout?: string };
    return { code: failure.status ?? 1, out: failure.stdout ?? '' };
  }
}

/** The content of the documentation, written somewhere else. */
function writeContent(content: { groups: unknown[]; pages: unknown[] }): string {
  const dir = mkdtempSync(join(tmpdir(), 'blipmade-docs-'));
  writeFileSync(join(dir, 'groups.json'), `${JSON.stringify(content.groups, null, 2)}\n`);
  writeFileSync(join(dir, 'pages.json'), `${JSON.stringify(content.pages, null, 2)}\n`);
  return dir;
}

describe('the content of the documentation', () => {
  it('has fifteen groups and forty-five pages', () => {
    assert.equal(DOC_GROUPS.length, 15);
    assert.equal(DOC_PAGES.length, 45);
    assert.deepEqual(
      DOC_GROUPS.map((group) => group.id),
      KNOWN_GROUPS,
    );
  });

  it('keeps every page the documentation had', () => {
    assert.deepEqual(
      DOC_PAGES.map((page) => page.id),
      KNOWN_PAGES,
    );
  });

  it('puts every page in a group that exists, and points every link at a page that exists', () => {
    const ids = new Set(DOC_PAGES.map((page) => page.id));
    const groupIds = new Set(DOC_GROUPS.map((group) => group.id));
    for (const page of DOC_PAGES) {
      assert.ok(groupIds.has(page.group), `the page ${page.id} is in the group ${page.group}`);
      for (const target of [...page.next, ...page.related]) {
        assert.ok(ids.has(target), `the page ${page.id} points at ${target}`);
      }
      assert.ok(page.sections.length > 0, `the page ${page.id} has no sections`);
      for (const section of page.sections) {
        assert.ok(section.id.length > 0);
        assert.ok(section.blocks.length > 0, `the section ${section.id} has no blocks`);
      }
    }
  });

  it('leaves the price and the resources of a product to the catalog', () => {
    const products = DOC_PAGES.filter((page) => page.catalogSlug);
    assert.equal(products.length, 12);
    for (const page of products) {
      const text = pageTexts(page).join(' ');
      assert.match(text, /\{\{catalog\.price\}\}/, `the page ${page.id} has no price of the catalog`);
      assert.match(text, /\{\{catalog\.minResources\}\}/, `the page ${page.id} has no resources of the catalog`);
      assert.doesNotMatch(text, /\$\d/, `the page ${page.id} writes a price of its own`);
      assert.doesNotMatch(text, /\b\d+\s?GB RAM\b/, `the page ${page.id} writes the memory of its own`);
    }
  });

  it('keeps the badges that say what is not built yet', () => {
    // Every badge marks a thing the platform does not do today. The list is
    // written here so that a badge that appears or disappears is a change
    // that is seen.
    const expected = [
      'wordpress',
      'ghost',
      'forgejo',
      'code-server',
      'uptime-kuma',
      'grafana',
      'n8n',
      'discord-bot',
      'postgresql',
      'mysql',
      'redis',
      'mongodb',
      'ssl',
      'instance-access',
      'status',
    ];
    const marked = DOC_PAGES.filter((page) => pageTexts(page).some((text) => text.includes('{{planned}}')));
    assert.deepEqual(marked.map((page) => page.id), expected);
    for (const page of marked) {
      const badges = pageTexts(page).filter((text) => text.includes('{{planned}}'));
      assert.equal(badges.length, 1, `the page ${page.id} carries ${badges.length} badges`);
    }
  });

  it('does not promise what the platform does not promise', () => {
    for (const page of DOC_PAGES) {
      for (const text of pageTexts(page)) {
        assert.equal(promiseIn(text), null, `the page ${page.id} says something the platform does not promise`);
        assert.equal(misspelledBrand(text), null, `the page ${page.id} writes the brand in the wrong way`);
      }
    }
  });

  it('accepts a question about the money and refuses a promise of a refund', () => {
    assert.equal(promiseIn('Will you give my money back?'), null);
    assert.equal(promiseIn('We will refund you in full.'), 'We will refund');
    assert.equal(promiseIn('A full refund is given.'), 'full refund');
  });

  it('accepts the name of a record of the DNS and refuses the brand written in the wrong way', () => {
    assert.equal(misspelledBrand('publish the value under _blipmade-verify'), null);
    assert.equal(misspelledBrand('the panel is at apps.blipmade.com'), null);
    assert.equal(misspelledBrand('the brand is blipmade.'), 'blipmade');
    assert.equal(misspelledBrand('the brand is blip-made.'), 'blip-made');
  });
});

describe('the check of the content', () => {
  it('accepts the content of the repository', () => {
    const content = parseDocs(groupsInput, pagesInput);
    assert.equal(content.groups.length, 15);
    assert.equal(content.pages.length, 45);
  });

  it('refuses a group that is written twice', () => {
    const content = brokenContent((_pages, groups) => {
      groups.push({ ...(groups[0] as Record<string, unknown>) });
    });
    assert.match(problemsOf(content), /already used/);
  });

  it('refuses a page that is written twice', () => {
    const content = brokenContent((pages) => {
      pages.push({ ...(pages[0] as Record<string, unknown>) });
    });
    assert.match(problemsOf(content), /already used/);
  });

  it('refuses a page in a group that does not exist', () => {
    const content = brokenContent((pages) => {
      (pages[0] as Record<string, unknown>).group = 'a-group-that-does-not-exist';
    });
    assert.match(problemsOf(content), /which does not exist/);
  });

  it('refuses a page without a title, a summary or keywords', () => {
    const content = brokenContent((pages) => {
      const page = pages[0] as Record<string, unknown>;
      page.title = '';
      page.summary = '';
      page.keywords = [];
    });
    const message = problemsOf(content);
    assert.match(message, /has no title/);
    assert.match(message, /has no summary/);
    assert.match(message, /has no keywords/);
  });

  it('refuses a page without a section', () => {
    const content = brokenContent((pages) => {
      (pages[0] as Record<string, unknown>).sections = [];
    });
    assert.match(problemsOf(content), /has no sections/);
  });

  it('refuses two sections of a page with the same anchor', () => {
    const content = brokenContent((pages) => {
      const page = pages[0] as DocPage;
      page.sections[1].id = page.sections[0].id;
    });
    assert.match(problemsOf(content), /which the page already uses/);
  });

  it('refuses a block of a kind nobody renders', () => {
    const content = brokenContent((pages) => {
      const page = pages[0] as DocPage;
      (page.sections[0].blocks[0] as { t: string }).t = 'a-kind-nobody-renders';
    });
    assert.match(problemsOf(content), /unknown kind/);
  });

  it('refuses a link to a page that does not exist', () => {
    const content = brokenContent((pages) => {
      const page = pages[0] as DocPage;
      page.next = ['a-page-that-does-not-exist'];
      page.related = ['another-page-that-does-not-exist'];
    });
    const message = problemsOf(content);
    assert.match(message, /points at the page "a-page-that-does-not-exist"/);
    assert.match(message, /points at the page "another-page-that-does-not-exist"/);
  });

  it('refuses a date that is not a day', () => {
    const content = brokenContent((pages) => {
      (pages[0] as Record<string, unknown>).updated = 'the day before yesterday';
    });
    assert.match(problemsOf(content), /not a day/);
  });

  it('refuses a catalog slug on a page that is not the page of a product', () => {
    const content = brokenContent((pages) => {
      const page = pages.find((entry) => !entry.catalogSlug) as DocPage;
      page.catalogSlug = 'a-product';
    });
    assert.match(problemsOf(content), /not the page of a product/);
  });

  it('names every problem at once', () => {
    const content = brokenContent((pages) => {
      const page = pages[0] as DocPage;
      page.title = '';
      page.next = ['a-page-that-does-not-exist'];
      (page.sections[0].blocks[0] as { t: string }).t = 'a-kind-nobody-renders';
    });
    const message = problemsOf(content);
    assert.match(message, /has no title/);
    assert.match(message, /points at the page "a-page-that-does-not-exist"/);
    assert.match(message, /unknown kind/);
  });
});

describe('the validator of the repository', () => {
  it('passes on the content of the repository', () => {
    const result = runValidator();
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /Everything is fine\./);
  });

  it('says that the catalog is not checked when there is no catalog', () => {
    const result = runValidator();
    assert.match(result.out, /catalog {2,}skipped/);
  });

  it('fails on content that is broken', () => {
    const dir = writeContent(
      brokenContent((pages) => {
        (pages[0] as Record<string, unknown>).group = 'a-group-that-does-not-exist';
      }),
    );
    const result = runValidator({ contentDir: dir });
    assert.equal(result.code, 1);
    assert.match(result.out, /a-group-that-does-not-exist/);
  });

  it('fails when the catalog does not offer the product of a page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blipmade-catalog-'));
    const catalog = join(dir, 'catalog.json');
    writeFileSync(catalog, JSON.stringify({ products: [{ slug: 'wordpress' }] }, null, 2));
    const result = runValidator({ catalog });
    assert.equal(result.code, 1);
    assert.match(result.out, /which the catalog does not offer/);
  });

  it('passes when the catalog offers every product of a page', () => {
    const dir = mkdtempSync(join(tmpdir(), 'blipmade-catalog-'));
    const catalog = join(dir, 'catalog.json');
    const products = DOC_PAGES.filter((page) => page.catalogSlug).map((page) => ({ slug: page.catalogSlug }));
    writeFileSync(catalog, JSON.stringify({ products }, null, 2));
    const result = runValidator({ catalog });
    assert.equal(result.code, 0, result.out);
    assert.match(result.out, /catalog {2,}ok/);
  });
});

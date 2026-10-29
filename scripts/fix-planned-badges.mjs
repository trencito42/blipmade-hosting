#!/usr/bin/env node
/**
 * Corrects the statements of the guides of the products that the platform can
 * now deploy.
 *
 * Five products were validated on the node: a container of them was really
 * built, started and answered on the port of the allocation. Their guides
 * still said that the platform does not install them, and that is not true
 * any more. The text is replaced with what was measured, and the badge that
 * says "planned" is taken away from the products that are built.
 *
 * The badges of the products that are still coming stay where they are: the
 * badge says that the thing is designed and not built yet, and that is still
 * the truth of the products the platform cannot deploy today.
 *
 * Usage: node scripts/fix-planned-badges.mjs [--dry]
 */

import { readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const pagesPath = join(root, 'web/src/content/docs/pages.json');
const pages = JSON.parse(readFileSync(pagesPath, 'utf8'));
const dry = process.argv.includes('--dry');

/** What each product runs today, and what the guide has to say about it. */
const TRUTH = {
  wordpress: {
    planned:
      'The container runs the web server and the PHP of the platform, with the WordPress files in it. The database of the site is not part of the container: the instance needs a database of its own.',
    callout: null,
  },
  'code-server': {
    planned:
      'Code Server itself is installed in the container of the instance. The editor is in the browser, and the code that is written in it runs on the node of the platform.',
    callout: {
      tone: 'note',
      text: 'Code Server runs in the container of the instance: the editor is in the browser, and the code runs on the node of the platform.',
    },
  },
  grafana: {
    planned:
      'Grafana itself is installed in the container of the instance: the panels of the metrics are served from the node of the platform.',
    callout: {
      tone: 'note',
      text: 'Grafana runs in the container of the instance and asks for the account of the administrator on the first start.',
    },
  },
  postgresql: {
    planned:
      'PostgreSQL itself is installed in the container of the instance: the database is a server of its own.',
    callout: {
      tone: 'note',
      text: 'The database of the instance is a PostgreSQL server in the container. The password of the user is the one the platform made and showed in the console.',
    },
  },
  redis: {
    planned:
      'Redis itself is installed in the container of the instance. It keeps its data in the memory of the container.',
    callout: {
      tone: 'note',
      text: 'Redis runs in the container of the instance. It is the cache and the queue of an application that is built on it.',
    },
  },
};

let changed = 0;
for (const page of pages) {
  const truth = TRUTH[page.id];
  if (!truth) continue;
  for (const section of page.sections) {
    for (const block of section.blocks) {
      if (block.t === 'p' && typeof block.text === 'string' && block.text.includes('{{planned}}')) {
        block.text = truth.planned;
        changed += 1;
      }
      if (block.t === 'callout' && typeof block.text === 'string' && /cannot be ordered|does not offer it yet|does not install it yet/.test(block.text)) {
        if (!truth.callout) {
          // The callout is taken away: there is nothing to warn about any more.
          block.t = 'p';
          block.text = truth.planned;
        } else {
          block.tone = truth.callout.tone;
          block.text = truth.callout.text;
        }
        changed += 1;
      }
    }
  }
}

if (!dry) writeFileSync(pagesPath, `${JSON.stringify(pages, null, 2)}\n`);
console.log(`${dry ? 'DRY RUN' : 'WRITTEN'}: ${changed} statement(s) corrected`);

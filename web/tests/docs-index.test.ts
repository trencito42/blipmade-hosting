/**
 * The index of the documentation that the support bots search (api/src/data/docs-index.json) is a copy of the pages of the
 * site. This test fails when a page was added or changed and the copy was not written again:
 *
 *     node scripts/sync-docs-index.mjs
 *
 * It only runs inside the whole repository; a checkout of the web folder alone has nothing to compare.
 */
import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { existsSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const repo = join(dirname(fileURLToPath(import.meta.url)), '..', '..');
const script = join(repo, 'scripts', 'sync-docs-index.mjs');

describe('the docs index of the bots', () => {
  it('is in step with the pages of the site', { skip: !existsSync(script) }, () => {
    const result = spawnSync('node', [script, '--check'], { encoding: 'utf8' });
    assert.equal(result.status, 0, result.stderr);
  });
});

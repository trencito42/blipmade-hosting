import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { describe, it } from 'node:test';
import { fileURLToPath } from 'node:url';

const here = dirname(fileURLToPath(import.meta.url));
const ops = readFileSync(join(here, '../src/admin/Ops.tsx'), 'utf8');
const history = readFileSync(join(here, '../src/admin/OpsBackups.tsx'), 'utf8');

describe('operations backup labels', () => {
  it('does not call a decrypt or listing a restore', () => {
    assert.match(ops, /Isolated restore tested/);
    assert.match(ops, /Decrypted, restore untested/);
    assert.match(ops, /Remote copy verified/);
    assert.doesNotMatch(ops, /if \(state === 'restore_verified' \|\| state === 'healthy'\) return \{ status: 'active', label: 'Restore verified' \}/);
    assert.match(history, /Isolated restore tested/);
    assert.match(history, /Decrypted, restore untested/);
    assert.doesNotMatch(history, /if \(row\.restoreVerified\) return \{ status: 'active', label: 'Restore verified' \}/);
  });
});

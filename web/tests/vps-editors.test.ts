import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('the changes to a VPS are dedicated pages and the server page only links to them', async () => {
  const [routes, vps, page] = await Promise.all([read('src/routes.tsx'), read('src/app/Vps.tsx'), read('src/app/VpsEditors.tsx')]);
  for (const tail of ['settings/edit', 'ssh-key', 'iso', 'reinstall', 'snapshots/new', 'snapshots/:name/restore']) {
    const pattern = `pattern: '/app/vps/:id/${tail}'`;
    assert.ok(routes.includes(pattern), tail);
    assert.ok(routes.indexOf(pattern) < routes.indexOf("pattern: '/app/vps/:id',"), tail);
    assert.match(routes.slice(routes.indexOf(pattern), routes.indexOf(pattern) + 200), /layout: 'editor'/);
  }
  // The detail page no longer changes anything by itself, except ejecting an image and deleting a snapshot.
  assert.doesNotMatch(vps, /patch\(`\/vps/);
  assert.doesNotMatch(vps, /ssh-key`, \{ sshPublicKey/);
  assert.doesNotMatch(vps, /reinstall`, \{ confirm/);
  assert.match(vps, /VPS_TABS\.find\(\(entry\) => entry\.id === pageQuery\.tab\)/);
  for (const call of ["patch(`/vps/${encodeURIComponent(id)}`", "ssh-key`, { sshPublicKey", "reinstall`, { confirm: true", "snapshots`, { name", "/restore`", "iso`, { file }"]) {
    assert.ok(page.includes(call), call);
  }
  assert.equal((page.match(/useUnsavedChangesGuard/g) ?? []).length >= 7, true);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('Git rollback uses a dedicated review page', async () => {
  const [routes, tab, page] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/instance/GitTab.tsx'),
    read('src/app/instance/RollbackDeployment.tsx'),
  ]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/git/deployments/:deployId/rollback'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /git\/deployments\/\$\{encodeURIComponent\(entry\.id\)\}\/rollback/);
  assert.doesNotMatch(tab, /\/rollback`, \{ release/);
  assert.match(page, /\$\{base\}\/rollback/);
  assert.match(page, /useUnsavedChangesGuard/);
  assert.match(page, /Acknowledge the replacement/);
  assert.match(page, /entry\.release !== git\?\.current/);
});

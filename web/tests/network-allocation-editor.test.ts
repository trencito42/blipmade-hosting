import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('network allocation creation uses a dedicated provider-bounded editor', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/NetworkTab.tsx'), read('src/app/instance/NewAllocation.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/network/new'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /network\/new/);
  assert.doesNotMatch(tab, /createAllocation/);
  assert.match(editor, /createAllocation\(id/);
  assert.match(editor, /Use a port from 1 to 65535/);
  assert.match(editor, /useUnsavedChangesGuard/);
});

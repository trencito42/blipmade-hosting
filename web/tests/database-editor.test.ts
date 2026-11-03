import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('database creation uses a dedicated credential-aware editor', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/DatabasesTab.tsx'), read('src/app/instance/NewDatabase.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/databases/new'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /databases\/new/);
  assert.doesNotMatch(tab, /createDatabase/);
  assert.match(editor, /createDatabase\(id/);
  assert.match(editor, /getDatabaseCredentials/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage/);
});

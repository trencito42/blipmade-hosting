import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('instance identity settings use one dedicated editor route', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/SettingsTab.tsx'), read('src/app/instance/EditInstanceSettings.tsx')]);
  const specific = routes.indexOf("pattern: '/app/instances/:id/settings/edit'");
  const dynamic = routes.indexOf("pattern: '/app/instances/:id/:tab'");
  assert.ok(specific > -1 && specific < dynamic);
  assert.match(tab, /settings\/edit/);
  assert.doesNotMatch(tab, /updateSettings/);
  assert.match(editor, /updateSettings\(id, \{ name: name\.trim\(\), description: description\.trim\(\) \}\)/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.match(editor, /Save settings/);
});

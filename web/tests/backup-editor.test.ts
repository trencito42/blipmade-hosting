import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('manual backup creation uses a dedicated retention-aware editor', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/BackupsTab.tsx'), read('src/app/instance/NewBackup.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/backups/new'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /backups\/new/);
  assert.doesNotMatch(tab, /createBackup/);
  assert.match(editor, /createBackup\(id, \{ name: name\.trim\(\), locked \}\)/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.match(editor, /provider node/);
});

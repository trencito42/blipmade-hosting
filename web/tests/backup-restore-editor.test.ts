import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('backup restore uses a dedicated typed-confirmation route', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/BackupsTab.tsx'), read('src/app/instance/RestoreBackup.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/backups/:backupId/restore'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /backups\/\$\{encodeURIComponent\(row\.id\)\}\/restore/);
  assert.doesNotMatch(tab, /restoreBackup/);
  assert.match(editor, /restoreBackup\(id, backupId\)/);
  assert.match(editor, /confirmation === backup\.name/);
  assert.match(editor, /useUnsavedChangesGuard/);
});

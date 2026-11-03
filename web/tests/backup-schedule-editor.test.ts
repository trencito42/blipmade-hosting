import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('automatic backups use a dedicated supported-preset editor', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/BackupsTab.tsx'), read('src/app/instance/EditBackupSchedule.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/backup-schedule/edit'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /backup-schedule\/edit/);
  assert.doesNotMatch(tab, /setBackupSchedule/);
  assert.match(editor, /setBackupSchedule\(id, selected\)/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.match(editor, /Every Sunday/);
});

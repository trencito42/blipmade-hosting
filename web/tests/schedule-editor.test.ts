import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url); const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('schedule creation uses a dedicated action-aware editor', async () => {
  const [routes, tab, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/instance/SchedulesTab.tsx'), read('src/app/instance/NewSchedule.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/schedules/new'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(tab, /schedules\/new/); assert.doesNotMatch(tab, /createSchedule/);
  assert.match(editor, /createSchedule\(id/); assert.match(editor, /validCron/); assert.match(editor, /useUnsavedChangesGuard/); assert.match(editor, /Power signal/);
});

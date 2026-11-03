import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('the password change uses a dedicated page', async () => {
  const [routes, settings, page] = await Promise.all([read('src/routes.tsx'), read('src/app/Settings.tsx'), read('src/app/ChangePassword.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/settings/password'") < routes.indexOf("pattern: '/app/settings'"));
  assert.match(settings, /to="\/app\/settings\/password"/);
  assert.doesNotMatch(settings, /post<\{ changed: boolean/);
  assert.match(page, /'\/settings\/password'/);
  assert.match(page, /useUnsavedChangesGuard/);
  assert.match(page, /The two passwords do not match/);
});

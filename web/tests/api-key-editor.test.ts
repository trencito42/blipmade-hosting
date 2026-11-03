import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('a new API key is made on a dedicated page and shown once', async () => {
  const [routes, panels, page] = await Promise.all([read('src/routes.tsx'), read('src/app/SecurityPanels.tsx'), read('src/app/ApiKeyNew.tsx')]);
  assert.match(routes, /pattern: '\/app\/settings\/api-keys\/new'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/app/settings/api-keys/new'") < routes.indexOf("pattern: '/app/settings',"));
  assert.match(panels, /to="\/app\/settings\/api-keys\/new"/);
  assert.doesNotMatch(panels, /post<\{ key: string \}>/);
  assert.match(panels, /Revoke this key\?/);
  assert.match(page, /post<\{ key: string \}>\('\/settings\/api-keys'/);
  assert.match(page, /useUnsavedChangesGuard/);
  assert.match(page, /shown only this once/);
  // The secret never reaches the storage of the browser or the address.
  assert.doesNotMatch(page, /localStorage|sessionStorage|navigate\([^)]*made/);
});

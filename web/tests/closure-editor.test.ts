import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('closing the account is a dedicated review page and the tab only links to it', async () => {
  const [routes, settings, page] = await Promise.all([read('src/routes.tsx'), read('src/app/Settings.tsx'), read('src/app/SettingsEditors.tsx')]);
  assert.match(routes, /pattern: '\/app\/settings\/closure'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/app/settings/closure'") < routes.indexOf("pattern: '/app/settings',"));
  assert.match(settings, /to="\/app\/settings\/closure"/);
  assert.doesNotMatch(settings, /'\/settings\/account\/closure'/);
  assert.match(page, /'\/settings\/account\/closure', \{ password, confirmation: CLOSE_PHRASE \}/);
  assert.match(page, /del\('\/settings\/account\/closure'\)/);
  assert.match(page, /Closing the account ends your services/);
});

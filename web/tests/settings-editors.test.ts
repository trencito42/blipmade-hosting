import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('email change and billing address use dedicated pages', async () => {
  const [routes, settings, page] = await Promise.all([read('src/routes.tsx'), read('src/app/Settings.tsx'), read('src/app/SettingsEditors.tsx')]);
  for (const route of ['/app/settings/email/change', '/app/settings/billing-address']) {
    assert.ok(routes.indexOf(`pattern: '${route}'`) !== -1);
    assert.ok(routes.indexOf(`pattern: '${route}'`) < routes.indexOf("pattern: '/app/settings',"));
  }
  assert.match(settings, /to="\/app\/settings\/email\/change"/);
  assert.match(settings, /to="\/app\/settings\/billing-address"/);
  assert.doesNotMatch(settings, /put\('\/settings\/billing-address'/);
  assert.doesNotMatch(settings, /'\/settings\/email', \{/);
  assert.match(page, /'\/settings\/email'/);
  assert.match(page, /put\('\/settings\/billing-address'/);
  assert.match(page, /validateBillingAddress/);
  assert.equal((page.match(/useUnsavedChangesGuard/g) ?? []).length >= 3, true);
});

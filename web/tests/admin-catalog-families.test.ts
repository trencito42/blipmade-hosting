import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('catalogue families are dedicated pages and do not replace the product catalogue', async () => {
  const [routes, list, editors, catalog] = await Promise.all([
    read('src/routes.tsx'),
    read('src/admin/catalog/Families.tsx'),
    read('src/admin/catalog/Editors.tsx'),
    read('../api/src/routes/catalog.ts'),
  ]);
  assert.match(routes, /pattern: '\/admin\/catalog\/families\/new'[^\n]*layout: 'editor'/);
  assert.match(routes, /pattern: '\/admin\/catalog\/families\/:id\/edit'[^\n]*layout: 'editor'/);
  assert.match(routes, /pattern: '\/admin\/catalog\/families\/:id\/variants\/new'[^\n]*layout: 'editor'/);
  assert.match(routes, /pattern: '\/admin\/catalog\/families\/:id\/presets\/:presetId\/edit'[^\n]*layout: 'editor'/);
  assert.match(routes, /pattern: '\/admin\/catalog\/families\/:id\/addons\/:addonId\/edit'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/admin/catalog/families/new'") < routes.indexOf("pattern: '/admin/catalog/families/:id'"));
  assert.match(list, /\/admin\/catalog\/families\/new/);
  assert.match(editors, /PageEditorShell/);
  assert.match(editors, /useUnsavedChangesGuard/);
  assert.equal((editors.match(/<h1/g) ?? []).length, 0);
  assert.doesNotMatch(catalog, /CatalogFamily|catalogFamily/);
});

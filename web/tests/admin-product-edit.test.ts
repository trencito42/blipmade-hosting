import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('a product is edited on its own admin page, the list only links to it', async () => {
  const [routes, list, page] = await Promise.all([read('src/routes.tsx'), read('src/admin/Products.tsx'), read('src/admin/ProductEdit.tsx')]);
  assert.match(routes, /pattern: '\/admin\/products\/:id\/edit'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/admin/products/:id/edit'") < routes.indexOf("pattern: '/admin/products',"));
  assert.match(list, /\/admin\/products\/\$\{encodeURIComponent\(product\.id\)\}\/edit/);
  assert.doesNotMatch(list, /ProductEditor|setEditing/);
  assert.match(page, /useEditorBack/);
  assert.equal((page.match(/<h1/g) ?? []).length, 1);
});

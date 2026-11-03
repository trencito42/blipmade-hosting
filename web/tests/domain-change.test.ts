import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('domain rename and deletion use dedicated pages', async () => {
  const [routes, list, page] = await Promise.all([read('src/routes.tsx'), read('src/app/Domains.tsx'), read('src/app/DomainChange.tsx')]);
  assert.match(routes, /\/app\/domains\/:id\/edit/);
  assert.match(routes, /\/app\/domains\/:id\/delete/);
  assert.match(list, /\/app\/domains\/\$\{encodeURIComponent\(domain\.id\)\}\/edit/);
  assert.match(list, /\/app\/domains\/\$\{encodeURIComponent\(domain\.id\)\}\/delete/);
  assert.doesNotMatch(list, /ConfirmDialog|PlatformAddress/);
  assert.doesNotMatch(list, /del\(`\/domains/);
  assert.match(page, /\/address`/);
  assert.match(page, /del\(`\/domains\//);
  assert.match(page, /useUnsavedChangesGuard/);
  assert.match(page, /Type “\$\{domain\.hostname\}” exactly/);
});

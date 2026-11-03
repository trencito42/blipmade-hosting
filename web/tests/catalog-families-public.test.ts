import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('prepared families are an extra path and the product catalogue stays', async () => {
  const [routes, catalog, deploy, api] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/DeployCatalog.tsx'),
    read('src/app/Deploy.tsx'),
    read('../api/src/routes/catalog.ts'),
  ]);
  assert.ok(routes.indexOf("pattern: '/app/deploy/families/:slug'") < routes.indexOf("pattern: '/app/deploy/:slug'"));
  assert.match(catalog, /useCatalogProducts/);
  assert.match(catalog, /\/catalog\/families/);
  assert.match(deploy, /familySlug: query.family/);
  assert.match(api, /\/catalog\/products/);
  assert.match(api, /publicFamilies/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('the resources of an instance are changed on a dedicated page with the quote of the server', async () => {
  const [routes, detail, page] = await Promise.all([read('src/routes.tsx'), read('src/app/InstanceDetail.tsx'), read('src/app/instance/EditResources.tsx')]);
  assert.match(routes, /pattern: '\/app\/instances\/:id\/resources\/edit'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/app/instances/:id/resources/edit'") < routes.indexOf("pattern: '/app/instances/:id/:tab'"));
  assert.match(detail, /resources\/edit/);
  assert.doesNotMatch(detail, /\/resources`, \{ ram, cpu, disk \}/);
  assert.match(page, /resources\/quote/);
  assert.match(page, /put<SaveResult>/);
  assert.match(page, /useUnsavedChangesGuard/);
  // Only a payment that the server asks for leads to a checkout, and the page does not redirect by itself.
  assert.match(page, /requires_payment/);
  assert.doesNotMatch(page, /location\.assign|window\.location\.href/);
});

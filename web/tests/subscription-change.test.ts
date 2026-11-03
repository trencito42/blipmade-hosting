import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('subscription cancel and resume use dedicated pages', async () => {
  const [routes, billing, page] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/Billing.tsx'),
    read('src/app/SubscriptionChange.tsx'),
  ]);
  for (const tail of ['cancel', 'resume', 'reactivate']) {
    assert.match(routes, new RegExp(`/app/billing/subscriptions/:id/${tail}`));
  }
  assert.ok(routes.indexOf("pattern: '/app/billing/subscriptions/:id/cancel'") < routes.indexOf("pattern: '/app/billing',"));
  assert.match(billing, /billing\/subscriptions\/\$\{encodeURIComponent\(subscription\.id\)\}/);
  assert.doesNotMatch(billing, /ConfirmDialog/);
  assert.doesNotMatch(billing, /subscriptions\/\$\{id\}\/cancel/);
  assert.match(page, /\/billing\/subscriptions\/\$\{encodeURIComponent\(id\)\}\/\$\{mode\}/);
  assert.match(page, /useUnsavedChangesGuard/);
  assert.match(page, /Acknowledge the end of the service/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('an order and a subscription have a page of their own, linked from billing', async () => {
  const [routes, billing, order, sub] = await Promise.all([read('src/routes.tsx'), read('src/app/Billing.tsx'), read('src/app/OrderView.tsx'), read('src/app/SubscriptionChange.tsx')]);
  assert.match(routes, /pattern: '\/app\/billing\/orders\/:id'/);
  assert.match(routes, /pattern: '\/app\/billing\/subscriptions\/:id', component: AppSubscriptionView/);
  assert.ok(routes.indexOf("pattern: '/app/billing/orders/:id'") < routes.indexOf("pattern: '/app/billing',"));
  assert.match(billing, /\/app\/billing\/orders\/\$\{encodeURIComponent\(order\.id\)\}/);
  assert.match(billing, /\/app\/billing\/subscriptions\/\$\{encodeURIComponent\(subscription\.id\)\}`/);
  assert.match(order, /`\/orders\/\$\{encodeURIComponent\(id\)\}`/);
  assert.match(order, /fulfillmentError/);
  // Only an order that waits for payment can be paid from the page.
  assert.match(order, /waiting && \(/);
  assert.match(sub, /export function SubscriptionView/);
});

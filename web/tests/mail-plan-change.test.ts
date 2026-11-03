import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('mail plan change is a dedicated checkout-backed review', async () => {
  const [routes, overview, editor] = await Promise.all([read('src/routes.tsx'), read('src/app/mail/MailOverview.tsx'), read('src/app/mail/ChangeMailPlan.tsx')]);
  assert.match(routes, /\/app\/mail\/services\/:serviceId\/plan\/change/);
  assert.match(overview, /managePlanTo=/);
  assert.doesNotMatch(overview, /MailPlanChangeDialog/);
  assert.match(editor, /\/mail\/services\/\$\{encodeURIComponent\(serviceId\)\}\/plan/);
  assert.match(editor, /\/orders\/\$\{encodeURIComponent\(order\.id\)\}\/checkout/);
  assert.match(editor, /orderRef/);
  assert.match(editor, /useUnsavedChangesGuard/);
});

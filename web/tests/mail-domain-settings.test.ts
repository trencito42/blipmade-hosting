import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';
const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');
test('email domain deletion is isolated in a typed-confirmation safety route', async () => {
  const [routes, page, settings] = await Promise.all([read('src/routes.tsx'), read('src/app/mail/MailDomainPage.tsx'), read('src/app/mail/MailDomainSettings.tsx')]);
  assert.ok(routes.indexOf("pattern: '/app/mail/domains/:id/settings'") < routes.indexOf("pattern: '/app/mail/domains/:id'"));
  assert.match(page, /Review domain deletion/);
  assert.doesNotMatch(page, /setPendingDelete\(\{ kind: 'domain'/);
  assert.match(settings, /confirmation === domain\.name/);
  assert.match(settings, /deleteMailDomain\(id\)/);
  assert.match(settings, /useUnsavedChangesGuard/);
});

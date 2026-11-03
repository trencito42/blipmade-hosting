import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('alias creation uses a dedicated same-domain mailbox editor', async () => {
  const [routes, domainPage, editor] = await Promise.all([
    read('src/routes.tsx'), read('src/app/mail/MailDomainPage.tsx'), read('src/app/mail/NewAlias.tsx'),
  ]);
  const specific = routes.indexOf("pattern: '/app/mail/domains/:id/aliases/new'");
  const dynamic = routes.indexOf("pattern: '/app/mail/domains/:id'");
  assert.ok(specific > -1 && specific < dynamic);
  assert.match(domainPage, /aliases\/new/);
  assert.doesNotMatch(domainPage, /AliasCreateDialog/);
  assert.match(editor, /createMailAlias\(id, \{ alias: address, target: selectedTarget \}\)/);
  assert.match(editor, /mailbox\.status !== 'active'/);
  assert.match(editor, /useUnsavedChangesGuard/);
});

import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('mailbox creation is a dedicated one-time-secret editor', async () => {
  const [routes, domainPage, editor] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/mail/MailDomainPage.tsx'),
    read('src/app/mail/NewMailbox.tsx'),
  ]);
  const specific = routes.indexOf("pattern: '/app/mail/domains/:id/mailboxes/new'");
  const dynamic = routes.indexOf("pattern: '/app/mail/domains/:id'");
  assert.ok(specific > -1 && specific < dynamic);
  assert.match(domainPage, /mailboxes\/new/);
  assert.doesNotMatch(domainPage, /MailboxCreateDialog/);
  assert.match(editor, /createMailbox\(id, body\)/);
  assert.match(editor, /OneTimePasswordBox/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.doesNotMatch(editor, /localStorage|sessionStorage/);
});

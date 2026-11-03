import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('email domain creation has one dedicated canonical editor', async () => {
  const [routes, overview, editor] = await Promise.all([
    read('src/routes.tsx'),
    read('src/app/mail/MailOverview.tsx'),
    read('src/app/mail/NewMailDomain.tsx'),
  ]);
  const specific = routes.indexOf("pattern: '/app/mail/domains/new'");
  const dynamic = routes.indexOf("pattern: '/app/mail/domains/:id'");
  assert.ok(specific > -1 && specific < dynamic, 'new route must precede the dynamic domain route');
  assert.match(routes, /label: 'Add domain'/);
  assert.doesNotMatch(overview, /Add domain/);
  assert.doesNotMatch(overview, /MailAddDomainDialog/);
  assert.match(editor, /PageEditorShell/);
  assert.match(editor, /useUnsavedChangesGuard/);
  assert.match(editor, /\/mail\/services\/\$\{encodeURIComponent\(selectedId\)\}\/domains/);
  assert.match(editor, /post<\{ domain: CreatedMailDomain \}>\('\/mail\/domains'/);
  assert.match(editor, /verificationToken/);
});

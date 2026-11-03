import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('a passkey is added on a dedicated page and the list only links to it', async () => {
  const [routes, panels, page] = await Promise.all([read('src/routes.tsx'), read('src/app/SecurityPanels.tsx'), read('src/app/PasskeyNew.tsx')]);
  assert.match(routes, /pattern: '\/app\/settings\/security\/passkeys\/new'[^\n]*layout: 'editor'/);
  assert.ok(routes.indexOf("pattern: '/app/settings/security/passkeys/new'") < routes.indexOf("pattern: '/app/settings',"));
  assert.match(panels, /to="\/app\/settings\/security\/passkeys\/new"/);
  assert.doesNotMatch(panels, /registerPasskey/);
  assert.match(page, /registerPasskey/);
  assert.match(page, /passkeysSupported\(\)/);
  assert.match(page, /useUnsavedChangesGuard/);
  // The page claims a passkey only after the browser and the server both said yes.
  assert.ok(page.indexOf('await registerPasskey') < page.indexOf("'The passkey was added.'"));
});

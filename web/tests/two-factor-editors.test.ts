import assert from 'node:assert/strict';
import { readFile } from 'node:fs/promises';
import test from 'node:test';

const root = new URL('../', import.meta.url);
const read = (path: string) => readFile(new URL(path, root), 'utf8');

test('two-factor setup, new backup codes and turning it off are dedicated pages', async () => {
  const [routes, panels, page] = await Promise.all([read('src/routes.tsx'), read('src/app/SecurityPanels.tsx'), read('src/app/TwoFactorEditors.tsx')]);
  for (const route of ['/app/settings/security/2fa', '/app/settings/security/2fa/disable', '/app/settings/security/2fa/backup-codes']) {
    assert.match(routes, new RegExp(`pattern: '${route.replace(/\//g, '\\/')}'[^\\n]*layout: 'editor'`));
    assert.ok(routes.indexOf(`pattern: '${route}'`) < routes.indexOf("pattern: '/app/settings',"));
  }
  // The longer routes come before the shorter one, so the dynamic matcher cannot swallow them.
  assert.ok(routes.indexOf("pattern: '/app/settings/security/2fa/disable'") < routes.indexOf("pattern: '/app/settings/security/2fa',"));
  assert.match(panels, /to="\/app\/settings\/security\/2fa"/);
  assert.doesNotMatch(panels, /\/settings\/2fa\//);
  for (const endpoint of ['/settings/2fa/setup', '/settings/2fa/enable', '/settings/2fa/disable', '/settings/2fa/backup-codes']) {
    assert.ok(page.includes(endpoint), endpoint);
  }
  assert.match(page, /You have not saved your backup codes/);
  // A visit never makes a key: the setup starts only on the button.
  assert.doesNotMatch(page, /useEffect/);
  assert.doesNotMatch(page, /localStorage|sessionStorage/);
});

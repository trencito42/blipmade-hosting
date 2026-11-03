import { after, before, describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';
import { createServer, type ViteDevServer } from 'vite';

const here = dirname(fileURLToPath(import.meta.url));
const webRoot = join(here, '..');
let server: ViteDevServer;
let validateHostname: (value: string) => string | undefined;

before(async () => {
  server = await createServer({ root: webRoot, server: { middlewareMode: true }, appType: 'custom', logLevel: 'silent' });
  const editor = await server.ssrLoadModule('/src/app/NewDomain.tsx') as { validateHostname: typeof validateHostname };
  validateHostname = editor.validateHostname;
});

after(async () => server.close());

describe('the dedicated domain editor', () => {
  it('validates the same important hostname boundaries before calling the API', () => {
    assert.equal(validateHostname('app.example.com'), undefined);
    assert.match(validateHostname('') ?? '', /Enter the hostname/);
    assert.match(validateHostname('https://app.example.com/path') ?? '', /without a protocol/);
    assert.match(validateHostname('*.example.com') ?? '', /wildcard/i);
    assert.match(validateHostname('-app.example.com') ?? '', /cannot start or end/);
  });

  it('registers the dedicated route and removes creation from the inventory page', () => {
    const routes = readFileSync(join(webRoot, 'src/routes.tsx'), 'utf8');
    const inventory = readFileSync(join(webRoot, 'src/app/Domains.tsx'), 'utf8');
    const editor = readFileSync(join(webRoot, 'src/app/NewDomain.tsx'), 'utf8');
    assert.match(routes, /pattern: '\/app\/domains\/new'/);
    assert.match(inventory, /to="\/app\/domains\/new"/);
    assert.doesNotMatch(inventory, /\/instances\/\$\{targetInstanceId\}\/domains/);
    assert.match(editor, /post<\{ domain: Domain \}>\(`\/instances\/\$\{instanceId\}\/domains`/);
    assert.match(editor, /useUnsavedChangesGuard/);
    assert.match(editor, /PageEditorShell/);
  });
});

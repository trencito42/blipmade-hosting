import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { deployContextFromQuery, deployPathFor } from '../src/lib/pricing-contract.ts';

describe('deploy address', () => {
  it('keeps the import and the catalogue choice when the resources change', () => {
    const query = { import: 'cm1234567890abcd', family: 'custom-runtime', variant: 'nodejs', preset: 'welcome', presetVersion: '1', addons: 'backup', ram: '512' };
    const path = deployPathFor('nodejs', { ram: 2048, cpu: 1, disk: 10 }, [], { ...deployContextFromQuery(query), step: '3' });
    assert.match(path, /import=cm1234567890abcd/);
    assert.match(path, /family=custom-runtime/);
    assert.match(path, /variant=nodejs/);
    assert.match(path, /preset=welcome/);
    assert.match(path, /presetVersion=1/);
    assert.match(path, /addons=backup/);
    assert.match(path, /ram=2048/);
    assert.doesNotMatch(path, /secret/i);
  });

  it('drops a context value that is not a safe token', () => {
    assert.deepEqual(deployContextFromQuery({ import: '../etc', family: 'ok name' }), {});
  });
});

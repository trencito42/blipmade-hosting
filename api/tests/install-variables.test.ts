import { describe, expect, it } from 'vitest';
import { applyInstallVariables, checkoutSpecs } from '../src/services/install-variables.js';

describe('install variables', () => {
  it('does not require GIT_ADDRESS at quote time', () => {
    const specs = checkoutSpecs({ GIT_ADDRESS: { required: true, label: 'Repository' }, EULA: { required: true, label: 'EULA' } });
    expect(specs.GIT_ADDRESS?.required).toBe(false);
    expect(specs.EULA?.required).toBe(true);
  });

  it('uses the stored repository and does not invent one for a zip', () => {
    const egg = { GIT_ADDRESS: '', BRANCH: '', USER_UPLOAD: '0' };
    expect(applyInstallVariables(egg, { kind: 'git', repoUrl: 'https://github.com/trencito42/daily81', branch: 'main' })).toEqual({
      GIT_ADDRESS: 'https://github.com/trencito42/daily81',
      BRANCH: 'main',
      USER_UPLOAD: '0',
    });
    expect(applyInstallVariables(egg, { kind: 'zip', repoUrl: null, branch: null }).USER_UPLOAD).toBe('1');
    expect(applyInstallVariables(egg, { kind: 'zip', repoUrl: null, branch: null }).GIT_ADDRESS).toBe('');
  });
});

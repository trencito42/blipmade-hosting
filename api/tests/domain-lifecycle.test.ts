import { describe, expect, it } from 'vitest';
import { nextRegistrationState, sellingAllowed } from '../src/services/domain-lifecycle.js';
import { fixtureProvider } from '../src/services/domain-commerce.js';
import { saasTransition } from '../src/services/cloudflare-saas.js';
import { planIsolatedBuild } from '../src/services/isolated-build.js';

describe('domain registration state machine', () => {
  it('moves quote to registered only through the provider', () => {
    expect(nextRegistrationState('quoted', 'submit')).toBe('pending_register');
    expect(nextRegistrationState('pending_register', 'provider_ok')).toBe('registered');
    expect(nextRegistrationState('registered', 'submit')).toBeNull();
  });

  it('sells only fixture .example names when commerce is on', async () => {
    const offer = await fixtureProvider.lookup('available.example');
    expect(sellingAllowed(true, offer)).toBe(true);
    const live = await fixtureProvider.lookup('blipmade.com');
    expect(sellingAllowed(true, live)).toBe(false);
  });
});

describe('cloudflare saas transitions', () => {
  it('walks dns then certificate', () => {
    expect(saasTransition('draft', 'submit')).toBe('pending_dns');
    expect(saasTransition('pending_dns', 'dns_ok')).toBe('pending_certificate');
    expect(saasTransition('pending_certificate', 'cert_ok')).toBe('active');
    expect(saasTransition('active', 'submit')).toBeNull();
  });
});

describe('isolated smart deploy builds', () => {
  it('records commands and refuses to execute without a sandbox', () => {
    const plan = planIsolatedBuild({ buildCommand: 'npm ci', startCommand: 'node server.js', runtime: 'node' });
    expect(plan.executes).toBe(false);
    expect(plan.status).toBe('blocked_no_sandbox');
  });
});

import { describe, expect, it } from 'vitest';
import { nextRegistrationState, sellingAllowed } from '../src/services/domain-lifecycle.js';
import { fixtureProvider } from '../src/services/domain-commerce.js';
import { saasTransition } from '../src/services/cloudflare-saas.js';
import { planIsolatedBuild, SANDBOX_LIMITS, sandboxDispatchPayload } from '../src/services/isolated-build.js';
import { ownershipTxt, saasReconcile } from '../src/services/cloudflare-saas.js';
import { quoteStillValid } from '../src/services/domain-commerce.js';
import { capabilitiesFor, hasCapability, instanceCapabilities } from '../src/services/game-capabilities.js';

describe('domain registration state machine', () => {
  it('moves quote to registered only through the provider', () => {
    expect(nextRegistrationState('quoted', 'submit')).toBe('pending_register');
    expect(nextRegistrationState('pending_register', 'provider_ok')).toBe('registered');
    expect(nextRegistrationState('registered', 'submit')).toBeNull();
  });

  it('sells only fixture .example names when commerce is on', async () => {
    const offer = await fixtureProvider.lookup('available.example');
    expect(sellingAllowed(true, offer)).toBe(true);
    expect(quoteStillValid(offer)).toBe(true);
    expect(sellingAllowed(true, { ...offer, expiresAt: new Date(Date.now() - 1000).toISOString() })).toBe(false);
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
    expect(saasReconcile('pending_dns', 'active')).toBe('active');
    expect(saasReconcile('disabled', 'active')).toBe('disabled');
    expect(ownershipTxt('play.example.com', 'tok').name).toBe('_cf-custom-hostname.play.example.com');
  });
});

describe('isolated smart deploy builds', () => {
  it('records commands and refuses to execute without a sandbox', () => {
    const plan = planIsolatedBuild({ buildCommand: 'npm ci', startCommand: 'node server.js', runtime: 'node' });
    expect(plan.executes).toBe(false);
    expect(plan.status).toBe('blocked_no_sandbox');
    expect(plan.limits).toEqual(SANDBOX_LIMITS);
    expect(sandboxDispatchPayload({ id: 'j1', buildCommand: 'npm ci', startCommand: 'node .', sandboxHost: null }).executes).toBe(false);
  });
});

describe('game capability registry', () => {
  it('exposes plugins only on Paper/Folia and connect only on verified profiles', () => {
    expect(hasCapability('minecraft-paper', 'minecraft-plugins')).toBe(true);
    expect(hasCapability('minecraft-forge', 'minecraft-plugins')).toBe(false);
    expect(hasCapability('minecraft-forge', 'minecraft-modpacks')).toBe(true);
    expect(hasCapability('rust', 'smart-connect')).toBe(false);
    expect(capabilitiesFor('nodejs')).toBeNull();
  });

  it('builds effective navigation and availability on the server', () => {
    const paper = instanceCapabilities({ productSlug: 'minecraft-paper', deployed: true, access: 'owner' });
    expect(paper).toMatchObject({ family: 'minecraft-java', edition: 'Java', loader: 'paper' });
    expect(paper.primaryTabs).toEqual(['overview', 'console', 'minecraft', 'addons', 'backups', 'settings']);
    expect(paper.features.plugins).toMatchObject({ supported: true, available: true, requiresRestart: true });
    expect(paper.features.modpacks.supported).toBe(false);

    const pending = instanceCapabilities({ productSlug: 'rust', deployed: false, access: 'owner' });
    expect(pending.features.serverSettings).toMatchObject({ supported: true, available: false, reason: 'This service is not deployed yet.' });

    const viewer = instanceCapabilities({ productSlug: 'nodejs', deployed: true, access: 'viewer' });
    expect(viewer.family).toBe('web');
    expect(viewer.features.console).toMatchObject({ supported: true, available: true });
    expect(viewer.features.git).toMatchObject({ supported: true, available: false, reason: 'Your shared access is read-only.' });
    expect(viewer.features.resourceScaling.reason).toMatch(/Only the service owner/);
  });
});

import { describe, expect, it } from 'vitest';
import { fixtureProvider, domainCommerceEnabled } from '../src/services/domain-commerce.js';
import { cloudflareSaasEnabled, saasPlan } from '../src/services/cloudflare-saas.js';

describe('domain commerce fixtures', () => {
  it('does not invent availability for a real name', async () => {
    const offer = await fixtureProvider.lookup('blipmade.com');
    expect(offer.state).toBe('disabled');
    expect(offer.amount).toBeNull();
    expect(domainCommerceEnabled()).toBe(false);
  });

  it('returns a deterministic fixture for tests only', async () => {
    const offer = await fixtureProvider.lookup('available.example');
    expect(offer.state).toBe('available');
    expect(offer.amount).toBe(1299);
    expect(offer.note).toMatch(/Fixture only/);
  });
});

describe('cloudflare saas plans', () => {
  it('stays on the Caddy path while the flag is off', () => {
    expect(cloudflareSaasEnabled()).toBe(false);
    const plan = saasPlan('shop.customer.test', 'apps.blipmade.com');
    expect(plan.state).toBe('disabled');
    expect(plan.apex).toBe(false);
    expect(plan.note).toMatch(/Caddy/);
  });

  it('does not promise apex without entitlement', () => {
    const plan = saasPlan('customer.test', 'apps.blipmade.com');
    expect(plan.apex).toBe(true);
    expect(plan.note).toMatch(/Apex/);
  });
});

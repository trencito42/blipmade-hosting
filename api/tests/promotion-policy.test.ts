import { describe, expect, it } from 'vitest';
import { assertSponsoredShape } from '../src/services/promotion-policy.js';
import { isDisposableEmail } from '../src/lib/email-identity.js';

const small = { quantity: 1, ram: 512, cpu: 1, disk: 2, fulfilment: 'SERVER' };

describe('sponsored order shape', () => {
  it('accepts one small server', () => {
    expect(() => assertSponsoredShape([small])).not.toThrow();
  });
  it('refuses several lines, quantity above one, other products and big sizes', () => {
    expect(() => assertSponsoredShape([small, small])).toThrow();
    expect(() => assertSponsoredShape([{ ...small, quantity: 2 }])).toThrow();
    expect(() => assertSponsoredShape([{ ...small, fulfilment: 'EMAIL' }])).toThrow();
    expect(() => assertSponsoredShape([{ ...small, vps: {} }])).toThrow();
    expect(() => assertSponsoredShape([{ ...small, ram: 8192 }])).toThrow();
  });
});

describe('built-in disposable domains', () => {
  it('blocks known services and their subdomains without any configuration', () => {
    expect(isDisposableEmail('a@mailinator.com', '')).toBe(true);
    expect(isDisposableEmail('a@x.yopmail.com', '')).toBe(true);
    expect(isDisposableEmail('a@gmail.com', '')).toBe(false);
  });
});

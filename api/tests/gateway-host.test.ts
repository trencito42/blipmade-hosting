import { describe, expect, it } from 'vitest';
import { gatewayHost } from '../src/services/domain-activation.js';

describe('the gateway that is asked about a hostname', () => {
  it('is the host of the admin address', () => {
    expect(gatewayHost('http://10.77.0.12:2020')).toBe('10.77.0.12');
  });
  it('is empty when there is no admin address or it is not a URL', () => {
    expect(gatewayHost('')).toBe('');
    expect(gatewayHost('not a url')).toBe('');
  });
});

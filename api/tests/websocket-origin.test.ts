import { describe, expect, it } from 'vitest';
import { isAllowedWebSocketOrigin } from '../src/lib/websocket-origin.js';

describe('cookie-authenticated WebSocket origin allowlist', () => {
  const allowed = 'https://blipmade.com, https://staging.blipmade.com';

  it('accepts exactly configured dashboard origins', () => {
    expect(isAllowedWebSocketOrigin('https://blipmade.com', allowed)).toBe(true);
    expect(isAllowedWebSocketOrigin('https://staging.blipmade.com', allowed)).toBe(true);
  });

  it('rejects customer-hosted same-site subdomains', () => {
    expect(isAllowedWebSocketOrigin('https://bot.apps.blipmade.com', allowed)).toBe(false);
    expect(isAllowedWebSocketOrigin('https://apps.blipmade.com', allowed)).toBe(false);
    expect(isAllowedWebSocketOrigin('https://evil.blipmade.com', allowed)).toBe(false);
  });

  it('rejects missing, null, malformed and forged origins', () => {
    for (const origin of [
      undefined,
      ['https://blipmade.com'],
      'null',
      'https://blipmade.com.evil.example',
      'https://blipmade.com@evil.example',
      'https://blipmade.com/path',
      'https://blipmade.com?redirect=1',
      'file:///etc/passwd',
      'https://blipmade.com,https://evil.example',
    ]) {
      expect(isAllowedWebSocketOrigin(origin, allowed)).toBe(false);
    }
  });

  it('requires exact scheme and port, including in development', () => {
    expect(isAllowedWebSocketOrigin('http://localhost:5173', 'http://localhost:5173')).toBe(true);
    expect(isAllowedWebSocketOrigin('http://localhost:5174', 'http://localhost:5173')).toBe(false);
    expect(isAllowedWebSocketOrigin('http://blipmade.com', allowed)).toBe(false);
    expect(isAllowedWebSocketOrigin('https://blipmade.com:8443', allowed)).toBe(false);
  });

  it('fails closed when no valid frontend origins are configured', () => {
    expect(isAllowedWebSocketOrigin('https://blipmade.com', '')).toBe(false);
    expect(isAllowedWebSocketOrigin('https://blipmade.com', '*')).toBe(false);
  });
});

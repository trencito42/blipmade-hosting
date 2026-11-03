import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { addressRateLimitKey, rateLimitKey } from '../src/plugins/auth.js';
import { closeApp, getApp, resetDatabase } from './helpers.js';

/** Untrusted forwarding data and new TCP ports must never reset an IP limit. */

let app: FastifyInstance;

/** An address of a proxy that the API trusts. */
const TRUSTED_PROXY = '127.0.0.1';
/** An address of a proxy that the API does not trust. */
const UNTRUSTED_PROXY = '10.77.0.13';
/** The address of a client behind that proxy. */
const CLIENT = '203.0.113.9';

/**
 * A request as the server sees it, with the address of the peer and the
 * address of the client.
 */
function fakeRequest(options: {
  ip: string;
  peer: string;
  port: number;
  forwardedFor?: string;
}): FastifyRequest {
  return {
    ip: options.ip,
    socket: { remoteAddress: options.peer, remotePort: options.port },
    headers: options.forwardedFor ? { 'x-forwarded-for': options.forwardedFor } : {},
  } as unknown as FastifyRequest;
}

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('the key of the counters of the addresses', () => {
  it('is the address of the client when the proxy is trusted', () => {
    const request = fakeRequest({ ip: CLIENT, peer: TRUSTED_PROXY, port: 40000, forwardedFor: CLIENT });
    expect(rateLimitKey(request)).toBe(CLIENT);
    expect(addressRateLimitKey(request).startsWith(CLIENT)).toBe(true);
  });

  it('does not trust an unverified forwarded address', () => {
    const request = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40001, forwardedFor: CLIENT });
    expect(rateLimitKey(request)).toBe(UNTRUSTED_PROXY);
    expect(addressRateLimitKey(request).startsWith(UNTRUSTED_PROXY)).toBe(true);
  });

  it('uses the same counter across new connections from the same untrusted peer', () => {
    const first = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40001, forwardedFor: CLIENT });
    const second = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40002, forwardedFor: '198.51.100.20' });
    expect(rateLimitKey(first)).toBe(rateLimitKey(second));
    expect(addressRateLimitKey(first)).toBe(addressRateLimitKey(second));
  });

  it('cannot bypass the limiter with a forged forwarding header sent directly', () => {
    const direct = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40003 });
    const forged = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40004, forwardedFor: '127.0.0.1' });
    expect(rateLimitKey(direct)).toBe(CLIENT);
    expect(rateLimitKey(forged)).toBe(CLIENT);
  });
});

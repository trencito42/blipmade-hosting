import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { addressRateLimitKey, rateLimitKey } from '../src/plugins/auth.js';
import { closeApp, getApp, resetDatabase } from './helpers.js';

/**
 * The key of the counters of the addresses.
 *
 * A limit that is kept per address must never be kept per platform: when the
 * API cannot tell the address of the client apart from the address of the
 * proxy in front of it, the counter is taken per connection, so one visitor
 * can never lock every other visitor out of a page or of the sign-in.
 */

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

  it('is not the address of the proxy when the proxy is not trusted', () => {
    // The request came through a proxy that the API does not know, so the
    // address of the client cannot be told apart from the address of the
    // proxy. The counter is taken per connection and the counter of the whole
    // platform is never used.
    const request = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40001, forwardedFor: CLIENT });
    expect(rateLimitKey(request)).toBe(`${UNTRUSTED_PROXY}:40001`);
    expect(addressRateLimitKey(request)).not.toBe(UNTRUSTED_PROXY);
    expect(addressRateLimitKey(request).startsWith(`${UNTRUSTED_PROXY}:40001`)).toBe(true);
  });

  it('gives two connections of the same proxy two counters', () => {
    const first = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40001, forwardedFor: CLIENT });
    const second = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40002, forwardedFor: CLIENT });
    expect(addressRateLimitKey(first)).not.toBe(addressRateLimitKey(second));
  });

  it('keeps the counter of a client that speaks for itself', () => {
    // No chain of proxies: the address of the socket is the address of the
    // client and it keeps the counter of that address.
    const request = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40003 });
    expect(rateLimitKey(request)).toBe(CLIENT);
  });
});

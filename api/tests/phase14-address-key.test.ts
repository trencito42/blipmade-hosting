import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { addressRateLimitKey, rateLimitKey } from '../src/plugins/auth.js';
import { closeApp, getApp, resetDatabase } from './helpers.js';

/**
 * An untrusted forwarded address must never change the limiter key.
 * An attacker can open a new TCP connection (new remotePort) for every
 * request, so a per-connection key would defeat IP-based rate limits.
 */
let app: FastifyInstance;

const TRUSTED_PROXY = '127.0.0.1';
const UNTRUSTED_PROXY = '10.77.0.13';
const CLIENT = '203.0.113.9';

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

beforeAll(async () => { app = await getApp(); });
afterAll(async () => { await closeApp(); });
beforeEach(async () => { await resetDatabase(); });

describe('rate-limit keys and trusted forwarding', () => {
  it('uses the resolved client IP when Fastify trusts its proxy', () => {
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

  it('cannot bypass the IP limiter by attaching a forged forwarding header directly', () => {
    const direct = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40003 });
    const forged = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40004, forwardedFor: '127.0.0.1' });
    expect(rateLimitKey(direct)).toBe(CLIENT);
    expect(rateLimitKey(forged)).toBe(CLIENT);
  });
});

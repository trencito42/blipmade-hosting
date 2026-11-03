import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import type { FastifyInstance, FastifyRequest } from 'fastify';
import { env } from '../src/env.js';
import { rateLimitKey, SESSION_COOKIE } from '../src/plugins/auth.js';
import { closeApp, getApp, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';

/**
 * The session of the platform.
 *
 * Two rules are checked here, because both of them decide who may sign in
 * and what the browser keeps:
 *
 *  - the session cookie is marked Secure in production, whatever the protocol
 *    of the request that carries it is: a request that arrives over plain
 *    HTTP must never lower the protection of the cookie;
 *  - the counter of the rate limit is the address of the client when it is
 *    known, and the connection when it is not, so one visitor can never lock
 *    every other visitor out of the sign-in.
 */

let app: FastifyInstance;

const ORIGINAL_COOKIE_SECURE = env.COOKIE_SECURE;
const ORIGINAL_IS_PRODUCTION = env.isProduction;

const EMAIL = 'session@example.com';

/** The address of a proxy that the API trusts. */
const TRUSTED_PROXY = '127.0.0.1';
/** The address of a proxy that the API does not trust. */
const UNTRUSTED_PROXY = '10.77.0.13';
/** The address of a client behind that proxy. */
const CLIENT = '203.0.113.9';

/** Changes the setting of the operator for the time of a test. */
function setCookieSecure(value: string | undefined): void {
  Object.defineProperty(env, 'COOKIE_SECURE', { value, configurable: true, writable: true, enumerable: true });
}

/** Puts the environment in production, or out of it. */
function setProduction(value: boolean): void {
  Object.defineProperty(env, 'isProduction', { value, configurable: true, writable: true, enumerable: true });
}

/** The cookies of a response, as they are written down. */
function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header.map(String) : [String(header)];
}

/** The session cookie of a response. */
function sessionCookie(response: { headers: Record<string, unknown> }): string {
  return setCookies(response).find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`)) ?? '';
}

function isSecure(cookie: string): boolean {
  return /(^|;\s*)Secure(\s*;|$)/.test(cookie);
}

/** Signs a customer in, the way a browser does. */
async function login(options: { remoteAddress?: string; headers?: Record<string, string> } = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: EMAIL, password: VALID_PASSWORD },
    ...(options.remoteAddress ? { remoteAddress: options.remoteAddress } : {}),
    headers: options.headers ?? {},
  });
}

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

afterEach(() => {
  setCookieSecure(ORIGINAL_COOKIE_SECURE);
  setProduction(ORIGINAL_IS_PRODUCTION);
});

describe('the Secure attribute of the session cookie', () => {
  it('is set in production when the request arrives over plain HTTP', async () => {
    // The proxy in front of the API is not in the list of the trusted proxies,
    // so the request is read as plain HTTP even though the visitor is on
    // HTTPS. The cookie must not be weakened by that.
    setCookieSecure(undefined);
    setProduction(true);
    await registerAndLogin(app, EMAIL);

    const response = await login({ remoteAddress: UNTRUSTED_PROXY });

    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).not.toBe('');
    expect(isSecure(sessionCookie(response))).toBe(true);
  });

  it('is left out in production when the operator says so', async () => {
    setCookieSecure('false');
    setProduction(true);
    await registerAndLogin(app, EMAIL);

    const response = await login({ remoteAddress: UNTRUSTED_PROXY });

    expect(response.statusCode).toBe(200);
    expect(isSecure(sessionCookie(response))).toBe(false);
  });

  it('follows the protocol outside production', async () => {
    setCookieSecure(undefined);
    setProduction(false);
    await registerAndLogin(app, EMAIL);

    const plain = await login({ remoteAddress: UNTRUSTED_PROXY });
    expect(isSecure(sessionCookie(plain))).toBe(false);

    const secure = await login({
      remoteAddress: TRUSTED_PROXY,
      headers: { 'x-forwarded-proto': 'https' },
    });
    expect(isSecure(sessionCookie(secure))).toBe(true);
  });
});

describe('the key of the rate limit', () => {
  it('is the address of the client when the proxy is trusted', () => {
    const request = fakeRequest({ ip: CLIENT, peer: UNTRUSTED_PROXY, port: 40_000, forwardedFor: CLIENT });

    // The address of the client was resolved out of the chain, so the counter
    // is the counter of that address.
    expect(rateLimitKey(request)).toBe(CLIENT);
  });

  it('keeps the same peer-IP counter across new connections from an untrusted proxy', () => {
    const first = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40_001, forwardedFor: CLIENT });
    const second = fakeRequest({ ip: UNTRUSTED_PROXY, peer: UNTRUSTED_PROXY, port: 40_002, forwardedFor: '198.51.100.20' });

    // Untrusted forwarded headers and ephemeral ports must not reset a limit.
    expect(rateLimitKey(first)).toBe(UNTRUSTED_PROXY);
    expect(rateLimitKey(first)).toBe(rateLimitKey(second));
  });

  it('is the address of the caller when there is no chain of proxies', () => {
    const request = fakeRequest({ ip: CLIENT, peer: CLIENT, port: 40_003 });

    // A client that speaks for itself keeps the counter of its address.
    expect(rateLimitKey(request)).toBe(CLIENT);
  });
});

describe('the limit of the attempts on one account', () => {
  it('still refuses the attempts on an account and leaves the other accounts alone', async () => {
    await registerAndLogin(app, EMAIL);

    // Ten wrong passwords for one account, every one of them from another
    // address, so the counter of the address never fires.
    for (let attempt = 0; attempt < 10; attempt += 1) {
      const response = await app.inject({
        method: 'POST',
        url: '/api/auth/login',
        payload: { email: EMAIL, password: 'not-the-password' },
        remoteAddress: `203.0.113.${attempt + 1}`,
      });
      expect(response.statusCode).toBe(401);
    }

    const refused = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: EMAIL, password: 'not-the-password' },
      remoteAddress: '203.0.113.20',
    });
    expect(refused.statusCode).toBe(429);
    expect(refused.json().error.code).toBe('rate_limited');

    // Another account is not touched by the counter of this one.
    const other = await app.inject({
      method: 'POST',
      url: '/api/auth/login',
      payload: { email: 'other@example.com', password: VALID_PASSWORD },
      remoteAddress: '203.0.113.21',
    });
    expect(other.statusCode).toBe(401);
  });
});

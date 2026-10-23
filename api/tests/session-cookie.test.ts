import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { env } from '../src/env.js';
import { SESSION_COOKIE, CSRF_COOKIE } from '../src/plugins/auth.js';
import { closeApp, getApp, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * The Secure attribute of the session cookie.
 *
 * The attribute follows the protocol of the request that carries the cookie,
 * so an operator who works on the panel over plain HTTP gets a cookie the
 * browser sends back. `COOKIE_SECURE` stays the override of the operator.
 *
 * The forwarded protocol is only believed when the request came through a
 * proxy the API trusts, so a client cannot forge it.
 */

let app: FastifyInstance;

const ORIGINAL_COOKIE_SECURE = env.COOKIE_SECURE;

/** An address of a proxy the API trusts. */
const TRUSTED_PROXY = '127.0.0.1';
/** An address of a client that is not a proxy the API trusts. */
const UNTRUSTED_CLIENT = '203.0.113.5';

const EMAIL = 'cookie@example.com';

function setCookieSecure(value: string | undefined): void {
  Object.defineProperty(env, 'COOKIE_SECURE', { value, configurable: true, writable: true, enumerable: true });
}

function setCookies(response: { headers: Record<string, unknown> }): string[] {
  const header = response.headers['set-cookie'];
  if (!header) return [];
  return Array.isArray(header) ? header.map(String) : [String(header)];
}

function sessionCookie(response: { headers: Record<string, unknown> }): string {
  return setCookies(response).find((cookie) => cookie.startsWith(`${SESSION_COOKIE}=`)) ?? '';
}

/** The cookies of a response, as a browser sends them back. */
function cookieHeader(response: { headers: Record<string, unknown> }): string {
  return setCookies(response)
    .map((cookie) => cookie.split(';')[0])
    .join('; ');
}

/** The CSRF token the browser echoes in the header of a request that writes. */
function csrfToken(response: { headers: Record<string, unknown> }): string {
  const cookie = setCookies(response).find((entry) => entry.startsWith(`${CSRF_COOKIE}=`));
  return cookie ? cookie.split(';')[0]!.split('=')[1]! : '';
}

function isSecure(cookie: string): boolean {
  return /(^|;\s*)Secure(\s*;|$)/.test(cookie);
}

interface LoginOptions {
  remoteAddress?: string;
  headers?: Record<string, string>;
}

/** Signs a customer in, the way a browser does. */
async function login(options: LoginOptions = {}) {
  return app.inject({
    method: 'POST',
    url: '/api/auth/login',
    payload: { email: EMAIL, password: VALID_PASSWORD },
    ...(options.remoteAddress ? { remoteAddress: options.remoteAddress } : {}),
    headers: options.headers ?? {},
  });
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
});

describe('the Secure attribute of the session cookie', () => {
  it('is set when the request comes in over HTTPS', async () => {
    // The proxy of the default setting is the loopback address.
    expect(env.trustProxies).toContain(TRUSTED_PROXY);
    setCookieSecure(undefined);
    await registerAndLogin(app, EMAIL);

    const response = await login({
      remoteAddress: TRUSTED_PROXY,
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(response.statusCode).toBe(200);
    expect(isSecure(sessionCookie(response))).toBe(true);
  });

  it('is left out when the request comes in over plain HTTP', async () => {
    setCookieSecure(undefined);
    await registerAndLogin(app, EMAIL);

    const response = await login();

    expect(response.statusCode).toBe(200);
    expect(sessionCookie(response)).not.toBe('');
    expect(isSecure(sessionCookie(response))).toBe(false);
  });

  it('is not given to a client that forges the forwarded protocol', async () => {
    setCookieSecure(undefined);
    await registerAndLogin(app, EMAIL);

    const response = await login({
      remoteAddress: UNTRUSTED_CLIENT,
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(response.statusCode).toBe(200);
    expect(isSecure(sessionCookie(response))).toBe(false);
  });

  it('is forced on when the operator asks for it', async () => {
    setCookieSecure('true');
    await registerAndLogin(app, EMAIL);

    const response = await login();

    expect(response.statusCode).toBe(200);
    expect(isSecure(sessionCookie(response))).toBe(true);
  });

  it('is forced off when the operator asks for it', async () => {
    setCookieSecure('false');
    await registerAndLogin(app, EMAIL);

    const response = await login({
      remoteAddress: TRUSTED_PROXY,
      headers: { 'x-forwarded-proto': 'https' },
    });

    expect(response.statusCode).toBe(200);
    expect(isSecure(sessionCookie(response))).toBe(false);
  });
});

describe('the end of a session', () => {
  it('clears the cookie with the path it was set with', async () => {
    setCookieSecure(undefined);
    await registerAndLogin(app, EMAIL);

    const signedIn = await login();

    const response = await app.inject({
      method: 'POST',
      url: '/api/auth/logout',
      headers: {
        cookie: cookieHeader(signedIn),
        'x-csrf-token': csrfToken(signedIn),
      },
    });

    expect(response.statusCode).toBe(204);
    const cleared = sessionCookie(response);
    expect(cleared).not.toBe('');
    expect(cleared).toContain('Path=/');
    expect(cleared).toContain('Max-Age=0');
  });
});

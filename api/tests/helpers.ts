import type { FastifyInstance } from 'fastify';
import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { resetDatabase as clearTables } from './setup.js';

export const VALID_PASSWORD = 'CorrectHorseBattery9';

export interface TestClient {
  cookies: Map<string, string>;
  csrf: string;
  request: (
    method: string,
    url: string,
    payload?: unknown,
    options?: { withCsrf?: boolean },
  ) => Promise<{
    status: number;
    body: any;
    headers: Record<string, unknown>;
  }>;
}

let app: FastifyInstance | null = null;

export async function getApp(): Promise<FastifyInstance> {
  if (!app) app = await buildApp();
  return app;
}

/**
 * Clears the database and the in-memory rate limit counters, so one test file
 * cannot throttle the next one.
 */
export async function resetDatabase(): Promise<void> {
  await clearTables();
  if (app?.rateLimit?.resetKey) app.rateLimit.resetKey();
}

export async function closeApp(): Promise<void> {
  if (app) {
    await app.close();
    app = null;
  }
}

/** A client that keeps cookies and echoes the CSRF token, like a browser. */
export function makeClient(instance: FastifyInstance): TestClient {
  const cookies = new Map<string, string>();
  const client: TestClient = {
    cookies,
    csrf: '',
    async request(method: string, url: string, payload?: unknown, options?: { withCsrf?: boolean }) {
      const upper = method.toUpperCase();
      const mutating = !['GET', 'HEAD', 'OPTIONS'].includes(upper);
      const withCsrf = options?.withCsrf ?? true;

      // A browser loads the page before it posts, which is where the CSRF
      // cookie comes from. The client does the same.
      if (mutating && withCsrf && !client.csrf) {
        const bootstrap = await instance.inject({ method: 'GET', url: '/api/health' });
        for (const cookie of bootstrap.cookies ?? []) {
          cookies.set(cookie.name, cookie.value);
          if (cookie.name === 'bm_csrf') client.csrf = cookie.value;
        }
      }

      const headers: Record<string, string> = {};
      if (cookies.size) headers.cookie = [...cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');
      if (mutating && withCsrf && client.csrf) {
        headers['x-csrf-token'] = client.csrf;
      }

      const response = await instance.inject({ method: method as never, url, payload: payload as never, headers });

      for (const cookie of response.cookies ?? []) {
        cookies.set(cookie.name, cookie.value);
        if (cookie.name === 'bm_csrf') client.csrf = cookie.value;
      }

      let body: unknown = undefined;
      const text = response.body;
      if (text) {
        try {
          body = JSON.parse(text);
        } catch {
          body = text;
        }
      }

      return { status: response.statusCode, body, headers: response.headers as never };
    },
  };
  return client;
}

export async function registerAndLogin(
  instance: FastifyInstance,
  email: string,
  password = VALID_PASSWORD,
): Promise<{ client: TestClient; userId: string }> {
  const client = makeClient(instance);
  const response = await client.request('POST', '/api/auth/register', { email, password });
  if (response.status !== 201) {
    throw new Error(`Could not register ${email}: ${response.status} ${JSON.stringify(response.body)}`);
  }
  return { client, userId: response.body.user.id as string };
}

export async function createAdmin(
  instance: FastifyInstance,
  email = 'admin@blipmade.test',
  password = VALID_PASSWORD,
): Promise<{ client: TestClient; userId: string }> {
  const { hashPassword } = await import('../src/lib/password.js');
  const user = await prisma.user.create({
    data: { email, passwordHash: await hashPassword(password), role: 'ADMIN', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: user.id, permissions: [] } });

  const client = makeClient(instance);
  const response = await client.request('POST', '/api/auth/login', { email, password });
  if (response.status !== 200) {
    throw new Error(`Could not log the administrator in: ${response.status}`);
  }
  return { client, userId: user.id };
}


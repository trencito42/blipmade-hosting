import { afterAll, beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeApp, getApp, makeClient, registerAndLogin, resetDatabase, VALID_PASSWORD } from './helpers.js';
import type { FastifyInstance } from 'fastify';

let app: FastifyInstance;

beforeAll(async () => {
  app = await getApp();
});

afterAll(async () => {
  await closeApp();
});

beforeEach(async () => {
  await resetDatabase();
});

describe('registration', () => {
  it('creates an account and signs the customer in', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/register', {
      email: 'New.User@example.com',
      password: VALID_PASSWORD,
      name: 'New User',
    });

    expect(response.status).toBe(201);
    expect(response.body.user.email).toBe('new.user@example.com');
    expect(response.body.user.role).toBe('CUSTOMER');
    expect(response.body.user.passwordHash).toBeUndefined();

    const session = await client.request('GET', '/api/auth/session');
    expect(session.status).toBe(200);
    expect(session.body.user.email).toBe('new.user@example.com');
  });

  it('refuses a duplicate email address', async () => {
    const first = makeClient(app);
    await first.request('POST', '/api/auth/register', { email: 'dupe@example.com', password: VALID_PASSWORD });
    const second = makeClient(app);
    const response = await second.request('POST', '/api/auth/register', { email: 'dupe@example.com', password: VALID_PASSWORD });
    expect(response.status).toBe(409);
  });

  it('rejects a weak password with a field error', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/register', { email: 'weak@example.com', password: 'short' });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.password).toBeTruthy();
  });
});

describe('login', () => {
  beforeEach(async () => {
    const { client } = await registerAndLogin(app, 'customer@example.com');
    expect(client.cookies.get('bm_session')).toBeTruthy();
  });

  it('rejects a wrong password', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/login', { email: 'customer@example.com', password: 'WrongPassword123' });
    expect(response.status).toBe(401);
    expect(response.body.error.code).toBe('unauthorized');
  });

  it('rejects an unknown account with the same message', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/login', { email: 'nobody@example.com', password: VALID_PASSWORD });
    expect(response.status).toBe(401);
    expect(response.body.error.message).toBe('Email or password is not correct.');
  });

  it('issues a new session for a valid login', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/login', { email: 'customer@example.com', password: VALID_PASSWORD });
    expect(response.status).toBe(200);
    expect(client.cookies.get('bm_session')).toBeTruthy();
  });
});

describe('sessions', () => {
  it('persists a session across requests', async () => {
    const { client } = await registerAndLogin(app, 'persist@example.com');
    const first = await client.request('GET', '/api/auth/session');
    const second = await client.request('GET', '/api/auth/session');
    expect(first.body.user.email).toBe('persist@example.com');
    expect(second.body.user.email).toBe('persist@example.com');
  });

  it('destroys the session on logout', async () => {
    const { client } = await registerAndLogin(app, 'logout@example.com');
    const response = await client.request('POST', '/api/auth/logout');
    expect(response.status).toBe(204);

    const session = await client.request('GET', '/api/auth/session');
    expect(session.body.user).toBeNull();
  });

  it('rejects an expired session', async () => {
    const { client } = await registerAndLogin(app, 'expired@example.com');
    await prisma.session.updateMany({
      where: { user: { email: 'expired@example.com' } },
      data: { expiresAt: new Date(Date.now() - 1000) },
    });

    const session = await client.request('GET', '/api/auth/session');
    expect(session.body.user).toBeNull();

    const instances = await client.request('GET', '/api/instances');
    expect(instances.status).toBe(401);
  });

  it('rejects a session whose record was deleted', async () => {
    const { client } = await registerAndLogin(app, 'revoked@example.com');
    await prisma.session.deleteMany({ where: { user: { email: 'revoked@example.com' } } });
    const session = await client.request('GET', '/api/auth/session');
    expect(session.body.user).toBeNull();
  });
});

describe('CSRF protection', () => {
  it('rejects a state change without the CSRF header', async () => {
    const { client } = await registerAndLogin(app, 'csrf@example.com');
    // A client that holds the session cookie but sends no CSRF header.
    const bare = makeClient(app);
    bare.cookies.set('bm_session', client.cookies.get('bm_session')!);
    bare.cookies.set('bm_csrf', client.cookies.get('bm_csrf')!);

    const response = await bare.request('POST', '/api/tickets', { subject: 'Hello', body: 'Body' }, { withCsrf: false });
    expect(response.status).toBe(403);
    expect(response.body.error.code).toBe('forbidden');
  });

  it('accepts a state change with a matching CSRF header', async () => {
    const { client } = await registerAndLogin(app, 'csrf-ok@example.com');
    const response = await client.request('POST', '/api/tickets', { subject: 'Hello there', body: 'Body' });
    expect(response.status).toBe(201);
  });
});

describe('password reset', () => {
  it('answers the same way for a known and an unknown address', async () => {
    const client = makeClient(app);
    const known = await client.request('POST', '/api/auth/forgot-password', { email: 'known@example.com' });
    const unknown = await client.request('POST', '/api/auth/forgot-password', { email: 'unknown@example.com' });
    expect(known.status).toBe(204);
    expect(unknown.status).toBe(204);
  });

  it('rejects an invalid reset token', async () => {
    const client = makeClient(app);
    const response = await client.request('POST', '/api/auth/reset-password', {
      token: 'not-a-real-token-value',
      password: VALID_PASSWORD,
    });
    expect(response.status).toBe(400);
  });
});

describe('rate limiting', () => {
  it('limits repeated failed logins', async () => {
    const client = makeClient(app);
    let limited = false;
    for (let attempt = 0; attempt < 20; attempt++) {
      const response = await client.request('POST', '/api/auth/login', {
        email: 'flood@example.com',
        password: 'WrongPassword123',
      });
      if (response.status === 429) {
        limited = true;
        break;
      }
    }
    expect(limited).toBe(true);
  });
});

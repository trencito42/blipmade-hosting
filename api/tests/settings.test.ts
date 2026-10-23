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

describe('the profile of an account', () => {
  it('shows the values the server knows', async () => {
    const { client } = await registerAndLogin(app, 'profile@example.com');

    const response = await client.request('GET', '/api/settings');
    expect(response.status).toBe(200);
    expect(response.body.profile.email).toBe('profile@example.com');
    expect(response.body.profile.firstName).toBe('Test');
    expect(response.body.profile.lastName).toBe('Customer');
    expect(response.body.sessions.length).toBe(1);
    expect(response.body.sessions[0].current).toBe(true);
    expect(response.body.preferences.billing).toBe(true);
  });

  it('changes the name of the customer', async () => {
    const { client, userId } = await registerAndLogin(app, 'rename@example.com');

    const response = await client.request('PATCH', '/api/settings/profile', {
      firstName: 'Ada',
      lastName: 'Lovelace',
    });
    expect(response.status).toBe(200);

    const account = await prisma.user.findUnique({ where: { id: userId } });
    expect(account?.firstName).toBe('Ada');
    expect(account?.lastName).toBe('Lovelace');
  });

  it('refuses an empty name and says which field is wrong', async () => {
    const { client } = await registerAndLogin(app, 'empty-name@example.com');

    const response = await client.request('PATCH', '/api/settings/profile', { firstName: '  ', lastName: 'Ok' });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.firstName).toBeDefined();
  });
});

describe('a change of the email address', () => {
  it('keeps the address until the new one has answered', async () => {
    const { client, userId } = await registerAndLogin(app, 'change@example.com');

    const response = await client.request('POST', '/api/settings/email', { email: 'new@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.pendingEmail).toBe('new@example.com');

    // The address of the account did not change yet.
    const account = await prisma.user.findUnique({ where: { id: userId } });
    expect(account?.email).toBe('change@example.com');

    const pending = await prisma.emailChangeRequest.findFirst({ where: { userId } });
    expect(pending).not.toBeNull();
    expect(pending?.email).toBe('new@example.com');
    // The token itself is never stored.
    expect(pending?.tokenHash).not.toContain('token');
  });

  it('refuses the address of the account and the address of another account', async () => {
    const { client } = await registerAndLogin(app, 'mine@example.com');
    await registerAndLogin(app, 'other@example.com');

    const same = await client.request('POST', '/api/settings/email', { email: 'mine@example.com' });
    expect(same.status).toBe(400);

    const taken = await client.request('POST', '/api/settings/email', { email: 'other@example.com' });
    expect(taken.status).toBe(409);
  });

  it('does not claim that a message was sent when the relay is not configured', async () => {
    const { client } = await registerAndLogin(app, 'norelay@example.com');

    const response = await client.request('POST', '/api/settings/email', { email: 'new@example.com' });
    expect(response.status).toBe(200);
    expect(response.body.delivered).toBe(false);
    expect(response.body.delivery).not.toBe('delivered');
    expect(String(response.body.message).toLowerCase()).not.toContain('is on its way');
  });
});

describe('a change of the password', () => {
  it('needs the current password', async () => {
    const { client } = await registerAndLogin(app, 'password@example.com');

    const wrong = await client.request('POST', '/api/settings/password', {
      currentPassword: 'WrongPassword9',
      newPassword: 'AnotherPassword9',
    });
    expect(wrong.status).toBe(400);
    expect(wrong.body.error.fields.currentPassword).toBeDefined();
  });

  it('refuses a password that is too weak', async () => {
    const { client } = await registerAndLogin(app, 'weak@example.com');

    const response = await client.request('POST', '/api/settings/password', {
      currentPassword: VALID_PASSWORD,
      newPassword: 'short',
    });
    expect(response.status).toBe(400);
    expect(response.body.error.fields.newPassword).toBeDefined();
  });

  it('changes the password and closes the other sessions', async () => {
    const { client } = await registerAndLogin(app, 'switch@example.com');
    const second = makeClient(app);
    await second.request('POST', '/api/auth/login', { email: 'switch@example.com', password: VALID_PASSWORD });

    const response = await client.request('POST', '/api/settings/password', {
      currentPassword: VALID_PASSWORD,
      newPassword: 'BrandNewPassword9',
    });
    expect(response.status).toBe(200);
    expect(response.body.changed).toBe(true);
    expect(response.body.closedSessions).toBe(1);

    // The other device is signed out.
    const session = await second.request('GET', '/api/auth/session');
    expect(session.body.user).toBeNull();

    // The device that changed the password stays signed in.
    const own = await client.request('GET', '/api/auth/session');
    expect(own.body.user.email).toBe('switch@example.com');
  });
});

describe('the sessions of an account', () => {
  it('lists the devices and closes one of them', async () => {
    const { client } = await registerAndLogin(app, 'sessions@example.com');
    const second = makeClient(app);
    await second.request('POST', '/api/auth/login', { email: 'sessions@example.com', password: VALID_PASSWORD });

    const list = await client.request('GET', '/api/settings/sessions');
    expect(list.status).toBe(200);
    expect(list.body.sessions.length).toBe(2);
    expect(list.body.sessions.filter((s: { current: boolean }) => s.current).length).toBe(1);

    const other = list.body.sessions.find((s: { current: boolean }) => !s.current);
    const revoked = await client.request('DELETE', `/api/settings/sessions/${other.id}`);
    expect(revoked.status).toBe(200);
    expect(revoked.body.revoked).toBe(true);
    expect(revoked.body.current).toBe(false);

    const after = await client.request('GET', '/api/settings/sessions');
    expect(after.body.sessions.length).toBe(1);
  });

  it('never closes a session of another account', async () => {
    const { client } = await registerAndLogin(app, 'mine2@example.com');
    const other = await registerAndLogin(app, 'theirs@example.com');

    const list = await other.client.request('GET', '/api/settings/sessions');
    const theirSession = list.body.sessions[0];

    const response = await client.request('DELETE', `/api/settings/sessions/${theirSession.id}`);
    expect(response.status).toBe(404);
  });
});

describe('the preferences of the notifications', () => {
  it('are kept with the account', async () => {
    const { client, userId } = await registerAndLogin(app, 'notify@example.com');

    const response = await client.request('PUT', '/api/settings/notifications', {
      productUpdates: false,
      billing: false,
      support: true,
      incidents: true,
      marketing: true,
    });
    expect(response.status).toBe(200);
    expect(response.body.preferences.productUpdates).toBe(false);
    expect(response.body.preferences.marketing).toBe(true);

    const stored = await prisma.notificationPreference.findUnique({ where: { userId } });
    expect(stored?.billing).toBe(false);

    const read = await client.request('GET', '/api/settings/notifications');
    expect(read.body.preferences.billing).toBe(false);
  });
});

describe('the closing of an account', () => {
  it('is a request and deletes nothing', async () => {
    const { client, userId } = await registerAndLogin(app, 'close@example.com');

    const response = await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });
    expect(response.status).toBe(200);
    expect(response.body.requestedAt).toBeTruthy();

    // The account and everything on it are still there.
    const account = await prisma.user.findUnique({ where: { id: userId } });
    expect(account).not.toBeNull();
    expect(account?.deletionRequestedAt).not.toBeNull();

    const settings = await client.request('GET', '/api/settings');
    expect(settings.body.account.deletionRequestedAt).toBeTruthy();
  });

  it('needs the password and the exact words', async () => {
    const { client } = await registerAndLogin(app, 'close2@example.com');

    const wrongPassword = await client.request('POST', '/api/settings/account/closure', {
      password: 'WrongPassword9',
      confirmation: 'CLOSE MY ACCOUNT',
    });
    expect(wrongPassword.status).toBe(400);

    const wrongWords = await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'close my account',
    });
    expect(wrongWords.status).toBe(400);
    expect(wrongWords.body.error.fields.confirmation).toBeDefined();
  });

  it('can be taken back', async () => {
    const { client, userId } = await registerAndLogin(app, 'close3@example.com');
    await client.request('POST', '/api/settings/account/closure', {
      password: VALID_PASSWORD,
      confirmation: 'CLOSE MY ACCOUNT',
    });

    const response = await client.request('DELETE', '/api/settings/account/closure');
    expect(response.status).toBe(200);
    expect(response.body.requestedAt).toBeNull();

    const account = await prisma.user.findUnique({ where: { id: userId } });
    expect(account?.deletionRequestedAt).toBeNull();
  });
});

describe('the settings of a visitor without a session', () => {
  it('are refused', async () => {
    const client = makeClient(app);
    const response = await client.request('GET', '/api/settings');
    expect(response.status).toBe(401);
  });
});

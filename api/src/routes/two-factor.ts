import type { FastifyInstance, FastifyReply, FastifyRequest } from 'fastify';
import { z } from 'zod';
import QRCode from 'qrcode';
import {
  generateAuthenticationOptions,
  generateRegistrationOptions,
  verifyAuthenticationResponse,
  verifyRegistrationResponse,
} from '@simplewebauthn/server';
import type { AuthenticationResponseJSON, RegistrationResponseJSON } from '@simplewebauthn/server';
import { prisma } from '../db.js';
import { pageOf, pageOrder, parsePagination, withCursor } from '../lib/perf-data-pagination.js';
import { badRequest, notFound, unauthorized } from '../lib/errors.js';
import { audit } from '../lib/audit.js';
import { verifyPassword } from '../lib/password.js';
import { suspendedAccountError } from '../lib/suspension.js';
import { hashToken, randomToken } from '../lib/tokens.js';
import { LIMITS, customerLimit } from '../lib/rate-limit.js';
import { addressRateLimitKey, createSession, requireAuth } from '../plugins/auth.js';
import { decryptSecret, encryptSecret } from '../lib/secrets.js';
import { hashBackupCode, looksLikeBackupCode, newBackupCodes, newSecret, otpauthUri, verifyTotp } from '../lib/two-factor.js';
import { endSecondStep, rpID, rpOrigin, saveChallenge, takeChallenge, takeTry } from '../services/second-factor.js';
import { publicUser } from './auth.js';
import { recordSignIn } from '../services/account-security.js';
import { notifyAccountSecurity } from '../services/notifications.js';
import { fullName } from '../lib/people.js';

/**
 * Two-factor authentication and passkeys.
 *
 * Two-factor is an authenticator app: a secret kept encrypted, a code of six digits, and ten
 * backup codes shown once. When it is on, a sign-in with the password stops at a second step
 * (the code, a backup code or a passkey). A passkey is also a way to sign in on its own: it
 * proves the device and, with the biometric or the PIN, the person, so it needs no password.
 */
const stepLimit = { rateLimit: { max: 20, timeWindow: '15 minutes', keyGenerator: addressRateLimitKey } };

const responseSchema = z.record(z.string(), z.unknown());

async function finishSignIn(request: FastifyRequest, reply: FastifyReply, userId: string, via: string) {
  const user = await prisma.user.findUnique({ where: { id: userId }, include: { staff: true } });
  if (!user) throw unauthorized('That sign-in is not valid.');
  if (user.suspendedAt) throw suspendedAccountError();
  await createSession(request, reply, user.id, user.email);
  await recordSignIn(request, user, via);
  return { user: { ...publicUser(user), permissions: user.staff?.permissions ?? [] } };
}

/** Checks a TOTP code or a backup code for an account. Returns true and spends what was used. */
async function checkSecondFactorCode(userId: string, raw: string): Promise<boolean> {
  const row = await prisma.userTwoFactor.findUnique({ where: { userId } });
  if (!row?.enabledAt) return false;
  const code = raw.trim();
  if (/^\s*\d[\d\s]{5,}$/.test(code)) {
    const secret = decryptSecret(row.secretEnc);
    if (!secret) return false;
    const step = verifyTotp(secret, code, row.lastUsedStep);
    if (step === null) return false;
    await prisma.userTwoFactor.update({ where: { userId }, data: { lastUsedStep: step } });
    return true;
  }
  if (looksLikeBackupCode(code)) {
    const hash = hashBackupCode(code);
    if (!row.backupCodes.includes(hash)) return false;
    await prisma.userTwoFactor.update({ where: { userId }, data: { backupCodes: row.backupCodes.filter((entry) => entry !== hash) } });
    return true;
  }
  return false;
}

/** What the log of the security of an account says for each action, in words. */
const ACTIVITY_TEXT: Record<string, string> = {
  'auth.login': 'Signed in',
  'auth.logout': 'Signed out',
  'auth.2fa_failed': 'A wrong two-step code was entered',
  'auth.passkey_failed': 'A passkey sign-in failed',
  'auth.password_reset': 'The password was reset with an e-mail link',
  'auth.reset_requested': 'A password reset link was asked for',
  'auth.email_verified': 'The e-mail address was confirmed',
  'settings.password_changed': 'The password was changed',
  'settings.email_change_requested': 'A change of the e-mail address was asked for',
  'settings.email_changed': 'The e-mail address was changed',
  'settings.2fa_enabled': 'Two-factor authentication was turned on',
  'settings.2fa_disabled': 'Two-factor authentication was turned off',
  'settings.2fa_backup_codes_renewed': 'New backup codes were made',
  'settings.passkey_added': 'A passkey was added',
  'settings.passkey_removed': 'A passkey was removed',
  'settings.api_key_created': 'An API key was made',
  'settings.api_key_revoked': 'An API key was revoked',
  'settings.session_revoked': 'A session was closed',
  'settings.sessions_closed': 'The other sessions were closed',
  'settings.account_closure_requested': 'The closing of the account was asked for',
  'staff.impersonation_started': 'Our team opened the account to help',
  'admin.customer.reset_2fa': 'Our team reset two-factor authentication',
};

export async function registerTwoFactorRoutes(app: FastifyInstance): Promise<void> {
  // --- the second step of a sign-in ------------------------------------------------

  app.post('/auth/login/2fa', { config: stepLimit }, async (request, reply) => {
    const body = z.object({ token: z.string().min(10).max(200), code: z.string().min(6).max(32) }).parse(request.body ?? {});
    const userId = await takeTry(body.token);
    if (!userId) throw unauthorized('This sign-in expired or was tried too many times. Sign in again.');
    if (!(await checkSecondFactorCode(userId, body.code))) {
      await audit({ actorId: userId, action: 'auth.2fa_failed', ip: request.ip });
      throw unauthorized('That code is not correct.');
    }
    await endSecondStep(body.token);
    return finishSignIn(request, reply, userId, '2fa');
  });

  app.post('/auth/login/2fa/passkey/options', { config: stepLimit }, async (request) => {
    const body = z.object({ token: z.string().min(10).max(200) }).parse(request.body ?? {});
    const userId = await takeTry(body.token);
    if (!userId) throw unauthorized('This sign-in expired. Sign in again.');
    const keys = await prisma.passkey.findMany({ where: { userId } });
    if (keys.length === 0) throw badRequest('This account has no passkey.');
    const options = await generateAuthenticationOptions({
      rpID: rpID(),
      userVerification: 'required',
      allowCredentials: keys.map((key) => ({ id: key.credentialId, transports: key.transports })),
    });
    await saveChallenge(`2fa:${hashToken(body.token)}`, { challenge: options.challenge, userId });
    return { options };
  });

  app.post('/auth/login/2fa/passkey/verify', { config: stepLimit }, async (request, reply) => {
    const body = z.object({ token: z.string().min(10).max(200), response: responseSchema }).parse(request.body ?? {});
    const saved = await takeChallenge(`2fa:${hashToken(body.token)}`);
    if (!saved?.userId) throw unauthorized('This sign-in expired. Sign in again.');
    await verifyPasskeyAnswer(body.response as unknown as AuthenticationResponseJSON, saved.challenge, saved.userId);
    await endSecondStep(body.token);
    return finishSignIn(request, reply, saved.userId, 'passkey-2fa');
  });

  // --- sign in with a passkey alone ---------------------------------------------------

  app.post('/auth/passkey/options', { config: stepLimit }, async () => {
    const options = await generateAuthenticationOptions({ rpID: rpID(), userVerification: 'required', timeout: 30 * 60 * 1000 });
    const challengeId = randomToken(16);
    // The prompt in the field of the address waits as long as the page is open, so this challenge lives longer.
    await saveChallenge(`auth:${challengeId}`, { challenge: options.challenge }, 30 * 60);
    return { challengeId, options };
  });

  app.post('/auth/passkey/verify', { config: stepLimit }, async (request, reply) => {
    const body = z.object({ challengeId: z.string().min(10).max(100), response: responseSchema }).parse(request.body ?? {});
    const saved = await takeChallenge(`auth:${body.challengeId}`);
    if (!saved) throw unauthorized('This sign-in expired. Try again.');
    const answer = body.response as unknown as AuthenticationResponseJSON;
    const key = await prisma.passkey.findUnique({ where: { credentialId: String(answer.id ?? '') } });
    if (!key) throw unauthorized('That passkey is not known on this platform.');
    await verifyPasskeyAnswer(answer, saved.challenge, key.userId);
    return finishSignIn(request, reply, key.userId, 'passkey');
  });

  /** Verifies the answer of a passkey for an account, and records the use. */
  async function verifyPasskeyAnswer(answer: AuthenticationResponseJSON, challenge: string, userId: string): Promise<void> {
    const key = await prisma.passkey.findUnique({ where: { credentialId: String(answer.id ?? '') } });
    if (!key || key.userId !== userId) throw unauthorized('That passkey does not belong to this account.');
    try {
      const result = await verifyAuthenticationResponse({
        response: answer,
        expectedChallenge: challenge,
        expectedOrigin: rpOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: true,
        credential: { id: key.credentialId, publicKey: new Uint8Array(key.publicKey), counter: key.counter, transports: key.transports },
      });
      if (!result.verified) throw new Error('not verified');
      await prisma.passkey.update({ where: { id: key.id }, data: { counter: result.authenticationInfo.newCounter, lastUsedAt: new Date() } });
    } catch {
      await audit({ actorId: userId, action: 'auth.passkey_failed', ip: undefined });
      throw unauthorized('The passkey could not be verified.');
    }
  }

  // --- settings: the state ---------------------------------------------------------------

  app.get('/settings/security', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const [two, keys] = await Promise.all([
      prisma.userTwoFactor.findUnique({ where: { userId: user.id } }),
      prisma.passkey.findMany({ where: { userId: user.id }, orderBy: { createdAt: 'asc' } }),
    ]);
    return {
      twoFactor: { enabled: Boolean(two?.enabledAt), enabledAt: two?.enabledAt ?? null, backupCodesLeft: two?.enabledAt ? two.backupCodes.length : 0 },
      passkeys: keys.map((key) => ({
        id: key.id,
        name: key.name,
        createdAt: key.createdAt,
        lastUsedAt: key.lastUsedAt,
        deviceType: key.deviceType,
        backedUp: key.backedUp,
      })),
    };
  });

  /**
   * The log of the security of the account, newest first, in pages: sign-ins and the device
   * they came from, changes of the password, the address, two-factor and passkeys, and what our
   * team did on the account. It is the account's own history, so the person can spot a change
   * they did not make.
   */
  app.get('/settings/security/activity', async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { limit, cursor } = parsePagination(request.query, { defaultSize: 30, maxSize: 100 });
    const actions = Object.keys(ACTIVITY_TEXT);
    const rows = await prisma.auditLog.findMany({
      where: withCursor(
        { action: { in: actions }, OR: [{ actorId: user.id }, { targetType: 'user', targetId: user.id }] },
        cursor,
        'createdAt',
      ),
      orderBy: pageOrder('createdAt'),
      take: limit + 1,
    });
    const page = pageOf(rows, limit, 'createdAt');
    return {
      activity: page.rows.map((row) => {
        const meta = (row.meta ?? {}) as { device?: string; via?: string; passkey?: string };
        const byStaff = row.actorId !== user.id;
        return {
          id: row.id,
          action: row.action,
          text: ACTIVITY_TEXT[row.action] ?? row.action,
          detail: [meta.passkey, meta.device, meta.via && meta.via !== 'password' ? `with ${meta.via.replace('-2fa', ' as the second step').replace('passkey', 'a passkey')}` : null].filter(Boolean).join(' · ') || null,
          ip: row.ip,
          byStaff,
          createdAt: row.createdAt,
        };
      }),
      pagination: page.pagination,
    };
  });

  // --- settings: the authenticator app ----------------------------------------------------

  const accountWrite = {
    config: { rateLimit: { max: LIMITS.accountWrite.address, timeWindow: LIMITS.accountWrite.window, keyGenerator: addressRateLimitKey } },
    preHandler: customerLimit(app, LIMITS.accountWrite),
  };

  app.post('/settings/2fa/setup', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const current = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } });
    if (current?.enabledAt) throw badRequest('Two-factor authentication is already on.');
    const secret = newSecret();
    const data = { secretEnc: encryptSecret(secret), enabledAt: null, lastUsedStep: null, backupCodes: [] as string[] };
    await prisma.userTwoFactor.upsert({ where: { userId: user.id }, update: data, create: { userId: user.id, ...data } });
    const uri = otpauthUri(secret, user.email);
    return { secret, uri, qrSvg: await QRCode.toString(uri, { type: 'svg', margin: 1, errorCorrectionLevel: 'M' }) };
  });

  app.post('/settings/2fa/enable', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { code } = z.object({ code: z.string().min(6).max(12) }).parse(request.body ?? {});
    const row = await prisma.userTwoFactor.findUnique({ where: { userId: user.id } });
    if (!row || row.enabledAt) throw badRequest('Start the setup first.');
    const secret = decryptSecret(row.secretEnc);
    const step = secret ? verifyTotp(secret, code, null) : null;
    if (step === null) throw badRequest('That code is not correct. Check the clock of your phone and try the next code.', { code: 'That code is not correct.' });
    const codes = newBackupCodes();
    await prisma.userTwoFactor.update({
      where: { userId: user.id },
      data: { enabledAt: new Date(), lastUsedStep: step, backupCodes: codes.map(hashBackupCode) },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.2fa_enabled', targetType: 'user', targetId: user.id, ip: request.ip });
    await notifyAccountSecurity('account.two_factor_enabled', { userId: user.id, name: user.name || null });
    return { enabled: true, backupCodes: codes };
  });

  app.post('/settings/2fa/disable', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { password, code } = z.object({ password: z.string().min(1).max(200), code: z.string().min(6).max(32) }).parse(request.body ?? {});
    const full = await prisma.user.findUnique({ where: { id: user.id } });
    if (!full || !(await verifyPassword(password, full.passwordHash))) throw badRequest('The password is not correct.', { password: 'The password is not correct.' });
    if (!(await checkSecondFactorCode(user.id, code))) throw badRequest('That code is not correct.', { code: 'That code is not correct.' });
    await prisma.userTwoFactor.delete({ where: { userId: user.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.2fa_disabled', targetType: 'user', targetId: user.id, ip: request.ip });
    await notifyAccountSecurity('account.two_factor_disabled', { userId: user.id, name: user.name || null });
    return { enabled: false };
  });

  app.post('/settings/2fa/backup-codes', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { code } = z.object({ code: z.string().min(6).max(32) }).parse(request.body ?? {});
    if (!(await checkSecondFactorCode(user.id, code))) throw badRequest('That code is not correct.', { code: 'That code is not correct.' });
    const codes = newBackupCodes();
    await prisma.userTwoFactor.update({ where: { userId: user.id }, data: { backupCodes: codes.map(hashBackupCode) } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.2fa_backup_codes_renewed', targetType: 'user', targetId: user.id, ip: request.ip });
    await notifyAccountSecurity('account.backup_codes_renewed', { userId: user.id, name: user.name || null });
    return { backupCodes: codes };
  });

  // --- settings: passkeys -----------------------------------------------------------------

  app.post('/settings/passkeys/options', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const keys = await prisma.passkey.findMany({ where: { userId: user.id } });
    if (keys.length >= 10) throw badRequest('An account can keep 10 passkeys. Remove one to add another.');
    const options = await generateRegistrationOptions({
      rpName: 'Blipmade',
      rpID: rpID(),
      userName: user.email,
      userDisplayName: user.name || user.email,
      userID: new TextEncoder().encode(user.id),
      attestationType: 'none',
      excludeCredentials: keys.map((key) => ({ id: key.credentialId, transports: key.transports })),
      // A discoverable credential, so the passkey can sign in without typing the address.
      authenticatorSelection: { residentKey: 'required', userVerification: 'preferred' },
    });
    await saveChallenge(`reg:${user.id}`, { challenge: options.challenge, userId: user.id });
    return { options };
  });

  app.post('/settings/passkeys', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const body = z.object({ response: responseSchema, name: z.string().trim().max(60).optional() }).parse(request.body ?? {});
    const saved = await takeChallenge(`reg:${user.id}`);
    if (!saved) throw badRequest('The request expired. Start again.');
    let verified;
    try {
      verified = await verifyRegistrationResponse({
        response: body.response as unknown as RegistrationResponseJSON,
        expectedChallenge: saved.challenge,
        expectedOrigin: rpOrigin(),
        expectedRPID: rpID(),
        requireUserVerification: false,
      });
    } catch {
      throw badRequest('The passkey could not be verified.');
    }
    if (!verified.verified) throw badRequest('The passkey could not be verified.');
    const credential = verified.registrationInfo.credential;
    const existing = await prisma.passkey.count({ where: { userId: user.id } });
    const key = await prisma.passkey.create({
      data: {
        userId: user.id,
        credentialId: credential.id,
        publicKey: Buffer.from(credential.publicKey),
        counter: credential.counter,
        transports: credential.transports ?? [],
        deviceType: verified.registrationInfo.credentialDeviceType,
        backedUp: verified.registrationInfo.credentialBackedUp,
        name: body.name || `Passkey ${existing + 1}`,
      },
    });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.passkey_added', targetType: 'user', targetId: user.id, meta: { passkey: key.name }, ip: request.ip });
    await notifyAccountSecurity('account.passkey_added', { userId: user.id, name: user.name || null, passkey: key.name });
    return { passkey: { id: key.id, name: key.name } };
  });

  app.patch('/settings/passkeys/:id', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const { name } = z.object({ name: z.string().trim().min(1).max(60) }).parse(request.body ?? {});
    const done = await prisma.passkey.updateMany({ where: { id, userId: user.id }, data: { name } });
    if (done.count === 0) throw notFound('That passkey was not found.');
    return { ok: true };
  });

  app.delete('/settings/passkeys/:id', accountWrite, async (request: FastifyRequest) => {
    const user = await requireAuth(request);
    const { id } = z.object({ id: z.string() }).parse(request.params);
    const key = await prisma.passkey.findFirst({ where: { id, userId: user.id } });
    if (!key) throw notFound('That passkey was not found.');
    await prisma.passkey.delete({ where: { id: key.id } });
    await audit({ actorId: user.id, actorEmail: user.email, action: 'settings.passkey_removed', targetType: 'user', targetId: user.id, meta: { passkey: key.name }, ip: request.ip });
    await notifyAccountSecurity('account.passkey_removed', { userId: user.id, name: user.name || null, passkey: key.name });
    return { ok: true };
  });
}

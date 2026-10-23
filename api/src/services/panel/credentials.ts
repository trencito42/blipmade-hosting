import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { unavailable } from '../../lib/errors.js';
import { decryptSecret, encryptSecret } from '../../lib/secrets.js';
import { externalIdFor } from './identity.js';

/**
 * The client credential of a customer on the panel.
 *
 * The panel issues one client key per customer. The key is scoped to the panel
 * account of that customer, so it can only reach the servers of that customer,
 * and it is stored encrypted on this server. It never reaches the browser.
 *
 * The panel cannot create a key by itself: no route of the panel API issues
 * one. The key therefore comes from the bridge that the panel carries (see
 * docs/PANEL_BRIDGE.md) or from an operator that hands it over. Both ways
 * end in the same place: one encrypted key per customer in the database.
 */

/**
 * A client key of the panel always starts with this.
 *
 * Pterodactyl names the identifier of a key after its kind: "ptlc_" for the
 * client API and "ptla_" for the application API.
 */
const CLIENT_KEY_PREFIX = 'ptlc_';

/** True when a string looks like a client key of the panel. */
export function isClientKey(value: string | null | undefined): boolean {
  // The identifier of the panel is sixteen characters and the secret is
  // thirty-two, so a real key of a customer is forty-eight characters long.
  return typeof value === 'string' && value.startsWith(CLIENT_KEY_PREFIX) && value.length >= 40;
}

export interface CustomerCredential {
  token: string;
  panelUserId: number;
  externalId: string;
  source: string;
}

/**
 * The signature of a request to the bridge.
 *
 * The bridge refuses a request that is not signed with the secret that both
 * sides know, that is older than a minute, or that reuses a nonce.
 */
function sign(timestamp: string, nonce: string, externalId: string, secret: string): string {
  return createHmac('sha256', secret).update(`${timestamp}.${nonce}.${externalId}`).digest('hex');
}

async function mintViaBridge(externalId: string): Promise<string> {
  if (!env.panelBridgeEnabled) {
    throw unavailable(
      'The panel cannot issue a client key for this customer yet. The key bridge of the panel is not installed (see docs/PANEL_BRIDGE.md), so no customer operation can run.',
    );
  }

  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomBytes(16).toString('base64url');
  const signature = sign(timestamp, nonce, externalId, env.PANEL_KEYMINT_SECRET);

  let response: Response;
  try {
    response = await fetch(env.PANEL_KEYMINT_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ external_id: externalId, timestamp, nonce, signature }),
      signal: AbortSignal.timeout(15_000),
    });
  } catch {
    throw unavailable('The key bridge of the panel could not be reached.');
  }

  const text = await response.text();
  if (!response.ok) {
    throw unavailable(
      `The panel refused to issue a client key (${response.status}). ${text.slice(0, 200)}`,
    );
  }

  let token: unknown;
  try {
    token = (JSON.parse(text) as { token?: string }).token;
  } catch {
    throw unavailable('The panel answered with something that is not a client key.');
  }
  if (typeof token !== 'string' || !isClientKey(token)) {
    throw unavailable('The panel did not issue a client key.');
  }
  return token;
}

/**
 * The client key of a customer, and the panel account it belongs to.
 *
 * The key is fetched from the database when it is there. When it is not, the
 * bridge is asked for a new one and the answer is stored, so the panel is
 * asked once per customer and not once per request.
 */
export async function resolveCustomerCredential(userId: string): Promise<CustomerCredential> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    select: {
      id: true,
      pterodactylUserId: true,
      pterodactylExternalId: true,
      panelCredential: true,
    },
  });
  if (!user) throw unavailable('The customer account was not found.');

  const externalId = user.pterodactylExternalId ?? externalIdFor(user.id);

  if (user.panelCredential) {
    const token = decryptSecret(user.panelCredential.tokenEnc);
    if (token && isClientKey(token)) {
      await prisma.panelCredential.update({
        where: { userId: user.id },
        data: { lastUsedAt: new Date() },
      });
      return {
        token,
        panelUserId: user.panelCredential.panelUserId,
        externalId: user.panelCredential.externalId,
        source: user.panelCredential.source,
      };
    }
    // The value cannot be read any more, for instance because the session
    // secret was rotated. A new key is asked for.
    await prisma.panelCredential.delete({ where: { userId: user.id } }).catch(() => undefined);
  }

  const token = await mintViaBridge(externalId);
  const panelUserId = Number(user.pterodactylUserId ?? 0);

  await prisma.panelCredential.upsert({
    where: { userId: user.id },
    update: {
      tokenEnc: encryptSecret(token),
      panelUserId,
      externalId,
      source: 'bridge',
      lastUsedAt: new Date(),
    },
    create: {
      userId: user.id,
      tokenEnc: encryptSecret(token),
      panelUserId,
      externalId,
      source: 'bridge',
      lastUsedAt: new Date(),
    },
  });

  return { token, panelUserId, externalId, source: 'bridge' };
}

/**
 * Stores a key that an operator handed over. It is the way in when the
 * bridge of the panel is not installed yet.
 */
export async function storeCustomerCredential(
  userId: string,
  token: string,
  panelUserId: number,
  externalId: string,
  source = 'bootstrap',
): Promise<void> {
  if (!isClientKey(token)) {
    throw unavailable('A client key of the panel starts with "ptlc_".');
  }
  await prisma.panelCredential.upsert({
    where: { userId },
    update: {
      tokenEnc: encryptSecret(token),
      panelUserId,
      externalId,
      source,
      lastUsedAt: null,
    },
    create: {
      userId,
      tokenEnc: encryptSecret(token),
      panelUserId,
      externalId,
      source,
    },
  });
}

/** Forgets the key of a customer. The next operation asks for a new one. */
export async function forgetCustomerCredential(userId: string): Promise<void> {
  await prisma.panelCredential.deleteMany({ where: { userId } });
}

/**
 * Asks for a new key for a customer.
 *
 * A key can stop working while the customer is using it, for instance when it
 * was revoked on the panel. A new key is asked for in that case, so a customer
 * never has to wait for an operator before the next operation works.
 */
export async function renewCustomerCredential(userId: string): Promise<string> {
  await forgetCustomerCredential(userId);
  const credential = await resolveCustomerCredential(userId);
  return credential.token;
}

/**
 * True when a customer already has a key on the panel.
 *
 * This does not mint a key: it only looks at what is stored, so a page that is
 * opened does not create a credential on its own.
 */
export async function hasCustomerCredential(userId: string): Promise<boolean> {
  const stored = await prisma.panelCredential.findUnique({
    where: { userId },
    select: { tokenEnc: true },
  });
  if (!stored) return false;
  const token = decryptSecret(stored.tokenEnc);
  return isClientKey(token);
}

/** Compares two strings without leaking their length through the timing. */
export function safeEqual(a: string, b: string): boolean {
  const left = Buffer.from(a);
  const right = Buffer.from(b);
  if (left.length !== right.length) return false;
  return timingSafeEqual(left, right);
}

import { prisma } from '../../db.js';
import { env } from '../../env.js';
import { conflict, upstream } from '../../lib/errors.js';
import * as ptero from '../pterodactyl/application.js';

/**
 * The identity of a customer on the panel.
 *
 * Blipmade owns the customer. Every customer gets one panel account of their
 * own, and the two identities are linked by an external id that is written
 * once and never changed:
 *
 *     blipmade_acc_<the id of the customer in Blipmade>
 *
 * The external id is the only thing that is used to find the account again.
 * An address is never used for that, because an address can be changed, can
 * be typed by hand and can already exist on the panel for somebody else. A
 * panel account that Blipmade did not create is therefore never taken over,
 * not even when the address matches.
 *
 * The account on the panel carries a reserved address that cannot receive
 * mail. The customer never signs in to the panel, so the address on the panel
 * is not theirs, and a mail from the panel (a password reset, for instance)
 * has nowhere to go.
 */

/** The external id of the panel account of a customer. */
export function externalIdFor(userId: string): string {
  return `blipmade_acc_${userId}`;
}

/** The address the panel account of a customer carries. It cannot receive mail. */
export function panelAddressFor(userId: string, email: string): string {
  const slug = email
    .split('@')[0]!
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 24);
  return `${slug || 'customer'}-${userId.slice(-8).toLowerCase()}@panel.blipmade.invalid`;
}

/** The name of the panel account. The two parts are the ones of the customer. */
export function panelNameFor(user: { firstName: string; lastName: string }): {
  first_name: string;
  last_name: string;
} {
  return {
    first_name: user.firstName.trim().slice(0, 100) || 'Customer',
    last_name: user.lastName.trim().slice(0, 100) || 'Customer',
  };
}

export interface PanelIdentity {
  panelUserId: number;
  externalId: string;
  /** True when the account was created in this call. */
  created: boolean;
}

/**
 * Finds the panel account of a customer, and creates it when it does not
 * exist yet.
 *
 * The lookup is by the external id and by nothing else. When the panel
 * answers with several accounts that carry the same external id, the oldest
 * one is kept and the others are left alone: a customer owns one account.
 */
export async function reconcilePanelIdentity(user: {
  id: string;
  email: string;
  firstName: string;
  lastName: string;
}): Promise<PanelIdentity> {
  if (!env.pterodactylEnabled) {
    throw upstream('Pterodactyl is not configured on this environment.');
  }

  const externalId = externalIdFor(user.id);

  const stored = await prisma.user.findUnique({
    where: { id: user.id },
    select: { pterodactylUserId: true, pterodactylExternalId: true },
  });
  if (stored?.pterodactylUserId) {
    // The account of the customer is known. It is still checked against the
    // panel, so a panel account that was removed is created again.
    const account = await ptero.findUserByExternalId(externalId);
    if (account) {
      await prisma.user.update({
        where: { id: user.id },
        data: { pterodactylExternalId: externalId },
      });
      return { panelUserId: account.id, externalId, created: false };
    }
  }

  const accounts = await ptero.listUsers();
  const matches = accounts
    .filter((account) => account.external_id === externalId)
    .sort((a, b) => a.id - b.id);

  if (matches.length) {
    const account = matches[0]!;
    await prisma.user.update({
      where: { id: user.id },
      data: { pterodactylUserId: String(account.id), pterodactylExternalId: externalId },
    });
    return { panelUserId: account.id, externalId, created: false };
  }

  // The account does not exist yet. The panel wants a password, but the
  // customer never signs in to the panel, so a random one is used and it is
  // not kept: there is nothing to reset and nothing to hand over.
  const password = `bm-${Math.random().toString(36).slice(2)}-${Date.now().toString(36)}`;
  const name = panelNameFor(user);

  let lastError: unknown;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const created = await ptero.createUser({
        email: panelAddressFor(user.id, user.email),
        username: `bm-${user.id.slice(-10).toLowerCase()}`,
        password,
        root_admin: false,
        external_id: externalId,
        first_name: name.first_name,
        last_name: name.last_name,
      });
      await prisma.user.update({
        where: { id: user.id },
        data: { pterodactylUserId: String(created.id), pterodactylExternalId: externalId },
      });
      return { panelUserId: created.id, externalId, created: true };
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      // A race with another run of the worker: the account exists now, so it
      // is used instead of creating a second one.
      if (message.includes('external_id') && message.includes('taken')) {
        const again = await ptero.findUserByExternalId(externalId);
        if (again) {
          await prisma.user.update({
            where: { id: user.id },
            data: { pterodactylUserId: String(again.id), pterodactylExternalId: externalId },
          });
          return { panelUserId: again.id, externalId, created: false };
        }
      }
      lastError = error;
      if (!message.includes('username has already been taken')) throw error;
    }
  }
  throw lastError instanceof Error ? lastError : conflict('The panel account could not be created.');
}

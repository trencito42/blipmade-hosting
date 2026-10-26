import type { PrismaClient } from '@prisma/client';

/**
 * The draft plans of hosted mail.
 *
 * The plans of the mail are DRAFTS. They carry the limits that the platform
 * can really hold and no price at all: the price of the mail is a commercial
 * decision of the operator, and the sale of the mail stays closed until the
 * payment, the mail system, the DNS, the backup and the delivery have been
 * proved from end to end.
 *
 * Two flags keep a draft out of the reach of a customer:
 *
 *   - `deployable: false` is the flag that stops the order. The catalog, the
 *     quote and the order all read it, so a draft cannot be bought.
 *   - `visible: false` keeps the draft out of the public catalog, out of the
 *     shop of the mail and out of the public page of the plan. The back
 *     office of the plans and the back office of the products still show it,
 *     so the operator sees the draft and works on it.
 *
 * The limits that are written here are under the ceiling of the platform (the
 * `MAIL_MAX_*` values of the environment), so a plan never promises more than
 * the mail system can keep. The limits that are really applied are the
 * smaller of the two, so a plan that asks for more is capped instead of
 * broken.
 *
 * A plan that the operator has already taken in hand keeps its price, its
 * state and its limits: the seed never writes over a decision of the
 * operator.
 */

/** A draft plan of hosted mail, as it is written in the catalog. */
export interface MailPlanDraft {
  slug: string;
  name: string;
  description: string;
  icon: string;
  /** How many domains the plan includes. */
  maxDomains: number;
  /** How many mailboxes a domain of the plan may hold. */
  maxMailboxes: number;
  /** How many aliases a domain of the plan may hold. */
  maxAliases: number;
  /** How many forwarding rules a domain of the plan may hold. */
  maxForwarding: number;
  /** How much space the plan includes, in megabytes. */
  totalStorageMb: number;
  /** How much space one mailbox of the plan may hold, in megabytes. */
  mailboxQuotaMb: number;
  /** How many messages may be sent in the window of the interval. */
  sendLimit: number;
  /** The window in which the limit of sending is counted. */
  sendInterval: 'MINUTELY' | 'HOURLY' | 'DAILY';
  sortOrder: number;
}

/**
 * The three drafts of the mail.
 *
 * The ladder is the same in every column: the bigger the plan, the more it
 * holds. The space of a plan is exactly the space of its mailboxes, and
 * every number is under the ceiling of the platform, which is the
 * default of the environment today: three domains, ten mailboxes and a
 * hundred aliases for a domain, a thousand and twenty four megabytes for a
 * mailbox, ten thousand two hundred and forty megabytes for a domain and
 * five hundred messages for an hour.
 *
 * There is no price here. A price that the platform invented would be an
 * offer, and an offer that nobody decided is not an offer.
 */
export const MAIL_PLAN_DRAFTS: MailPlanDraft[] = [
  {
    slug: 'email-hosting-starter',
    name: 'Email Hosting Starter',
    description:
      'Hosted mail for one domain, with the mailboxes and the aliases a small team needs. The plan is not priced yet and it is not for sale.',
    icon: 'mail',
    maxDomains: 1,
    maxMailboxes: 2,
    maxAliases: 20,
    maxForwarding: 3,
    totalStorageMb: 512,
    mailboxQuotaMb: 256,
    sendLimit: 100,
    sendInterval: 'HOURLY',
    sortOrder: 100,
  },
  {
    slug: 'email-hosting-plus',
    name: 'Email Hosting Plus',
    description:
      'Hosted mail for a few domains, with more space and a larger sending limit. The plan is not priced yet and it is not for sale.',
    icon: 'mail',
    maxDomains: 2,
    maxMailboxes: 5,
    maxAliases: 50,
    maxForwarding: 6,
    totalStorageMb: 5120,
    mailboxQuotaMb: 512,
    sendLimit: 250,
    sendInterval: 'HOURLY',
    sortOrder: 101,
  },
  {
    slug: 'email-hosting-business',
    name: 'Email Hosting Business',
    description:
      'Hosted mail for a company: more domains, more space and a sending limit that follows the business. The plan is not priced yet and it is not for sale.',
    icon: 'mail',
    maxDomains: 3,
    maxMailboxes: 10,
    maxAliases: 100,
    maxForwarding: 10,
    totalStorageMb: 30720,
    mailboxQuotaMb: 1024,
    sendLimit: 500,
    sendInterval: 'HOURLY',
    sortOrder: 102,
  },
];

/**
 * The names the drafts had before they were called "Email Hosting".
 *
 * A draft that is still there under an old name is the same plan, so it is
 * renamed instead of being written a second time. A plan that the operator
 * has already put on sale keeps its address: a live address never changes
 * under the feet of a customer.
 */
const LEGACY_SLUGS: Record<string, string> = {
  'email-hosting-starter': 'email-starter',
  'email-hosting-plus': 'email-plus',
  'email-hosting-business': 'email-business',
};

/** The part of the client of the database that the writer needs. */
type ProductStore = Pick<PrismaClient, 'product'>;

/**
 * The fields of a draft, as they are written on the product.
 *
 * A draft has no price, no egg and no server: it is delivered by the mail
 * system alone.
 */
function draftFields(draft: MailPlanDraft) {
  return {
    name: draft.name,
    category: 'EMAIL_HOSTING' as const,
    fulfilment: 'EMAIL' as const,
    description: draft.description,
    icon: draft.icon,
    eggId: null,
    // The draft is not in the public catalog and it cannot be ordered. The
    // operator opens it when the price is written and the mail has been
    // proved from end to end.
    visible: false,
    deployable: false,
    sortOrder: draft.sortOrder,
    mailMaxDomains: draft.maxDomains,
    mailMaxMailboxes: draft.maxMailboxes,
    mailMaxAliases: draft.maxAliases,
    mailMaxForwarding: draft.maxForwarding,
    mailTotalStorageMb: draft.totalStorageMb,
    mailMailboxQuotaMb: draft.mailboxQuotaMb,
    mailSendLimit: draft.sendLimit,
    mailSendInterval: draft.sendInterval,
  };
}

/**
 * Writes the draft plans of the mail.
 *
 * Everything is idempotent: the seed can be run on every deploy. A plan that
 * is already there belongs to the operator, so its price, its state and the
 * limits that were tuned in the back office are never written over.
 */
export async function seedMailPlanDrafts(store: ProductStore): Promise<{ written: number; kept: number }> {
  let written = 0;
  let kept = 0;

  for (const draft of MAIL_PLAN_DRAFTS) {
    const existing = await store.product.findUnique({ where: { slug: draft.slug } });
    if (existing) {
      kept += 1;
      continue;
    }

    const legacySlug = LEGACY_SLUGS[draft.slug];
    const legacy = legacySlug ? await store.product.findUnique({ where: { slug: legacySlug } }) : null;

    if (legacy && legacy.deployable) {
      // The plan is on sale under its old address, so it keeps that address.
      // The draft is written next to it and the operator decides what to do
      // with the plan that is already on sale.
      console.warn(`The plan "${legacySlug}" is on sale, so it keeps its address.`);
    } else if (legacy) {
      // The plan is a draft that was written under an old name: it is the
      // same plan, so it is renamed and it is not written a second time.
      await store.product.update({
        where: { id: legacy.id },
        data: { ...draftFields(draft), slug: draft.slug },
      });
      written += 1;
      continue;
    }

    await store.product.create({ data: { slug: draft.slug, ...draftFields(draft) } });
    written += 1;
  }

  return { written, kept };
}

/**
 * The pieces every part of the mail area shares: the words of the states, the
 * checks of the names and the small helpers of the values.
 *
 * They live in a module of their own, so the overview of the mail and the
 * page of a domain read the same word for the same thing and can never
 * disagree about it.
 */

import {
  deleteMailAlias,
  deleteMailDomain,
  deleteMailbox,
  type MailAliasView,
  type MailDomainView,
  type MailOwnershipStatus,
  type MailPlanView,
  type MailServiceDomainView,
  type MailServiceStatus,
  type MailServiceView,
  type MailboxView,
} from '../../lib/api';
import { formatPrice, periodSuffix } from '../../lib/pricing';

/** The state of a domain, written the way the pill writes it. */
export const MAIL_STATUS_LABELS: Record<MailDomainView['status'], string> = {
  pending: 'Pending',
  active: 'Active',
  error: 'Error',
  suspended: 'Suspended',
};

/** Maps the state of a domain onto a colour the pill knows. */
export const MAIL_STATUS_TONES: Record<MailDomainView['status'], string> = {
  pending: 'pending',
  active: 'active',
  error: 'error',
  suspended: 'suspended',
};

/** The state of a mailbox, written the way the pill writes it. */
export const MAILBOX_STATUS_LABELS: Record<MailboxView['status'], string> = {
  active: 'Active',
  disabled: 'Disabled',
};

/** Maps the state of a mailbox onto a colour the pill knows. */
export const MAILBOX_STATUS_TONES: Record<MailboxView['status'], string> = {
  active: 'active',
  disabled: 'neutral',
};

/** The state of a mail service, written the way the pill writes it. */
export const MAIL_SERVICE_STATUS_LABELS: Record<MailServiceStatus, string> = {
  PENDING: 'Waiting for the domain',
  PROVISIONING: 'Being set up',
  ACTIVE: 'Active',
  GRACE: 'Grace period',
  SUSPENDED: 'Suspended',
  CANCELLED: 'Cancelled',
};

/** Maps the state of a mail service onto a colour the pill knows. */
export const MAIL_SERVICE_STATUS_TONES: Record<MailServiceStatus, string> = {
  PENDING: 'pending',
  PROVISIONING: 'provisioning',
  ACTIVE: 'active',
  GRACE: 'degraded',
  SUSPENDED: 'suspended',
  CANCELLED: 'cancelled',
};

/** The state of the proof of ownership of a domain, written in words. */
export const MAIL_OWNERSHIP_LABELS: Record<MailOwnershipStatus, string> = {
  UNVERIFIED: 'Ownership not verified',
  VERIFIED: 'Ownership verified',
  FAILED: 'Ownership check failed',
};

/** Maps the state of the proof onto a colour the pill knows. */
export const MAIL_OWNERSHIP_TONES: Record<MailOwnershipStatus, string> = {
  UNVERIFIED: 'pending',
  VERIFIED: 'verified',
  FAILED: 'failed',
};

/** The name of a mailbox, before the @. */
const LOCAL_PART = /^[a-z0-9._%+-]+$/;

/**
 * Checks the name of a mailbox, the part before the @.
 */
export function validateMailLocalPart(part: string): string | null {
  const value = part.trim().toLowerCase();
  if (!value) return 'Enter the name before the @.';
  if (/\s/.test(value)) return 'The name of a mailbox cannot contain spaces.';
  if (!LOCAL_PART.test(value)) return 'Use letters, digits and the marks . _ % + - only.';
  if (value.startsWith('.') || value.endsWith('.') || value.includes('..')) {
    return 'The name cannot start or end with a dot, nor hold two dots in a row.';
  }
  return null;
}

/**
 * Checks the alias the customer typed.
 *
 * An alias belongs to the domain of the page, so an alias of another domain
 * is refused here instead of being sent to the server.
 */
export function validateMailAlias(input: string, domainName: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return 'Enter the address that should receive the mail.';
  if (/\s/.test(value)) return 'An address cannot contain spaces.';
  const [local, domain] = value.split('@');
  if (value.includes('@') && domain !== domainName.toLowerCase()) {
    return `The alias must be an address of ${domainName}.`;
  }
  return validateMailLocalPart(local ?? '');
}

/** The address of an alias: the name the customer typed, on the domain of the page. */
export function mailAliasAddress(input: string, domainName: string): string | null {
  const value = input.trim().toLowerCase();
  if (!value) return null;
  const local = value.split('@')[0] ?? '';
  if (!local) return null;
  return `${local}@${domainName}`;
}

/**
 * A day of the life of a service, in the words of the customer.
 *
 * The moment itself comes from the platform; only the shape of it is written
 * here.
 */
export function mailServiceDay(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString('en-GB', { day: 'numeric', month: 'short', year: 'numeric' });
}

/** The state of a domain of a mail service, in words. */
export function mailDomainStatusLabel(status: string): string {
  const value = status.toLowerCase();
  if (value === 'active') return 'Active';
  if (value === 'pending') return 'Waiting for the proof';
  if (value === 'provisioning') return 'Being set up';
  if (value === 'suspended') return 'Suspended';
  if (value === 'cancelled') return 'Cancelled';
  if (value === 'error' || value === 'failed') return 'Error';
  return value.replace(/_/g, ' ');
}

/** The plan of a list of choices, with the price the platform asks. */
export function mailPlanOptionLabel(plan: MailPlanView): string {
  if (!plan.price) return plan.name;
  return `${plan.name} — ${formatPrice(plan.price.amount, plan.price.currency)} ${periodSuffix(plan.price.period)}`;
}

/**
 * The plans of hosted mail that the platform sells right now.
 *
 * The sale of hosted mail can be closed by the operator, and a plan that is
 * not on sale is never offered.
 */
export function onSaleMailPlans(plans: MailPlanView[]): MailPlanView[] {
  return plans.filter((plan) => plan.onSale && plan.price !== null);
}

/**
 * What the customer asked to delete.
 *
 * The request is the proof that the customer confirmed the deletion: the
 * delete only runs from the confirmation of the request.
 */
export type MailDeleteRequest =
  | { kind: 'domain'; domain: MailDomainView }
  | { kind: 'mailbox'; domain: MailDomainView; mailbox: MailboxView }
  | { kind: 'alias'; domain: MailDomainView; alias: MailAliasView };

/**
 * Deletes what the customer asked to delete.
 *
 * Without a request nothing is deleted and the server is never asked: a
 * delete always needs a confirmation.
 */
export async function runMailDelete(request: MailDeleteRequest | null): Promise<'domain' | 'mailbox' | 'alias' | null> {
  if (!request) return null;
  if (request.kind === 'domain') {
    await deleteMailDomain(request.domain.id);
    return 'domain';
  }
  if (request.kind === 'mailbox') {
    await deleteMailbox(request.domain.id, request.mailbox.id);
    return 'mailbox';
  }
  await deleteMailAlias(request.domain.id, request.alias.id);
  return 'alias';
}

/**
 * A password the server made for a mailbox.
 *
 * It is shown once, in the box of the page, and it is never written
 * anywhere else: not to the console, not to the storage of the browser, not
 * to the address of the page.
 */
export interface OneTimePassword {
  /** The mailbox the password belongs to. */
  address: string;
  /** The password itself. */
  password: string;
}

/** The address of the page of a domain of mail. */
export function mailDomainPath(id: string): string {
  return `/app/mail/domains/${encodeURIComponent(id)}`;
}

/**
 * The state of the DNS of a domain, in the words of the table.
 *
 * The proof of ownership is a record of DNS, so the column of the DNS of the
 * overview reads it. A domain that belongs to no plan has no proof, and the
 * column says so instead of guessing.
 */
export type MailDnsState = 'verified' | 'pending' | 'failed' | 'unchecked';

/** The words of the state of the DNS, for the column of the overview. */
export const MAIL_DNS_STATE_LABELS: Record<MailDnsState, string> = {
  verified: 'DNS verified',
  pending: 'DNS pending',
  failed: 'DNS failed',
  unchecked: 'DNS not checked',
};

/** One row of the table of the domains. */
export interface MailDomainRow {
  id: string;
  name: string;
  /** The state of the domain, as the pill writes it. */
  status: MailDomainView['status'];
  statusLabel: string;
  mailboxes: number;
  maxMailboxes: number;
  aliases: number;
  maxAliases: number;
  usedMb: number;
  quotaMb: number;
  /** The state of the DNS of the domain. */
  dns: MailDnsState;
  webmailUrl: string | null;
  lastError: string | null;
  /** The subscription the domain belongs to, when it has one. */
  serviceId: string | null;
}

/**
 * The state of a domain, read from the two views of the API.
 *
 * The service writes the state in capitals and the list of the customer in
 * small letters, so the two are brought to the same word here.
 */
export function domainStatusOf(status: string): MailDomainView['status'] {
  const value = status.toLowerCase();
  if (value === 'active') return 'active';
  if (value === 'suspended') return 'suspended';
  if (value === 'error' || value === 'failed') return 'error';
  return 'pending';
}

/**
 * A row of the table of the domains.
 *
 * The domain is seen twice by the API: once through the customer and once
 * through the subscription it belongs to. The row is built from the two, so
 * a domain is counted once and never appears twice.
 */
export function buildDomainRow(
  serviceDomain: MailServiceDomainView | null,
  domain: MailDomainView | null,
): MailDomainRow {
  const status = domain ? domain.status : domainStatusOf(serviceDomain?.status ?? 'pending');
  const dns: MailDnsState = serviceDomain
    ? serviceDomain.ownershipStatus === 'VERIFIED'
      ? 'verified'
      : serviceDomain.ownershipStatus === 'FAILED'
        ? 'failed'
        : 'pending'
    : 'unchecked';
  return {
    id: serviceDomain?.id ?? domain?.id ?? '',
    name: serviceDomain?.name ?? domain?.name ?? '',
    status,
    statusLabel: MAIL_STATUS_LABELS[status],
    mailboxes: serviceDomain?.mailboxCount ?? domain?.mailboxes ?? 0,
    maxMailboxes: serviceDomain?.maxMailboxes ?? domain?.maxMailboxes ?? 0,
    aliases: serviceDomain?.aliasCount ?? domain?.aliases ?? 0,
    maxAliases: serviceDomain?.maxAliases ?? domain?.maxAliases ?? 0,
    usedMb: serviceDomain?.usedMb ?? domain?.usedMb ?? 0,
    quotaMb: serviceDomain?.quotaMb ?? domain?.quotaMb ?? 0,
    dns,
    webmailUrl: domain?.webmailUrl ?? null,
    lastError: serviceDomain?.lastError ?? domain?.lastError ?? null,
    serviceId: null,
  };
}

/**
 * The rows of the domains, one list for every subscription.
 *
 * The domains of two subscriptions are never read as one list: every
 * subscription keeps its own rows, and a domain that belongs to no plan is
 * kept apart as well. A domain appears exactly once.
 */
export function groupDomains(
  services: MailServiceView[],
  domains: MailDomainView[],
): { rowsOfService: Map<string, MailDomainRow[]>; rowsWithoutService: MailDomainRow[] } {
  const byId = new Map(domains.map((domain) => [domain.id, domain]));
  const claimed = new Set<string>();
  const rowsOfService = new Map<string, MailDomainRow[]>();
  for (const service of services) {
    const rows = service.domains.map((domain) => {
      claimed.add(domain.id);
      const row = buildDomainRow(domain, byId.get(domain.id) ?? null);
      row.serviceId = service.id;
      return row;
    });
    rowsOfService.set(service.id, rows);
  }
  const rowsWithoutService = domains
    .filter((domain) => !claimed.has(domain.id))
    .map((domain) => buildDomainRow(null, domain));
  return { rowsOfService, rowsWithoutService };
}

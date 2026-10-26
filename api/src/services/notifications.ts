import { prisma } from '../db.js';
import { publishEvent } from './notification-dispatch.js';
import { formatAmount, formatDate } from '../lib/email-templates.js';
import type { NotificationEventType } from './notification-events.js';

/**
 * The messages of the platform that are not asked for by the customer.
 *
 * The functions here are **publishers**, not senders. A business service
 * calls one of them and stops: the event is written in the outbox with the
 * business change that caused it, and the notification engine decides later
 * what the customer hears about it, in which channel, with which template.
 *
 * Before, two places of the platform rendered and sent messages on their
 * own, with their own keys and their own wording. Now there is one way to
 * say what happened, and the engine is the only thing that sends.
 *
 * The identity of an occurrence is what makes a message happen once and only
 * once: the same invoice paid twice is one message, and the same service
 * suspended twice is two.
 */

/** Who a message is for. */
interface Recipient {
  userId: string;
}

/** The money of a message, in the words of the customer. */
function amount(value: number, currency: string): string {
  return formatAmount(value, currency);
}

/**
 * Publishes an event for a customer.
 *
 * The function never throws when the event cannot be written: a business
 * change must not be undone because a message could not be prepared. The
 * problem is written in the log of the platform and the business goes on.
 */
async function publish(
  type: NotificationEventType,
  subject: string,
  userId: string | null,
  payload: Record<string, unknown>,
  occurrence?: string | Date | number | null,
): Promise<void> {
  try {
    await publishEvent({
      type,
      subject,
      userId,
      payload: payload as never,
      occurrence,
    });
  } catch (error) {
    console.error(
      `[notification] the event ${type} could not be published: ${(error as Error).message}`,
    );
  }
}

/**
 * A problem of the platform is over.
 *
 * The operator is told when the problem is over, and not only when it
 * begins: a platform that only talks about what is broken teaches the
 * operator to wait for the next message instead of reading the ones it
 * gets.
 */
export async function notifyOpsRecovered(input: {
  check: string;
  title: string;
  detail: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ops.recovered',
    input.title,
    null,
    { check: input.check, title: input.title, detail: input.detail },
    input.occurrence ?? null,
  );
}

/* ------------------------------------------------------------------ account */

/** The account of a customer was created. */
export async function notifyAccountRegistered(input: Recipient & { name: string | null }): Promise<void> {
  await publish('account.registered', input.userId, input.userId, { name: input.name });
}

/**
 * The account of a customer was suspended.
 *
 * The customer is told, because a customer who is only disconnected thinks
 * the account is lost. The moment of the suspension is the occurrence, so an
 * account that is suspended twice has two messages.
 */
export async function notifyAccountSuspended(input: Recipient & {
  name: string | null;
  reason?: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'account.suspended',
    input.userId,
    input.userId,
    { name: input.name, reason: input.reason ?? null },
    input.occurrence ?? null,
  );
}

/** The account of a customer was put back. */
export async function notifyAccountReinstated(input: Recipient & {
  name: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'account.reinstated',
    input.userId,
    input.userId,
    { name: input.name },
    input.occurrence ?? null,
  );
}

/** The confirmation of the address was asked for again. */
export async function notifyVerificationRequested(input: Recipient & {
  name: string | null;
  token: string;
}): Promise<void> {
  await publish('account.verification_requested', input.userId, input.userId, {
    name: input.name,
    token: input.token,
  });
}

/** The address of the account was confirmed. */
export async function notifyEmailVerified(input: Recipient & { name: string | null }): Promise<void> {
  await publish('account.email_verified', input.userId, input.userId, { name: input.name });
}

/** The customer asked for a new password. */
export async function notifyPasswordResetRequested(input: Recipient & {
  name: string | null;
  token: string;
}): Promise<void> {
  await publish('account.password_reset_requested', input.userId, input.userId, {
    name: input.name,
    token: input.token,
  });
}

/** The password of the account was changed. */
export async function notifyPasswordChanged(input: Recipient & { name: string | null }): Promise<void> {
  await publish('account.password_changed', input.userId, input.userId, { name: input.name });
}

/** The customer asked for another address on the account. */
export async function notifyEmailChangeRequested(input: Recipient & {
  name: string | null;
  token: string;
  email: string;
}): Promise<void> {
  await publish('account.email_change_requested', input.userId, input.userId, {
    name: input.name,
    token: input.token,
    email: input.email,
  });
}

/** The address of the account was changed. */
export async function notifyEmailChanged(input: Recipient & {
  name: string | null;
  email: string;
}): Promise<void> {
  await publish('account.email_changed', input.userId, input.userId, {
    name: input.name,
    email: input.email,
  });
}

/**
 * The customer asked for the closing of the account.
 *
 * A request is not a deletion: the services keep running until the team has
 * looked at it. The moment of the request is the occurrence, because a
 * customer can ask for the closing, take the request back and ask again, and
 * every request is a message of its own.
 */
export async function notifyAccountDeletionRequested(input: Recipient & {
  name: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'account.deletion_requested',
    input.userId,
    input.userId,
    { name: input.name },
    input.occurrence ?? null,
  );
}

/* ------------------------------------------------------- orders and payments */

/** An order was created and waits for its payment. */
export async function notifyOrderCreated(input: Recipient & {
  number: string;
  total: number;
  currency: string;
}): Promise<void> {
  await publish('order.created', input.number, input.userId, {
    number: input.number,
    total: amount(input.total, input.currency),
    currency: input.currency,
  });
}

/** The order waits for its payment. */
export async function notifyPaymentRequired(input: Recipient & {
  number: string;
  total: number;
  currency: string;
}): Promise<void> {
  await publish('order.payment_required', input.number, input.userId, {
    number: input.number,
    total: amount(input.total, input.currency),
    currency: input.currency,
  });
}

/** The payment of the order was confirmed by the provider. */
export async function notifyPaymentSucceeded(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'payment.succeeded',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
    },
    input.occurrence ?? null,
  );
}

/** The payment of the order was refused. */
export async function notifyPaymentFailed(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  reason?: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'payment.failed',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      reason: input.reason ?? null,
    },
    input.occurrence ?? null,
  );
}

/** The order was canceled. */
export async function notifyOrderCanceled(input: Recipient & { number: string }): Promise<void> {
  await publish('order.canceled', input.number, input.userId, { number: input.number });
}

/** The payment was canceled before the money moved. */
export async function notifyPaymentCanceled(input: Recipient & {
  number: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'payment.canceled',
    input.number,
    input.userId,
    { number: input.number },
    input.occurrence ?? null,
  );
}

/** The money of the payment was given back. */
export async function notifyPaymentRefunded(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'payment.refunded',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
    },
    input.occurrence ?? null,
  );
}

/* ----------------------------------------------------------------- invoices */

/** The invoice was issued. */
export async function notifyInvoiceIssued(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  dueAt?: Date | null;
}): Promise<void> {
  await publish('invoice.issued', input.number, input.userId, {
    number: input.number,
    amount: amount(input.amount, input.currency),
    currency: input.currency,
    dueAt: formatDate(input.dueAt),
  });
}

/** The invoice of a customer was paid. */
export async function notifyInvoicePaid(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  periodEnd?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'invoice.paid',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      periodEnd: formatDate(input.periodEnd),
    },
    input.occurrence ?? null,
  );
}

/** The invoice of a customer could not be paid. */
export async function notifyInvoiceFailed(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  reason?: string | null;
  periodEnd?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'invoice.payment_failed',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      reason: input.reason ?? null,
      periodEnd: formatDate(input.periodEnd),
    },
    input.occurrence ?? null,
  );
}

/** The invoice of a customer is late. */
export async function notifyInvoiceOverdue(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  daysOverdue: number;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'invoice.overdue',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      daysOverdue: input.daysOverdue,
    },
    input.occurrence ?? null,
  );
}

/**
 * The invoice of a customer is due and the term of the service is close.
 *
 * The invoice is the occurrence, so a reminder is one message per invoice
 * and not one message per day of the week that is left.
 */
export async function notifyInvoiceReminderDue(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  dueAt?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'invoice.reminder_due',
    input.number,
    input.userId,
    {
      number: input.number,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      dueAt: formatDate(input.dueAt),
    },
    input.occurrence ?? null,
  );
}

/* ------------------------------------------------------------- subscriptions */

/** The subscription of a customer started. */
export async function notifySubscriptionActivated(input: Recipient & {
  service: string;
  plan: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.activated',
    input.service,
    input.userId,
    { service: input.service, plan: input.plan },
    input.occurrence ?? null,
  );
}

/** The paid period of a subscription is over and the line is cancelled. */
export async function notifySubscriptionCanceled(input: Recipient & {
  service: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.canceled',
    input.service,
    input.userId,
    { service: input.service },
    input.occurrence ?? null,
  );
}

/** The subscription of a customer was renewed. */
export async function notifySubscriptionRenewed(input: Recipient & {
  service: string;
  amount: number;
  currency: string;
  periodEnd?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.renewed',
    input.service,
    input.userId,
    {
      service: input.service,
      amount: amount(input.amount, input.currency),
      currency: input.currency,
      periodEnd: formatDate(input.periodEnd),
    },
    input.occurrence ?? null,
  );
}

/**
 * The subscription of a customer changed.
 *
 * The key of the occurrence holds the moment of the change, so a service
 * that changes five times has five messages and not one.
 */
export async function notifySubscriptionChanged(input: Recipient & {
  instanceName: string;
  status: string;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
  occurrence?: string | Date | null;
}): Promise<void> {
  const change = input.cancelAtPeriodEnd
    ? 'the cancellation is planned for the end of the period'
    : `the state is now ${input.status}`;
  await publish(
    'subscription.changed',
    input.instanceName,
    input.userId,
    { service: input.instanceName, change },
    input.occurrence ?? input.periodEnd ?? new Date(),
  );
}

/** The subscription of a customer will end at the end of the period. */
export async function notifySubscriptionCancellationScheduled(input: Recipient & {
  service: string;
  periodEnd?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.cancellation_scheduled',
    input.service,
    input.userId,
    { service: input.service, periodEnd: formatDate(input.periodEnd) },
    input.occurrence ?? null,
  );
}

/** The subscription of a customer started again. */
export async function notifySubscriptionReactivated(input: Recipient & {
  service: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.reactivated',
    input.service,
    input.userId,
    { service: input.service },
    input.occurrence ?? null,
  );
}

/**
 * The paid period of a subscription is over and the service still works.
 *
 * The customer has the grace to pay before the service is suspended. The
 * period and the moment of the grace are the occurrence, so a subscription
 * that falls into the grace again after a renewal has a message of its own.
 */
export async function notifySubscriptionGracePeriod(input: Recipient & {
  service: string;
  graceUntil?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.grace_period',
    input.service,
    input.userId,
    { service: input.service, graceUntil: formatDate(input.graceUntil) },
    input.occurrence ?? null,
  );
}

/**
 * The grace of a subscription is close to its end and the service is going
 * to be suspended.
 *
 * The moment of the end of the grace is the occurrence. The window of this
 * message is shorter than the grace itself, so the message of the grace and
 * this one do not fall on the same day.
 */
export async function notifySubscriptionSuspensionWarning(input: Recipient & {
  service: string;
  graceUntil?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'subscription.suspension_warning',
    input.service,
    input.userId,
    { service: input.service, graceUntil: formatDate(input.graceUntil) },
    input.occurrence ?? null,
  );
}

/* ----------------------------------------------------------------- services */

/** A service of a customer is ready and it answers. */
export async function notifyInstanceProvisioned(input: Recipient & {
  instanceName: string;
  address?: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.activated',
    input.instanceName,
    input.userId,
    { service: input.instanceName, address: input.address ?? null },
    input.occurrence ?? null,
  );
}

/** A service of a customer was stopped. */
export async function notifyInstanceStopped(input: Recipient & {
  instanceName: string;
  reason?: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.suspended',
    input.instanceName,
    input.userId,
    { service: input.instanceName, reason: input.reason ?? 'the service was stopped' },
    input.occurrence ?? new Date(),
  );
}

/** The building of a service failed. */
export async function notifyProvisioningFailed(input: Recipient & {
  instanceName: string;
  reason: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.provisioning_failed',
    input.instanceName,
    input.userId,
    { service: input.instanceName, reason: input.reason },
    input.occurrence ?? new Date(),
  );
}

/**
 * The building of a service has started.
 *
 * The key of the provisioning is the occurrence: a run that is repeated does
 * not write a second message about the same service.
 */
export async function notifyProvisioningStarted(input: Recipient & {
  instanceName: string;
  plan: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.provisioning_started',
    input.instanceName,
    input.userId,
    { service: input.instanceName, plan: input.plan },
    input.occurrence ?? new Date(),
  );
}

/**
 * The paid term of a service is over and the service does not go on.
 *
 * The end of the term is the occurrence, so a term that is paid again has a
 * message of its own.
 */
export async function notifyInstanceExpiring(input: Recipient & {
  instanceName: string;
  expiresAt?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.expiring',
    input.instanceName,
    input.userId,
    { service: input.instanceName, expiresAt: formatDate(input.expiresAt) },
    input.occurrence ?? null,
  );
}

/**
 * The paid term of a service is over and the service goes on.
 *
 * The end of the term is the occurrence, so a term that is paid again has a
 * message of its own.
 */
export async function notifyInstanceRenewalReminder(input: Recipient & {
  instanceName: string;
  renewsAt?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.renewal_reminder',
    input.instanceName,
    input.userId,
    { service: input.instanceName, renewsAt: formatDate(input.renewsAt) },
    input.occurrence ?? null,
  );
}

/**
 * The paid term of a service is over.
 *
 * The end of the term is the occurrence, so the term of a service that is
 * paid again is a message of its own.
 */
export async function notifyInstanceExpired(input: Recipient & {
  instanceName: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.expired',
    input.instanceName,
    input.userId,
    { service: input.instanceName },
    input.occurrence ?? null,
  );
}

/** A service of a customer was canceled. */
export async function notifyInstanceCanceled(input: Recipient & {
  instanceName: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.canceled',
    input.instanceName,
    input.userId,
    { service: input.instanceName },
    input.occurrence ?? null,
  );
}

/**
 * The data of a service was deleted at the end of the retention.
 *
 * The moment of the deletion is the occurrence: a service that is deleted
 * again after a new retention has a message of its own.
 */
export async function notifyInstanceDeleted(input: Recipient & {
  instanceName: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.deleted',
    input.instanceName,
    input.userId,
    { service: input.instanceName },
    input.occurrence ?? null,
  );
}

/** A service of a customer was unsuspended. */
export async function notifyInstanceUnsuspended(input: Recipient & {
  instanceName: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.unsuspended',
    input.instanceName,
    input.userId,
    { service: input.instanceName },
    input.occurrence ?? null,
  );
}

/** The change of the resources of a service went through. */
export async function notifyUpgradeCompleted(input: Recipient & {
  instanceName: string;
  change: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.upgrade_completed',
    input.instanceName,
    input.userId,
    { service: input.instanceName, change: input.change },
    input.occurrence ?? null,
  );
}

/** The change of the resources of a service did not go through. */
export async function notifyUpgradeFailed(input: Recipient & {
  instanceName: string;
  reason: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'service.upgrade_failed',
    input.instanceName,
    input.userId,
    { service: input.instanceName, reason: input.reason },
    input.occurrence ?? null,
  );
}

/* ------------------------------------------------------------------ support */

/** A ticket was opened. */
export async function notifyTicketCreated(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.created',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject },
    input.occurrence ?? null,
  );
}

/**
 * An answer was written in a ticket.
 *
 * The answer of the customer does not bring an answer of the support: the
 * caller decides who reads it, and the message never goes back to the one
 * who wrote it.
 */
export async function notifyTicketReplyCreated(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  excerpt: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.reply_created',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject, excerpt: input.excerpt },
    input.occurrence ?? null,
  );
}

/**
 * The customer answered in a ticket.
 *
 * The message goes to the staff that works the queue, never to the customer
 * that wrote it. When the ticket has no owner, the message goes to the
 * operator.
 */
export async function notifyTicketCustomerReplied(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  excerpt: string;
  staffId?: string | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.customer_replied',
    input.ticketId,
    input.userId,
    {
      ticket: input.ticketNumber,
      subject: input.subject,
      excerpt: input.excerpt,
      staffId: input.staffId ?? null,
    },
    input.occurrence ?? null,
  );
}

/** A ticket was opened and the staff that works the queue has to know it. */
export async function notifyTicketOpenedForStaff(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  customer: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.opened_for_staff',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject, customer: input.customer },
    input.occurrence ?? null,
  );
}

/** A staff member took a ticket. */
export async function notifyTicketAssigned(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  staffId: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.assigned',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject, staffId: input.staffId },
    input.occurrence ?? null,
  );
}

/** The state of a ticket changed. */
export async function notifyTicketStatusChanged(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  status: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.status_changed',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject, status: input.status },
    input.occurrence ?? null,
  );
}

/** A ticket was closed. */
export async function notifyTicketClosed(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.closed',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject },
    input.occurrence ?? null,
  );
}

/** A closed ticket was opened again. */
export async function notifyTicketReopened(input: Recipient & {
  ticketId: string;
  ticketNumber: string;
  subject: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'ticket.reopened',
    input.ticketId,
    input.userId,
    { ticket: input.ticketNumber, subject: input.subject },
    input.occurrence ?? null,
  );
}

/* -------------------------------------------------- domains and hosted mail */

/** A mailbox of a customer was created. */
export async function notifyMailboxCreated(input: Recipient & {
  mailbox: string;
  domain: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'mailbox.created',
    input.mailbox,
    input.userId,
    { mailbox: input.mailbox, domain: input.domain },
    input.occurrence ?? null,
  );
}

/** The customer must prove that a domain is theirs. */
export async function notifyDomainVerificationInstructions(input: Recipient & {
  domain: string;
  host: string;
  token: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'domain.verification_instructions',
    input.domain,
    input.userId,
    { domain: input.domain, host: input.host, token: input.token },
    input.occurrence ?? null,
  );
}

/** The domain was proved and it belongs to the customer. */
export async function notifyDomainVerified(input: Recipient & {
  domain: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'domain.verified',
    input.domain,
    input.userId,
    { domain: input.domain },
    input.occurrence ?? null,
  );
}

/**
 * The DNS of the domain is not ready.
 *
 * The key of the occurrence is the hostname itself, so the customer is told
 * once about a hostname that is not ready, and not once more every time they
 * press the button that checks it. The scope keeps the domain of a server
 * and the domain of the hosted mail apart.
 */
export async function notifyDomainDnsIncomplete(input: Recipient & {
  domain: string;
  missing: string[];
  scope?: 'instance' | 'mail';
}): Promise<void> {
  await publish(
    'domain.dns_incomplete',
    `${input.scope ?? 'instance'}:${input.domain}`,
    input.userId,
    { domain: input.domain, missing: input.missing },
  );
}

/**
 * A mailbox of a customer could not be created.
 *
 * The row of the journal of the mail system is the occurrence: the failure of
 * one attempt is one message, and a new attempt is a message of its own.
 */
export async function notifyMailboxProvisioningFailed(input: Recipient & {
  mailbox: string;
  domain: string;
  reason: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'mailbox.provisioning_failed',
    input.mailbox,
    input.userId,
    { mailbox: input.mailbox, domain: input.domain, reason: input.reason },
    input.occurrence ?? null,
  );
}

/**
 * The hosted mail of a customer started.
 *
 * The service and the domain are the occurrence: a service that hosts more
 * than one domain tells the customer about every domain of its own.
 */
export async function notifyMailhostingActivated(input: Recipient & {
  service: string;
  plan: string;
  domain: string;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'mailhosting.activated',
    input.service,
    input.userId,
    { service: input.service, plan: input.plan, domain: input.domain },
    input.occurrence ?? null,
  );
}

/**
 * The hosted mail of a customer was canceled.
 *
 * The end of the retention is the occurrence, so the same service canceled
 * twice has one message.
 */
export async function notifyMailhostingCanceled(input: Recipient & {
  service: string;
  retentionUntil?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'mailhosting.canceled',
    input.service,
    input.userId,
    { service: input.service, retentionUntil: formatDate(input.retentionUntil) },
    input.occurrence ?? null,
  );
}

/**
 * The hosted mail of a customer renews soon.
 *
 * The service and the end of the term are the occurrence, so a term that is
 * paid again has a message of its own.
 */
export async function notifyMailhostingRenewalReminder(input: Recipient & {
  service: string;
  renewsAt?: Date | null;
  occurrence?: string | Date | null;
}): Promise<void> {
  await publish(
    'mailhosting.renewal_reminder',
    input.service,
    input.userId,
    { service: input.service, renewsAt: formatDate(input.renewsAt) },
    input.occurrence ?? null,
  );
}

/** The number of the notifications of a customer, for the bell of the header. */
export async function unreadNotificationCount(userId: string): Promise<number> {
  return prisma.notification.count({ where: { userId, readAt: null } });
}

/* --------------------------------------------------------------- operator */

/**
 * The alarms of the operator.
 *
 * The messages of this part are not for a customer: they are for the person
 * who runs the platform. They are published by the sweep of the health of the
 * platform, which is the only thing that watches the platform, and they carry
 * no account of a customer: the sweep sees a service, a number or a machine,
 * and it says so.
 *
 * The user is empty on purpose. The event has the audience of the operator,
 * so the engine sends it to the address of the operator and not to the
 * account of a customer.
 */

/** The building of a service never finished. */
export async function notifyOpsProvisioningStuck(
  input: { service: string; minutes: number },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.provisioning_stuck',
    input.service,
    null,
    { service: input.service, minutes: input.minutes },
    occurrence ?? new Date(),
  );
}

/** The events of the payment provider could not be processed. */
export async function notifyOpsWebhookFailures(
  input: { count: number },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish('ops.webhook_failures', 'stripe', null, { count: input.count }, occurrence ?? new Date());
}

/** The messages of the platform could not be delivered. */
export async function notifyOpsDeliveryFailures(
  input: { count: number },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish('ops.delivery_failures', 'mail', null, { count: input.count }, occurrence ?? new Date());
}

/** The backup of the platform failed. */
export async function notifyOpsBackupFailed(
  input: { target: string; reason: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.backup_failed',
    input.target,
    null,
    { target: input.target, reason: input.reason },
    occurrence ?? new Date(),
  );
}

/** The copy of the backup that leaves the host is missing. */
export async function notifyOpsOffsiteBackupMissing(
  input: { target: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.offsite_backup_missing',
    input.target,
    null,
    { target: input.target },
    occurrence ?? new Date(),
  );
}

/** The drill of the restore failed. */
export async function notifyOpsRestoreVerificationFailed(
  input: { target: string; reason: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.restore_verification_failed',
    input.target,
    null,
    { target: input.target, reason: input.reason },
    occurrence ?? new Date(),
  );
}

/** The mail server did not answer. */
export async function notifyOpsMailcowUnhealthy(
  input: { reason: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish('ops.mailcow_unhealthy', 'smtp', null, { reason: input.reason }, occurrence ?? new Date());
}

/** There is an incident on the platform. */
export async function notifyOpsIncident(
  input: { message: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish('ops.incident', 'platform', null, { message: input.message }, occurrence ?? new Date());
}

/** The machine is running out of room. */
export async function notifyOpsCapacityCritical(
  input: { resource: string; value: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.capacity_critical',
    input.resource,
    null,
    { resource: input.resource, value: input.value },
    occurrence ?? new Date(),
  );
}

/** The certificate of an address of the platform is about to expire. */
export async function notifyOpsDnsCertificateFailure(
  input: { subject: string; reason: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.dns_certificate_failure',
    input.subject,
    null,
    { subject: input.subject, reason: input.reason },
    occurrence ?? new Date(),
  );
}

/** Something that touches the security of the platform changed. */
export async function notifyOpsSecurityChange(
  input: { subject: string; detail: string },
  occurrence?: Date | string | number | null,
): Promise<void> {
  await publish(
    'ops.security_change',
    input.subject,
    null,
    { subject: input.subject, detail: input.detail },
    occurrence ?? new Date(),
  );
}


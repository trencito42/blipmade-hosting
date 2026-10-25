/**
 * The events of the platform.
 *
 * A business service does not render and does not send a message: it
 * publishes an event, and the notification engine decides what the customer
 * hears about it, in which channel, with which template.
 *
 * The file holds three things:
 *
 *   1. the categories of the messages and their classification, which say
 *      what a customer may switch off and what they may not;
 *   2. the contract of every event: the facts it carries;
 *   3. the registry, which says for every event what it means: the template
 *      of the e-mail, the channels, the category, who receives it and where
 *      the message of the notification centre leads.
 *
 * The identity of an occurrence is the `businessKey`. It is built from the
 * business identity of the thing that happened **and** from the occurrence
 * itself, so the same service can be suspended and reactivated as many
 * times as it happens and every occurrence keeps its own message. A key
 * built only from the name and from the state would keep every future
 * occurrence of the same state silent.
 */

/** The groups of the messages, the same groups as the preferences. */
import { emailChangeLink, resetLink, verificationLink } from '../lib/email-templates.js';

export type NotificationCategory =
  | 'accountSecurity'
  | 'ordersBilling'
  | 'hostingServices'
  | 'support'
  | 'domainsEmail'
  | 'incidents'
  | 'productUpdates'
  | 'marketing';

/**
 * How important a message is.
 *
 * `essential` messages cannot be switched off: they protect the account,
 * they carry a contractual obligation or they are required by the law. A
 * customer who switches off the optional messages keeps them.
 */
export type NotificationClassification = 'essential' | 'optional' | 'marketing';

/** The channels a message travels on. */
export type NotificationChannel = 'email' | 'in_app';

/** Who the message is for. */
export type NotificationAudience = 'customer' | 'staff' | 'operator';

/** The facts every event carries. */
export interface EventBase {
  /** The customer the event belongs to. It is empty for the events of the operator. */
  userId?: string | null;
  /** When the thing happened, as the business says it. */
  occurredAt?: Date;
  /**
   * The facts that make the occurrence unique, e.g. the number of the
   * invoice and the moment of the payment. They are part of the key of the
   * occurrence and never of the message itself.
   */
  occurrence?: string;
}

/** The contract of every event. */
export interface EventPayloadMap {
  'account.registered': { name: string | null };
  'account.verification_requested': { name: string | null; token: string };
  'account.email_verified': { name: string | null };
  'account.password_reset_requested': { name: string | null; token: string };
  'account.password_changed': { name: string | null };
  'account.email_change_requested': { name: string | null; token: string; email: string };
  'account.email_changed': { name: string | null; email: string };
  'account.deletion_requested': { name: string | null };

  'order.created': { number: string; total: string; currency: string };
  'order.payment_required': { number: string; total: string; currency: string };
  'order.canceled': { number: string };
  'payment.succeeded': { number: string; amount: string; currency: string };
  'payment.failed': { number: string; amount: string; currency: string; reason: string | null };
  'payment.canceled': { number: string };
  'payment.refunded': { number: string; amount: string; currency: string };

  'invoice.issued': { number: string; amount: string; currency: string; dueAt: string | null };
  'invoice.paid': { number: string; amount: string; currency: string; periodEnd: string | null };
  'invoice.payment_failed': { number: string; amount: string; currency: string; reason: string | null };
  'invoice.overdue': { number: string; amount: string; currency: string; daysOverdue: number };
  'invoice.reminder_due': { number: string; amount: string; currency: string; dueAt: string | null };

  'subscription.activated': { service: string; plan: string };
  'subscription.renewed': { service: string; amount: string; currency: string; periodEnd: string | null };
  'subscription.changed': { service: string; change: string };
  'subscription.cancellation_scheduled': { service: string; periodEnd: string | null };
  'subscription.canceled': { service: string };
  'subscription.reactivated': { service: string };
  'subscription.grace_period': { service: string; graceUntil: string | null };
  'subscription.suspension_warning': { service: string; graceUntil: string | null };

  'service.provisioning_started': { service: string; plan: string };
  'service.provisioning_failed': { service: string; reason: string };
  'service.activated': { service: string; address: string | null };
  'service.suspended': { service: string; reason: string };
  'service.unsuspended': { service: string };
  'service.expiring': { service: string; expiresAt: string | null };
  'service.expired': { service: string };
  'service.canceled': { service: string };
  'service.deleted': { service: string };
  'service.upgrade_completed': { service: string; change: string };
  'service.upgrade_failed': { service: string; reason: string };
  'service.incident': { service: string; message: string };
  'service.restored': { service: string; message: string };

  'ticket.created': { ticket: string; subject: string };
  'ticket.opened_for_staff': { ticket: string; subject: string; customer: string };
  'ticket.assigned': { ticket: string; subject: string; staffId?: string | null };
  'ticket.reply_created': { ticket: string; subject: string; excerpt: string };
  'ticket.customer_replied': { ticket: string; subject: string; excerpt: string; staffId?: string | null };
  'ticket.status_changed': { ticket: string; subject: string; status: string };
  'ticket.resolved': { ticket: string; subject: string };
  'ticket.reopened': { ticket: string; subject: string };
  'ticket.closed': { ticket: string; subject: string };

  'mailbox.created': { mailbox: string; domain: string };
  'mailbox.provisioning_failed': { mailbox: string; domain: string; reason: string };
  'mailbox.password_reset': { mailbox: string; domain: string };
  'domain.verification_instructions': { domain: string; host: string; token: string };
  'domain.verified': { domain: string };
  'domain.dns_incomplete': { domain: string; missing: string[] };
  'mailhosting.activated': { service: string; plan: string; domain: string };
  'mailhosting.canceled': { service: string; retentionUntil: string | null };
  'mailhosting.renewal_reminder': { service: string; renewsAt: string | null };

  'ops.provisioning_stuck': { service: string; minutes: number };
  'ops.webhook_failures': { count: number };
  'ops.delivery_failures': { count: number };
  'ops.backup_failed': { target: string; reason: string };
  'ops.offsite_backup_missing': { target: string };
  'ops.restore_verification_failed': { target: string; reason: string };
  'ops.mailcow_unhealthy': { reason: string };
  'ops.incident': { message: string };
  'ops.capacity_critical': { resource: string; value: string };
  'ops.dns_certificate_failure': { subject: string; reason: string };
  'ops.security_change': { subject: string; detail: string };
}

/** The kind of every event. */
export type NotificationEventType = keyof EventPayloadMap;

/** What an event means for the customer. */
export interface EventDefinition<Type extends NotificationEventType = NotificationEventType> {
  /** The kind of the event. */
  type: Type;
  /** The identifier of the template of the e-mail. */
  template: string;
  /** The channels the message travels on. */
  channels: NotificationChannel[];
  /** The group of the message, the one the preferences use. */
  category: NotificationCategory;
  /** How important the message is. */
  classification: NotificationClassification;
  /** Who receives the message. */
  audience: NotificationAudience;
  /** The title of the message of the notification centre. */
  title: (payload: EventPayloadMap[Type]) => string;
  /** The text of the message of the notification centre. */
  body: (payload: EventPayloadMap[Type]) => string;
  /** Where the message of the notification centre leads. */
  link?: (payload: EventPayloadMap[Type]) => { url: string; label: string } | null;
  /**
   * The action of the e-mail: the button and the link behind it.
   *
   * The engine builds it and puts it in the payload of the template under
   * "action", so the template never builds a link and never sees the token
   * that the link of a verification carries.
   */
  emailLink?: (payload: EventPayloadMap[Type]) => { url: string; label: string } | null;
  /**
   * The facts that hold a secret, e.g. the token of a verification.
   *
   * When it is true, the dispatcher empties the payload of the event as soon
   * as the message is on the queue. The secret is never kept in the outbox
   * longer than the few seconds it needs to travel to the mail server.
   */
  holdsSecret?: boolean;
}

function definition<Type extends NotificationEventType>(
  value: EventDefinition<Type>,
): EventDefinition<Type> {
  return value;
}

/**
 * The registry of the events.
 *
 * Every event of the platform is here, with what it means. An event that is
 * not here is not published and not sent: the engine refuses it in words,
 * so a new event cannot slip into the platform without a decision about the
 * message it carries.
 */
export type EventRegistry = {
  [Type in NotificationEventType]: EventDefinition<Type>;
};

export const EVENT_DEFINITIONS: EventRegistry = {
  // ---------------------------------------------------------------- account
  'account.registered': definition({
    type: 'account.registered',
    template: 'account-welcome',
    channels: ['email', 'in_app'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Welcome to Blipmade',
    body: () => 'Your account is ready. Add a service and it starts in minutes.',
    link: () => ({ url: '/app', label: 'Open the dashboard' }),
  }),
  'account.verification_requested': definition({
    type: 'account.verification_requested',
    template: 'account-verify-email',
    channels: ['email'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Confirm your address',
    body: () => 'We sent you a message to confirm your address.',
    emailLink: (payload) => ({ url: verificationLink(payload.token), label: 'Confirm my address' }),
    holdsSecret: true,
  }),
  'account.email_verified': definition({
    type: 'account.email_verified',
    template: 'account-email-verified',
    channels: ['email', 'in_app'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Your address is confirmed',
    body: () => 'The address of your account is confirmed and everything is ready.',
  }),
  'account.password_reset_requested': definition({
    type: 'account.password_reset_requested',
    template: 'account-password-reset',
    channels: ['email'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Reset your password',
    body: () => 'We sent you a message to choose a new password.',
    emailLink: (payload) => ({ url: resetLink(payload.token), label: 'Choose a new password' }),
    holdsSecret: true,
  }),
  'account.password_changed': definition({
    type: 'account.password_changed',
    template: 'account-password-changed',
    channels: ['email', 'in_app'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Your password was changed',
    body: () => 'The password of your account was changed. If it was not you, answer us at once.',
    link: () => ({ url: '/app/settings', label: 'Open the settings' }),
  }),
  'account.email_change_requested': definition({
    type: 'account.email_change_requested',
    template: 'account-email-change-requested',
    channels: ['email'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Confirm your new address',
    body: () => 'We sent a message to the new address of your account.',
    emailLink: (payload) => ({ url: emailChangeLink(payload.token), label: 'Confirm the new address' }),
    holdsSecret: true,
  }),
  'account.email_changed': definition({
    type: 'account.email_changed',
    template: 'account-email-changed',
    channels: ['email', 'in_app'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'Your address was changed',
    body: () => 'The address of your account was changed.',
    link: () => ({ url: '/app/settings', label: 'Open the settings' }),
  }),
  'account.deletion_requested': definition({
    type: 'account.deletion_requested',
    template: 'account-deletion-requested',
    channels: ['email'],
    category: 'accountSecurity',
    classification: 'essential',
    audience: 'customer',
    title: () => 'The closing of your account was asked for',
    body: () => 'We received the request to close your account.',
  }),

  // ------------------------------------------------------- orders and money
  'order.created': definition({
    type: 'order.created',
    template: 'order-created',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `Your order ${payload.number} was created`,
    body: (payload) => `The order ${payload.number} is waiting for its payment.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'order.payment_required': definition({
    type: 'order.payment_required',
    template: 'order-payment-required',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The order ${payload.number} waits for its payment`,
    body: (payload) => `The order ${payload.number} is not started until it is paid.`,
    link: () => ({ url: '/app/billing', label: 'Pay the order' }),
  }),
  'order.canceled': definition({
    type: 'order.canceled',
    template: 'order-canceled',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The order ${payload.number} was canceled`,
    body: (payload) => `The order ${payload.number} was canceled and nothing was charged.`,
  }),
  'payment.succeeded': definition({
    type: 'payment.succeeded',
    template: 'payment-succeeded',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `Your payment of ${payload.amount} went through`,
    body: (payload) => `The payment of ${payload.amount} for the order ${payload.number} was confirmed.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'payment.failed': definition({
    type: 'payment.failed',
    template: 'payment-failed',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The payment of ${payload.amount} did not go through`,
    body: (payload) => `The payment for the order ${payload.number} was refused.`,
    link: () => ({ url: '/app/billing', label: 'Try again' }),
  }),
  'payment.canceled': definition({
    type: 'payment.canceled',
    template: 'payment-canceled',
    channels: ['email'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The payment of the order ${payload.number} was canceled`,
    body: () => 'The payment was canceled before it was confirmed.',
  }),
  'payment.refunded': definition({
    type: 'payment.refunded',
    template: 'payment-refunded',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The payment of ${payload.amount} was refunded`,
    body: (payload) => `The payment for the order ${payload.number} was refunded.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),

  // --------------------------------------------------------------- invoices
  'invoice.issued': definition({
    type: 'invoice.issued',
    template: 'invoice-issued',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The invoice ${payload.number} was issued`,
    body: (payload) => `The invoice ${payload.number} is for ${payload.amount}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'invoice.paid': definition({
    type: 'invoice.paid',
    template: 'invoice-paid',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The invoice ${payload.number} was paid`,
    body: (payload) => `The invoice ${payload.number} for ${payload.amount} was paid.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'invoice.payment_failed': definition({
    type: 'invoice.payment_failed',
    template: 'invoice-payment-failed',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The payment of the invoice ${payload.number} failed`,
    body: (payload) => `The invoice ${payload.number} for ${payload.amount} could not be paid.`,
    link: () => ({ url: '/app/billing', label: 'Try again' }),
  }),
  'invoice.overdue': definition({
    type: 'invoice.overdue',
    template: 'invoice-overdue',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The invoice ${payload.number} is late`,
    body: (payload) => `The invoice ${payload.number} for ${payload.amount} is ${payload.daysOverdue} day(s) late.`,
    link: () => ({ url: '/app/billing', label: 'Pay the invoice' }),
  }),
  'invoice.reminder_due': definition({
    type: 'invoice.reminder_due',
    template: 'invoice-reminder-due',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The invoice ${payload.number} is due`,
    body: (payload) => `The invoice ${payload.number} for ${payload.amount} is due soon.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),

  // ---------------------------------------------------------- subscriptions
  'subscription.activated': definition({
    type: 'subscription.activated',
    template: 'subscription-activated',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} started`,
    body: (payload) => `The subscription of ${payload.service} on the plan ${payload.plan} started.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.renewed': definition({
    type: 'subscription.renewed',
    template: 'subscription-renewed',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} was renewed`,
    body: (payload) => `The subscription of ${payload.service} was renewed for ${payload.amount}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.changed': definition({
    type: 'subscription.changed',
    template: 'subscription-changed',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} changed`,
    body: (payload) => `The subscription of ${payload.service} changed: ${payload.change}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.cancellation_scheduled': definition({
    type: 'subscription.cancellation_scheduled',
    template: 'subscription-cancellation-scheduled',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} will end`,
    body: (payload) =>
      `The subscription of ${payload.service} ends at the end of the period that was paid for.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.canceled': definition({
    type: 'subscription.canceled',
    template: 'subscription-canceled',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} ended`,
    body: (payload) => `The subscription of ${payload.service} ended. The data is kept for a while.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.reactivated': definition({
    type: 'subscription.reactivated',
    template: 'subscription-reactivated',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} started again`,
    body: (payload) => `The subscription of ${payload.service} started again.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.grace_period': definition({
    type: 'subscription.grace_period',
    template: 'subscription-grace-period',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} is in its grace period`,
    body: (payload) => `The service keeps working until ${payload.graceUntil ?? 'the end of the grace'}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'subscription.suspension_warning': definition({
    type: 'subscription.suspension_warning',
    template: 'subscription-suspension-warning',
    channels: ['email', 'in_app'],
    category: 'ordersBilling',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The subscription of ${payload.service} will be suspended`,
    body: (payload) => `The service is suspended at the end of the grace period, on ${payload.graceUntil ?? 'the date below'}.`,
    link: () => ({ url: '/app/billing', label: 'Pay now' }),
  }),

  // -------------------------------------------------------------- services
  'service.provisioning_started': definition({
    type: 'service.provisioning_started',
    template: 'service-provisioning-started',
    channels: ['email'],
    category: 'hostingServices',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `${payload.service} is being built`,
    body: (payload) => `The service ${payload.service} on the plan ${payload.plan} is being built.`,
  }),
  'service.provisioning_failed': definition({
    type: 'service.provisioning_failed',
    template: 'service-provisioning-failed',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} could not be built`,
    body: (payload) => `The service ${payload.service} could not be built: ${payload.reason}.`,
    link: () => ({ url: '/app/tickets', label: 'Open the support' }),
  }),
  'service.activated': definition({
    type: 'service.activated',
    template: 'service-activated',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} is ready`,
    body: (payload) => `The service ${payload.service} is ready and it answers.`,
    link: () => ({ url: '/app/instances', label: 'Open the service' }),
  }),
  'service.suspended': definition({
    type: 'service.suspended',
    template: 'service-suspended',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} was suspended`,
    body: (payload) => `The service ${payload.service} was suspended: ${payload.reason}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'service.unsuspended': definition({
    type: 'service.unsuspended',
    template: 'service-unsuspended',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} works again`,
    body: (payload) => `The service ${payload.service} was unsuspended and it works again.`,
  }),
  'service.expiring': definition({
    type: 'service.expiring',
    template: 'service-expiring',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `${payload.service} ends soon`,
    body: (payload) => `The service ${payload.service} ends on ${payload.expiresAt ?? 'the date of its term'}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'service.expired': definition({
    type: 'service.expired',
    template: 'service-expired',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} ended`,
    body: (payload) => `The term of the service ${payload.service} ended. The data is kept for a while.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'service.canceled': definition({
    type: 'service.canceled',
    template: 'service-canceled',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The service ${payload.service} was canceled`,
    body: (payload) => `The service ${payload.service} was canceled. The data is kept until it is deleted.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),
  'service.deleted': definition({
    type: 'service.deleted',
    template: 'service-deleted',
    channels: ['email'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The data of ${payload.service} was deleted`,
    body: (payload) => `The data of the service ${payload.service} was deleted at the end of its retention.`,
  }),
  'service.upgrade_completed': definition({
    type: 'service.upgrade_completed',
    template: 'service-upgrade-completed',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `${payload.service} was changed`,
    body: (payload) => `The change of the service ${payload.service} went through: ${payload.change}.`,
  }),
  'service.upgrade_failed': definition({
    type: 'service.upgrade_failed',
    template: 'service-upgrade-failed',
    channels: ['email', 'in_app'],
    category: 'hostingServices',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The change of ${payload.service} did not go through`,
    body: (payload) => `The change of the service ${payload.service} failed: ${payload.reason}.`,
    link: () => ({ url: '/app/tickets', label: 'Open the support' }),
  }),
  'service.incident': definition({
    type: 'service.incident',
    template: 'service-incident',
    channels: ['email', 'in_app'],
    category: 'incidents',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `An incident touches ${payload.service}`,
    body: (payload) => payload.message,
  }),
  'service.restored': definition({
    type: 'service.restored',
    template: 'service-restored',
    channels: ['email', 'in_app'],
    category: 'incidents',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.service} works again`,
    body: (payload) => payload.message,
  }),

  // ---------------------------------------------------------------- support
  'ticket.created': definition({
    type: 'ticket.created',
    template: 'ticket-created',
    channels: ['email', 'in_app'],
    category: 'support',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `Your ticket ${payload.ticket} was opened`,
    body: (payload) => `The ticket ${payload.ticket} — ${payload.subject} — is in the queue of the support.`,
    link: () => ({ url: '/app/tickets', label: 'Open the ticket' }),
  }),
  'ticket.opened_for_staff': definition({
    type: 'ticket.opened_for_staff',
    template: 'ticket-opened-for-staff',
    channels: ['email'],
    category: 'support',
    classification: 'optional',
    audience: 'staff',
    title: (payload) => `New ticket ${payload.ticket}`,
    body: (payload) => `${payload.subject} — ${payload.customer}`,
  }),
  'ticket.assigned': definition({
    type: 'ticket.assigned',
    template: 'ticket-assigned',
    channels: ['email'],
    category: 'support',
    classification: 'optional',
    audience: 'staff',
    title: (payload) => `The ticket ${payload.ticket} was assigned to you`,
    body: (payload) => `${payload.subject}`,
  }),
  'ticket.reply_created': definition({
    type: 'ticket.reply_created',
    template: 'ticket-reply-created',
    channels: ['email', 'in_app'],
    category: 'support',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `New answer in your ticket ${payload.ticket}`,
    body: (payload) => payload.excerpt,
    link: () => ({ url: '/app/tickets', label: 'Open the ticket' }),
  }),
  'ticket.customer_replied': definition({
    type: 'ticket.customer_replied',
    template: 'ticket-customer-replied',
    channels: ['email'],
    category: 'support',
    classification: 'essential',
    audience: 'staff',
    title: (payload) => `New answer in the ticket ${payload.ticket}`,
    body: (payload) => payload.excerpt,
  }),
  'ticket.status_changed': definition({
    type: 'ticket.status_changed',
    template: 'ticket-status-changed',
    channels: ['email', 'in_app'],
    category: 'support',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `Your ticket ${payload.ticket} changed state`,
    body: (payload) => `The state of the ticket ${payload.ticket} is now ${payload.status}.`,
    link: () => ({ url: '/app/tickets', label: 'Open the ticket' }),
  }),
  'ticket.resolved': definition({
    type: 'ticket.resolved',
    template: 'ticket-resolved',
    channels: ['email', 'in_app'],
    category: 'support',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `Your ticket ${payload.ticket} was answered`,
    body: (payload) => `The ticket ${payload.ticket} — ${payload.subject} — was answered.`,
    link: () => ({ url: '/app/tickets', label: 'Open the ticket' }),
  }),
  'ticket.reopened': definition({
    type: 'ticket.reopened',
    template: 'ticket-reopened',
    channels: ['email'],
    category: 'support',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `Your ticket ${payload.ticket} was opened again`,
    body: (payload) => `The ticket ${payload.ticket} was opened again.`,
  }),
  'ticket.closed': definition({
    type: 'ticket.closed',
    template: 'ticket-closed',
    channels: ['email', 'in_app'],
    category: 'support',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `Your ticket ${payload.ticket} was closed`,
    body: (payload) => `The ticket ${payload.ticket} was closed. You can open a new one at any time.`,
  }),

  // ------------------------------------------------------ domains and mail
  'mailbox.created': definition({
    type: 'mailbox.created',
    template: 'mailbox-created',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The mailbox ${payload.mailbox} is ready`,
    body: (payload) => `The mailbox ${payload.mailbox} of ${payload.domain} is ready.`,
  }),
  'mailbox.provisioning_failed': definition({
    type: 'mailbox.provisioning_failed',
    template: 'mailbox-provisioning-failed',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The mailbox ${payload.mailbox} could not be created`,
    body: (payload) => `The mailbox ${payload.mailbox} of ${payload.domain} failed: ${payload.reason}.`,
    link: () => ({ url: '/app/mail', label: 'Open the mail' }),
  }),
  'mailbox.password_reset': definition({
    type: 'mailbox.password_reset',
    template: 'mailbox-password-reset',
    channels: ['email'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The password of ${payload.mailbox} was changed`,
    body: (payload) => `The password of the mailbox ${payload.mailbox} was changed.`,
  }),
  'domain.verification_instructions': definition({
    type: 'domain.verification_instructions',
    template: 'domain-verification-instructions',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `Prove that ${payload.domain} is yours`,
    body: (payload) => `Publish the record ${payload.host} and we will host ${payload.domain}.`,
    link: () => ({ url: '/app/domains', label: 'Open the domains' }),
    holdsSecret: true,
  }),
  'domain.verified': definition({
    type: 'domain.verified',
    template: 'domain-verified',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `${payload.domain} is yours`,
    body: (payload) => `The domain ${payload.domain} was proved and it is yours.`,
    link: () => ({ url: '/app/domains', label: 'Open the domains' }),
  }),
  'domain.dns_incomplete': definition({
    type: 'domain.dns_incomplete',
    template: 'domain-dns-incomplete',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The DNS of ${payload.domain} is not complete`,
    body: (payload) => `The domain ${payload.domain} is missing ${payload.missing.join(', ')}.`,
    link: () => ({ url: '/app/domains', label: 'Open the domains' }),
  }),
  'mailhosting.activated': definition({
    type: 'mailhosting.activated',
    template: 'mailhosting-activated',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The hosted mail of ${payload.domain} started`,
    body: (payload) => `The plan ${payload.plan} of the hosted mail is active for ${payload.domain}.`,
    link: () => ({ url: '/app/mail', label: 'Open the mail' }),
  }),
  'mailhosting.canceled': definition({
    type: 'mailhosting.canceled',
    template: 'mailhosting-canceled',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'essential',
    audience: 'customer',
    title: (payload) => `The hosted mail of ${payload.service} was canceled`,
    body: (payload) =>
      `The hosted mail was canceled. The data is kept until ${payload.retentionUntil ?? 'the end of the retention'}.`,
    link: () => ({ url: '/app/mail', label: 'Open the mail' }),
  }),
  'mailhosting.renewal_reminder': definition({
    type: 'mailhosting.renewal_reminder',
    template: 'mailhosting-renewal-reminder',
    channels: ['email', 'in_app'],
    category: 'domainsEmail',
    classification: 'optional',
    audience: 'customer',
    title: (payload) => `The hosted mail of ${payload.service} renews soon`,
    body: (payload) => `The hosted mail renews on ${payload.renewsAt ?? 'the date of its term'}.`,
    link: () => ({ url: '/app/billing', label: 'Open the billing' }),
  }),

  // ------------------------------------------------------------ the operator
  'ops.provisioning_stuck': definition({
    type: 'ops.provisioning_stuck',
    template: 'ops-provisioning-stuck',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `The provisioning of ${payload.service} is stuck`,
    body: (payload) => `The provisioning of ${payload.service} has been running for ${payload.minutes} minutes.`,
  }),
  'ops.webhook_failures': definition({
    type: 'ops.webhook_failures',
    template: 'ops-webhook-failures',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `${payload.count} webhook(s) of the payment provider failed`,
    body: () => 'The events of the payment provider that failed are waiting for an operator.',
  }),
  'ops.delivery_failures': definition({
    type: 'ops.delivery_failures',
    template: 'ops-delivery-failures',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `${payload.count} message(s) could not be delivered`,
    body: () => 'The messages that could not be delivered are waiting for an operator.',
  }),
  'ops.backup_failed': definition({
    type: 'ops.backup_failed',
    template: 'ops-backup-failed',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: () => 'The backup failed',
    body: (payload) => `The backup of ${payload.target} failed: ${payload.reason}.`,
  }),
  'ops.offsite_backup_missing': definition({
    type: 'ops.offsite_backup_missing',
    template: 'ops-offsite-backup-missing',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: () => 'The copy of the backup is missing',
    body: (payload) => `There is no copy of the backup of ${payload.target} outside the machine.`,
  }),
  'ops.restore_verification_failed': definition({
    type: 'ops.restore_verification_failed',
    template: 'ops-restore-verification-failed',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: () => 'The restoration could not be verified',
    body: (payload) => `The restoration of ${payload.target} did not give back what it should: ${payload.reason}.`,
  }),
  'ops.mailcow_unhealthy': definition({
    type: 'ops.mailcow_unhealthy',
    template: 'ops-mailcow-unhealthy',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: () => 'The mail system does not answer',
    body: (payload) => `The mail system of the platform does not answer: ${payload.reason}.`,
  }),
  'ops.incident': definition({
    type: 'ops.incident',
    template: 'ops-incident',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: () => 'An incident of the platform',
    body: (payload) => payload.message,
  }),
  'ops.capacity_critical': definition({
    type: 'ops.capacity_critical',
    template: 'ops-capacity-critical',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `The capacity of ${payload.resource} is critical`,
    body: (payload) => `The value of ${payload.resource} is ${payload.value}.`,
  }),
  'ops.dns_certificate_failure': definition({
    type: 'ops.dns_certificate_failure',
    template: 'ops-dns-certificate-failure',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `The certificate of ${payload.subject} failed`,
    body: (payload) => payload.reason,
  }),
  'ops.security_change': definition({
    type: 'ops.security_change',
    template: 'ops-security-change',
    channels: ['email'],
    category: 'incidents',
    classification: 'essential',
    audience: 'operator',
    title: (payload) => `A change of security: ${payload.subject}`,
    body: (payload) => payload.detail,
  }),
};

/** The definition of an event, or nothing when the event is not known. */
export function eventDefinition(type: string): EventDefinition | null {
  return (EVENT_DEFINITIONS as Record<string, EventDefinition>)[type] ?? null;
}

/** The kind of an event, if the platform knows it. */
export function isKnownEvent(type: string): type is NotificationEventType {
  return eventDefinition(type) !== null;
}

/**
 * The key of an occurrence.
 *
 * The key is built from the kind of the event, from the business identity
 * of the thing that happened and from the occurrence itself. The occurrence
 * is what keeps two occurrences of the same state apart: a service that is
 * suspended twice has two keys and therefore two messages.
 */
export function businessKey(input: {
  type: string;
  subject: string;
  occurrence?: string | Date | number | null;
}): string {
  const occurrence =
    input.occurrence instanceof Date
      ? input.occurrence.toISOString()
      : input.occurrence === undefined || input.occurrence === null
        ? ''
        : String(input.occurrence);
  return occurrence ? `${input.type}:${input.subject}:${occurrence}` : `${input.type}:${input.subject}`;
}

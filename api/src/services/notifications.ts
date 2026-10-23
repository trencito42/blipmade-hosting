import { prisma } from '../db.js';
import { sendMail } from '../lib/mailer.js';
import {
  formatAmount,
  formatDate,
  instanceProvisionedTemplate,
  instanceStoppedTemplate,
  invoiceFailedTemplate,
  invoicePaidTemplate,
  subscriptionChangedTemplate,
} from '../lib/email-templates.js';

/**
 * The messages of the platform that are not asked for by the customer.
 *
 * They follow the preferences of the account: a customer who does not want to
 * hear about the billing does not get the billing messages.
 *
 * The delivery state is the one of the mailer: while no relay is configured,
 * the message is written to a file and nobody receives it. Nothing here ever
 * says that a message was sent.
 */

/** The preferences a customer can switch on and off. */
type Category = 'productUpdates' | 'billing' | 'support' | 'incidents' | 'marketing';

async function wants(userId: string, category: Category): Promise<boolean> {
  const preference = await prisma.notificationPreference.findUnique({ where: { userId } });
  // A customer who never chose anything gets the defaults, and the defaults
  // are on for everything but the offers.
  if (!preference) return category !== 'marketing';
  return preference[category];
}

interface Recipient {
  userId: string;
  email: string;
  name?: string | null;
}

/** The invoice of a customer was paid. */
export async function notifyInvoicePaid(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  periodEnd?: Date | null;
}): Promise<void> {
  if (!(await wants(input.userId, 'billing'))) return;
  const template = invoicePaidTemplate({
    number: input.number,
    amount: formatAmount(input.amount, input.currency),
    periodEnd: formatDate(input.periodEnd),
  });
  await sendMail({
    to: input.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: 'invoice-paid',
    idempotencyKey: `invoice-paid:${input.number}`,
  });
}

/** The invoice of a customer could not be paid. */
export async function notifyInvoiceFailed(input: Recipient & {
  number: string;
  amount: number;
  currency: string;
  reason?: string | null;
  periodEnd?: Date | null;
}): Promise<void> {
  if (!(await wants(input.userId, 'billing'))) return;
  const template = invoiceFailedTemplate({
    number: input.number,
    amount: formatAmount(input.amount, input.currency),
    reason: input.reason ?? null,
    periodEnd: formatDate(input.periodEnd),
  });
  await sendMail({
    to: input.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: 'invoice-failed',
    idempotencyKey: `invoice-failed:${input.number}`,
  });
}

/** The subscription of a customer changed. */
export async function notifySubscriptionChanged(input: Recipient & {
  instanceName: string;
  status: string;
  periodEnd?: Date | null;
  cancelAtPeriodEnd?: boolean;
}): Promise<void> {
  if (!(await wants(input.userId, 'billing'))) return;
  const template = subscriptionChangedTemplate({
    instanceName: input.instanceName,
    status: input.status,
    periodEnd: formatDate(input.periodEnd),
    cancelAtPeriodEnd: input.cancelAtPeriodEnd ?? false,
  });
  await sendMail({
    to: input.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: 'subscription-changed',
    idempotencyKey: `subscription-changed:${input.userId}:${input.instanceName}:${input.status}`,
  });
}

/** A service of a customer is ready. */
export async function notifyInstanceProvisioned(input: Recipient & {
  instanceName: string;
  address?: string | null;
}): Promise<void> {
  if (!(await wants(input.userId, 'productUpdates'))) return;
  const template = instanceProvisionedTemplate({
    instanceName: input.instanceName,
    address: input.address ?? null,
  });
  await sendMail({
    to: input.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: 'instance-provisioned',
    idempotencyKey: `instance-provisioned:${input.userId}:${input.instanceName}`,
  });
}

/** A service of a customer was stopped. */
export async function notifyInstanceStopped(input: Recipient & {
  instanceName: string;
  reason?: string | null;
}): Promise<void> {
  if (!(await wants(input.userId, 'incidents'))) return;
  const template = instanceStoppedTemplate({
    instanceName: input.instanceName,
    reason: input.reason ?? null,
  });
  await sendMail({
    to: input.email,
    subject: template.subject,
    text: template.text,
    html: template.html,
    kind: 'instance-stopped',
    idempotencyKey: `instance-stopped:${input.userId}:${input.instanceName}`,
  });
}

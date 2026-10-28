import { prisma } from '../src/db.js';
import { assertDisposableDatabase } from '../src/lib/test-target.js';

/**
 * Safety net. The suite truncates every table, so it must never be pointed at
 * a database that holds real data. The guard is the one of the platform, so
 * the rule is written once and the same rule applies to the scripts that
 * change data.
 */
assertDisposableDatabase({ label: 'run the tests' });

/**
 * Every test file starts from an empty database. The order matters because of
 * the foreign keys.
 */
const TABLES = [
  'MailJob',
  'MailAlias',
  'Mailbox',
  'MailDomain',
  'DeadLetterJob',
  'AuditLog',
  'WebhookEvent',
  'ProvisioningJob',
  'InstanceEvent',
  'InstanceDomain',
  'TicketEvent',
  'TicketMessage',
  'Ticket',
  'Payment',
  'Invoice',
  'Subscription',
  'OrderItem',
  'Order',
  'Promotion',
  'Instance',
  'ProductOption',
  'ProductPrice',
  'Product',
  'Node',
  'Egg',
  'StaffMember',
  'VerificationToken',
  'EmailChangeRequest',
  'NotificationPreference',
  'Notification',
  'NotificationEvent',
  'MailDelivery',
  'Session',
  'PanelCredential',
  'User',
  'Setting',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE;`);
}

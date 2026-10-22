import { prisma } from '../src/db.js';

/**
 * Every test file starts from an empty database. The order matters because of
 * the foreign keys.
 */
const TABLES = [
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
  'Session',
  'User',
  'Setting',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE;`);
}

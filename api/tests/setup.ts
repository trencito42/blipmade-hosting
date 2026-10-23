import { prisma } from '../src/db.js';

/**
 * Safety net. The suite truncates every table, so it must never be pointed at
 * a database that holds real data.
 */
function assertTestDatabase(): void {
  const url = process.env.DATABASE_URL ?? '';
  const name = url.split('/').pop()?.split('?')[0] ?? '';
  if (!name.endsWith('_test')) {
    throw new Error(
      `Refusing to run the tests against "${name || 'an unknown database'}". The test database name must end with "_test".`,
    );
  }
}

assertTestDatabase();

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
  'PanelCredential',
  'User',
  'Setting',
];

export async function resetDatabase(): Promise<void> {
  await prisma.$executeRawUnsafe(`TRUNCATE TABLE ${TABLES.map((table) => `"${table}"`).join(', ')} CASCADE;`);
}

/**
 * A small window into the database of the journey stack, for the ground truth
 * that the API does not expose. Reads only.
 *   node dbq.mjs "prisma.instance.count({ where: { userId: 'x' } })"
 * The expression is evaluated with `prisma` in scope and the result is
 * printed as JSON. The database name must end in "_test".
 */
import { PrismaClient } from '@prisma/client';

const prisma = new PrismaClient();

const databaseUrl = process.env.DATABASE_URL ?? '';
const databaseName = databaseUrl.split('/').pop()?.split('?')[0] ?? '';
if (!/(^|_)(test|check)$/.test(databaseName)) {
  throw new Error(`Refusing to read "${databaseName}": only a test database is allowed.`);
}

const expression = process.argv[2];
if (!expression) {
  console.error('usage: node dbq.mjs "<expression>"');
  process.exit(2);
}

try {
  const result = await eval(`(async () => (${expression}))()`);
  console.log(JSON.stringify(result, null, 2));
} catch (error) {
  console.log(JSON.stringify({ error: String(error?.message ?? error) }));
}
await prisma.$disconnect();

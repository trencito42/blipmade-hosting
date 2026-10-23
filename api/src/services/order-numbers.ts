import { Prisma } from '@prisma/client';
import { prisma } from '../db.js';

/**
 * The numbers of the orders and of the invoices.
 *
 * Both columns are unique, so two records that are created at the same moment
 * must not compute the same number. The number used to be the number of
 * records plus one, which two records created at the same time computed the
 * same way: one of them failed with an error the customer could do nothing
 * about.
 *
 * The number is handed out by a counter row that is read and raised in one
 * statement, so the database hands out one number per number. The counter
 * starts at the highest number that exists, so a number that was handed out
 * before the counter existed is never handed out again, and a counter that
 * was damaged heals itself.
 */

/** The key of the counter of the orders. */
export const ORDER_SEQUENCE_KEY = 'internal.order.sequence';
/** The key of the counter of the invoices. */
export const INVOICE_SEQUENCE_KEY = 'internal.invoice.sequence';

type NumberedTable = 'Order' | 'Invoice';

interface SequenceOptions {
  /** The key of the counter row. */
  key: string;
  /** The prefix of the numbers, e.g. `BM-`. */
  prefix: string;
  /** The table the numbers live in. */
  table: NumberedTable;
}

function format(value: number, prefix: string): string {
  return `${prefix}${String(value).padStart(5, '0')}`;
}

/**
 * Hands out the next number of the given sequence.
 *
 * The counter is raised in one statement, so two records that are created at
 * the same time never carry the same number and the insert never fails on the
 * unique column.
 */
export async function nextSequenceNumber(options: SequenceOptions): Promise<string> {
  const { key, prefix, table } = options;

  // The name of the table cannot be a parameter of a query, so it is written
  // as an identifier. The table is chosen here and nowhere else.
  const tableName = Prisma.raw(`"${table}"`);
  const pattern = `^${prefix}[0-9]+$`;
  const stripped = `^${prefix}`;

  for (let attempt = 0; attempt < 3; attempt += 1) {
    // The counter is created when it does not exist yet, starting at the
    // highest number that was handed out.
    await prisma.$executeRaw(Prisma.sql`
      INSERT INTO "Setting" ("key", "value", "updatedAt")
      SELECT CAST(${key} AS text),
             jsonb_build_object('value', COALESCE(MAX(NULLIF(regexp_replace(o."number", ${stripped}, ''), '')::int), 0)),
             NOW()
      FROM ${tableName} o
      WHERE o."number" ~ ${pattern}
      ON CONFLICT ("key") DO NOTHING
    `);

    // The counter is raised in one statement, so two records that are created
    // at the same time get two different numbers. The highest number that
    // exists is taken into account, so a counter that was damaged or reset
    // never hands out a number that is already in use.
    const rows = await prisma.$queryRaw<{ value: number }[]>(Prisma.sql`
      UPDATE "Setting"
      SET "value" = jsonb_build_object(
            'value',
            GREATEST(
              CASE WHEN ("value" ->> 'value') ~ '^[0-9]+$' THEN ("value" ->> 'value')::int ELSE 0 END,
              (
                SELECT COALESCE(MAX(NULLIF(regexp_replace(o."number", ${stripped}, ''), '')::int), 0)
                FROM ${tableName} o
                WHERE o."number" ~ ${pattern}
              )
            ) + 1
          ),
          "updatedAt" = NOW()
      WHERE "key" = CAST(${key} AS text)
      RETURNING ("value" ->> 'value')::int AS "value"
    `);

    const value = rows[0]?.value;
    if (typeof value === 'number') return format(value, prefix);
  }

  throw new Error('The platform could not hand out a number.');
}

/** The number of the next order, in the format the platform uses. */
export function nextOrderNumber(): Promise<string> {
  return nextSequenceNumber({ key: ORDER_SEQUENCE_KEY, prefix: 'BM-', table: 'Order' });
}

/** The number of the next invoice, in the format the platform uses. */
export function nextInvoiceNumber(): Promise<string> {
  return nextSequenceNumber({ key: INVOICE_SEQUENCE_KEY, prefix: 'BM-INV-', table: 'Invoice' });
}

import { z } from 'zod';
import { badRequest } from './errors.js';

/**
 * The bounds of the lists that can grow without a bound.
 *
 * A list that is read with "everything" grows with the table: the answer gets
 * bigger, the memory of the process gets bigger and the time of the query
 * grows with the number of rows that are read and thrown away. Every list of
 * the platform is therefore read in pages, and a page never holds more rows
 * than the limit of that list.
 *
 * The page is walked with a cursor and not with an offset. An offset makes the
 * database walk over the rows that are already behind the page, so the tenth
 * page of a table of a million rows reads a million rows to show ten. A cursor
 * says where the last page stopped, so the database goes straight there.
 */

/** The biggest page any list of the platform may answer with. */
export const MAX_PAGE_SIZE = 200;

/** The page a list answers with when the caller does not ask for one. */
export const DEFAULT_PAGE_SIZE = 50;

/** The column a list is ordered by. */
export type SortColumn = 'createdAt' | 'updatedAt' | 'failedAt';

/**
 * Where a page stopped.
 *
 * The row that was the last one of the page is named by the column it is
 * ordered by and by its id. The id is the tiebreaker: many rows can share the
 * same moment, and without the id the boundary of the page would be
 * ambiguous, so a row could be shown twice or be skipped.
 */
export interface PageCursor {
  at: Date;
  id: string;
}

/** The cursor of a page, as it is carried in the query string. */
export function encodeCursor(cursor: PageCursor): string {
  return Buffer.from(`${cursor.at.toISOString()}|${cursor.id}`, 'utf8').toString('base64url');
}

/**
 * Reads a cursor of the query string.
 *
 * A cursor that cannot be read is a cursor that was not written by this
 * function, so it is refused instead of being ignored: a page that is asked
 * for with a broken cursor would silently show the first page again.
 */
export function decodeCursor(value: string | undefined | null): PageCursor | null {
  if (!value) return null;
  let decoded: string;
  try {
    decoded = Buffer.from(value, 'base64url').toString('utf8');
  } catch {
    throw badRequest('The cursor is not a cursor of this platform.');
  }
  const separator = decoded.lastIndexOf('|');
  if (separator <= 0) throw badRequest('The cursor is not a cursor of this platform.');
  const at = new Date(decoded.slice(0, separator));
  if (Number.isNaN(at.getTime())) throw badRequest('The cursor is not a cursor of this platform.');
  const id = decoded.slice(separator + 1);
  if (!id) throw badRequest('The cursor is not a cursor of this platform.');
  return { at, id };
}

export interface PaginationLimits {
  /** The page the list answers with when the caller does not ask for one. */
  defaultSize: number;
  /** The biggest page this list may answer with. */
  maxSize: number;
}

/**
 * The bounds of one list.
 *
 * The limit of the caller is clamped: a number that is too big is brought
 * down to the biggest page of the list, and a number that is not a number at
 * all is the default page. A list never answers with more rows than its own
 * limit, whatever the caller asks for.
 */
export function parsePagination(
  query: unknown,
  limits: PaginationLimits,
): { limit: number; cursor: PageCursor | null } {
  const parsed = z
    .object({
      limit: z.coerce.number().int().min(1).optional(),
      cursor: z.string().optional(),
    })
    .passthrough()
    .parse(query ?? {});

  const limit = Math.min(parsed.limit ?? limits.defaultSize, limits.maxSize);
  return { limit, cursor: decodeCursor(parsed.cursor) };
}

/**
 * The rows that come after the cursor.
 *
 * The rows are ordered by the column and then by the id, and the page starts
 * at the first row that is strictly after the cursor. Both are needed: the
 * column alone cannot separate two rows that share the same moment, and the id
 * alone cannot order the rows.
 */
export function keysetFilter(
  cursor: PageCursor | null,
  column: SortColumn,
): Record<string, unknown> | undefined {
  if (!cursor) return undefined;
  return {
    OR: [{ [column]: { lt: cursor.at } }, { [column]: cursor.at, id: { lt: cursor.id } }],
  };
}

/**
 * The filter of the cursor, added to the filter of the list.
 *
 * The filter of the list and the filter of the cursor are two filters, and
 * they are combined with AND: a page only shows the rows that match the list
 * and that come after the cursor.
 */
export function withCursor<T extends Record<string, unknown>>(
  where: T,
  cursor: PageCursor | null,
  column: SortColumn,
): T {
  const filter = keysetFilter(cursor, column);
  if (!filter) return where;
  const existing = where.AND;
  const and = Array.isArray(existing) ? existing : existing ? [existing] : [];
  return { ...where, AND: [...and, filter] } as T;
}

/** The order of a list that is walked with a cursor. */
export function pageOrder(column: SortColumn): Array<Record<string, 'asc' | 'desc'>> {
  return [{ [column]: 'desc' }, { id: 'desc' }];
}

/**
 * The boundary of the next page.
 *
 * The last row of the page is the boundary of the next one. The page is read
 * with one row more than it shows, so the answer knows whether there is a next
 * page without counting the whole table.
 */
export function nextCursor(
  rows: Array<{ id: string; createdAt?: Date | null; updatedAt?: Date | null; failedAt?: Date | null }>,
  limit: number,
  column: SortColumn,
): { nextCursor: string | null; hasMore: boolean } {
  if (rows.length <= limit) return { nextCursor: null, hasMore: false };
  const last = rows[limit - 1];
  if (!last) return { nextCursor: null, hasMore: false };
  const at = last[column] ?? last.createdAt ?? last.updatedAt ?? last.failedAt;
  if (!at) return { nextCursor: null, hasMore: false };
  return { nextCursor: encodeCursor({ at, id: last.id }), hasMore: true };
}

/** What a list answers with about the page it is showing. */
export interface PageInfo {
  /** The number of the rows of the page. */
  limit: number;
  /** The cursor of the next page, or nothing when the list is over. */
  nextCursor: string | null;
  /** True when there is a page after this one. */
  hasMore: boolean;
}

/**
 * The page of a list and what is known about the page after it.
 *
 * The list is read with one row more than it shows, so the answer knows
 * whether there is a next page without counting the whole table a second
 * time.
 */
export function pageOf<T extends { id: string; createdAt?: Date | null; updatedAt?: Date | null; failedAt?: Date | null }>(
  rows: T[],
  limit: number,
  column: SortColumn,
): { rows: T[]; pagination: PageInfo } {
  const boundary = nextCursor(rows, limit, column);
  return {
    rows: rows.slice(0, limit),
    pagination: { limit, nextCursor: boundary.nextCursor, hasMore: boundary.hasMore },
  };
}

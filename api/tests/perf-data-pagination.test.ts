import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import {
  decodeCursor,
  encodeCursor,
  keysetFilter,
  pageOf,
  parsePagination,
  withCursor,
} from '../src/lib/perf-data-pagination.js';
import { createAdmin, getApp, registerAndLogin, resetDatabase, type TestClient } from './helpers.js';

/**
 * The bounds of the lists of the platform.
 *
 * A list that can grow without a bound makes the answer grow with the table,
 * and a list that cannot be walked past its first page hides the rows that
 * come after it. These tests hold the two: the page never holds more rows
 * than the limit of the list, and the cursor of a page walks the list without
 * showing a row twice and without skipping one.
 */

const CUSTOMER_PASSWORD = 'CorrectHorseBattery9';

describe('the bounds of a list', () => {
  it('never answers with more rows than the limit of the list', () => {
    const { limit } = parsePagination({ limit: '1000' }, { defaultSize: 50, maxSize: 200 });
    expect(limit).toBe(200);

    const small = parsePagination({ limit: '5' }, { defaultSize: 50, maxSize: 200 });
    expect(small.limit).toBe(5);

    const none = parsePagination({}, { defaultSize: 50, maxSize: 200 });
    expect(none.limit).toBe(50);
    expect(none.cursor).toBeNull();
  });

  it('refuses a cursor that was not written by the platform', () => {
    expect(() => parsePagination({ cursor: 'not-a-cursor' }, { defaultSize: 50, maxSize: 200 })).toThrow();
  });

  it('reads a cursor and writes it again', () => {
    const cursor = { at: new Date('2026-01-02T03:04:05.678Z'), id: 'abc' };
    const written = encodeCursor(cursor);
    const read = decodeCursor(written);
    expect(read?.at.toISOString()).toBe(cursor.at.toISOString());
    expect(read?.id).toBe('abc');
  });

  it('keeps the rows that come after the cursor', () => {
    const cursor = { at: new Date('2026-01-02T03:04:05.678Z'), id: 'abc' };
    const filter = keysetFilter(cursor, 'createdAt');
    expect(filter).toEqual({
      OR: [{ createdAt: { lt: cursor.at } }, { createdAt: cursor.at, id: { lt: 'abc' } }],
    });
    // Without a cursor there is no filter at all.
    expect(keysetFilter(null, 'createdAt')).toBeUndefined();
  });

  it('adds the cursor to the filter of the list and keeps the other filters', () => {
    const where = withCursor({ userId: 'u1' }, { at: new Date(), id: 'x' }, 'createdAt') as {
      userId: string;
      AND?: unknown[];
    };
    expect(where.userId).toBe('u1');
    expect(where.AND).toHaveLength(1);
  });

  it('knows whether there is a page after the page', () => {
    const rows = Array.from({ length: 6 }, (_, index) => ({
      id: `id-${index}`,
      createdAt: new Date(2026, 0, 10 - index),
    }));
    const full = pageOf(rows, 5, 'createdAt');
    expect(full.rows).toHaveLength(5);
    expect(full.pagination.hasMore).toBe(true);
    expect(full.pagination.nextCursor).not.toBeNull();

    const last = pageOf(rows.slice(0, 5), 5, 'createdAt');
    expect(last.pagination.hasMore).toBe(false);
    expect(last.pagination.nextCursor).toBeNull();
  });
});

describe('the pages of the lists of the platform', () => {
  let admin: TestClient;
  let customer: TestClient;

  beforeAll(async () => {
    // The tables are emptied first, so the file can be run twice on the same
    // database.
    await resetDatabase();
    const app = await getApp();
    await app.ready();

    const created = await createAdmin(app);
    admin = created.client;

    const registered = await registerAndLogin(app, 'pagination-customer@perf.test', CUSTOMER_PASSWORD);
    customer = registered.client;

    // Enough rows of every kind to walk more than one page.
    const userId = registered.userId;
    // The catalogue is emptied with the rest of the tables, so a product of
    // the test is made here.
    const product = await prisma.product.create({
      data: {
        slug: 'pagination-product',
        name: 'Pagination product',
        category: 'WEB_CMS',
        description: 'A product of the pagination test.',
        icon: 'server',
      },
    });
    for (let index = 0; index < 7; index += 1) {
      await prisma.order.create({
        data: {
          userId,
          number: `PAGE-${index}`,
          status: 'PENDING',
          kind: 'NEW',
          total: 1000,
          currency: 'EUR',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        },
      });
      await prisma.instance.create({
        data: {
          userId,
          productId: product?.id ?? 'none',
          name: `page-srv-${index}`,
          status: 'ONLINE',
          ram: 1024,
          cpu: 100,
          disk: 10240,
          price: 1000,
          currency: 'EUR',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        },
      });
      await prisma.ticket.create({
        data: {
          userId,
          subject: `A question ${index}`,
          category: 'OTHER',
          status: 'OPEN',
          createdAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
          updatedAt: new Date(Date.UTC(2026, 0, 1, 0, index)),
        },
      });
    }
  });

  afterAll(async () => {
    await prisma.order.deleteMany({ where: { number: { startsWith: 'PAGE-' } } });
    await prisma.ticket.deleteMany({ where: { subject: { startsWith: 'A question' } } });
    await prisma.instance.deleteMany({ where: { name: { startsWith: 'page-srv-' } } });
  });

  it('walks the orders of a customer with the cursor, without showing a row twice', async () => {
    const first = await customer.request('GET', '/api/orders?limit=3');
    expect(first.status).toBe(200);
    expect(first.body.orders).toHaveLength(3);
    expect(first.body.pagination.hasMore).toBe(true);
    expect(first.body.pagination.nextCursor).toBeTruthy();

    const second = await customer.request('GET', `/api/orders?limit=3&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`);
    expect(second.status).toBe(200);
    expect(second.body.orders).toHaveLength(3);

    const third = await customer.request('GET', `/api/orders?limit=3&cursor=${encodeURIComponent(second.body.pagination.nextCursor)}`);
    expect(third.body.orders).toHaveLength(1);
    expect(third.body.pagination.hasMore).toBe(false);
    expect(third.body.pagination.nextCursor).toBeNull();

    const ids = [...first.body.orders, ...second.body.orders, ...third.body.orders].map((order: { id: string }) => order.id);
    expect(new Set(ids).size).toBe(7);
  });

  it('walks the services of a customer with the cursor', async () => {
    const first = await customer.request('GET', '/api/instances?limit=3');
    expect(first.status).toBe(200);
    expect(first.body.instances).toHaveLength(3);
    expect(first.body.pagination.nextCursor).toBeTruthy();

    const second = await customer.request('GET', `/api/instances?limit=3&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`);
    expect(second.body.instances).toHaveLength(3);
    const ids = [...first.body.instances, ...second.body.instances].map((instance: { id: string }) => instance.id);
    expect(new Set(ids).size).toBe(6);
  });

  it('walks the tickets of a customer with the cursor', async () => {
    const first = await customer.request('GET', '/api/tickets?limit=4');
    expect(first.status).toBe(200);
    expect(first.body.tickets).toHaveLength(4);
    expect(first.body.pagination.nextCursor).toBeTruthy();

    const second = await customer.request('GET', `/api/tickets?limit=4&cursor=${encodeURIComponent(first.body.pagination.nextCursor)}`);
    expect(second.body.tickets).toHaveLength(3);
    expect(second.body.pagination.hasMore).toBe(false);
  });

  it('holds the page of the lists of the staff to the limit of the list', async () => {
    const customers = await admin.request('GET', '/api/admin/customers?limit=2');
    expect(customers.status).toBe(200);
    expect(customers.body.customers.length).toBeLessThanOrEqual(2);
    expect(customers.body.pagination.limit).toBe(2);

    const orders = await admin.request('GET', '/api/admin/orders?limit=2');
    expect(orders.body.orders.length).toBeLessThanOrEqual(2);

    const tickets = await admin.request('GET', '/api/admin/tickets?limit=2');
    expect(tickets.body.tickets.length).toBeLessThanOrEqual(2);

    const audit = await admin.request('GET', '/api/admin/audit?limit=2');
    expect(audit.body.logs.length).toBeLessThanOrEqual(2);

    const services = await admin.request('GET', '/api/admin/services?limit=2');
    expect(services.body.services.length).toBeLessThanOrEqual(2);
  });

  it('does not let a caller ask for a page that is bigger than the limit of the list', async () => {
    const orders = await admin.request('GET', '/api/admin/orders?limit=100000');
    expect(orders.status).toBe(200);
    expect(orders.body.pagination.limit).toBe(200);
  });

  it('refuses a cursor that is broken', async () => {
    const orders = await admin.request('GET', '/api/admin/orders?cursor=broken');
    expect(orders.status).toBe(400);
  });

  it('keeps the filter of the list when a cursor is used', async () => {
    const first = await admin.request('GET', '/api/admin/customers?search=pagination-customer&limit=1');
    expect(first.status).toBe(200);
    expect(first.body.customers).toHaveLength(1);
    expect(first.body.customers[0].email).toBe('pagination-customer@perf.test');

    const second = await admin.request('GET', `/api/admin/customers?search=pagination-customer&limit=1&cursor=${encodeURIComponent(first.body.pagination.nextCursor ?? '')}`);
    expect(second.status).toBe(200);
    // The search is still applied, so no other customer can slip into the page.
    for (const customerRow of second.body.customers) {
      expect(customerRow.email).toBe('pagination-customer@perf.test');
    }
  });
});

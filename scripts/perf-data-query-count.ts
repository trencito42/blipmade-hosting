#!/usr/bin/env tsx
/**
 * The number of the queries of a request.
 *
 * The script counts the calls of Prisma that every request of the platform
 * makes, so a request that reads the database once per row is seen. The
 * counters are wrapped around the delegates of the client, so nothing of the
 * application has to be changed to count them.
 *
 *   npx tsx ../scripts/perf-data-query-count.mjs
 */
import { prisma } from '../api/src/db.js';
import { buildApp } from '../api/src/app.js';
import { hashPassword } from '../api/src/lib/password.js';
import { countedCalls, startCounting, stopCounting, totalCalls } from '../api/src/lib/perf-data-query-count.js';
import { assertDisposableDatabase } from '../api/src/lib/test-target.js';

/**
 * The measurement empties the tables of the platform, so it may only run
 * against a disposable database. Without this the script would empty the
 * production database as soon as it is run with the environment of the
 * platform.
 */
assertDisposableDatabase({ label: 'empty the tables of the platform for the measurement' });

/** The number of the customers and the number of the rows of every customer. */
const CUSTOMERS = Number(process.env.PERF_CUSTOMERS ?? 20);
const ROWS_PER_CUSTOMER = Number(process.env.PERF_ROWS ?? 5);

interface Seeded {
  adminId: string;
  customerId: string;
  orderId: string;
  ticketId: string;
  instanceId: string;
}

async function seed(): Promise<Seeded> {
  // The tables are emptied first, so the measurement always starts from the
  // same state.
  await prisma.$executeRawUnsafe(
    'TRUNCATE TABLE "AuditLog", "OrderItem", "Order", "Invoice", "Ticket", "Instance", "StaffMember", "Session", "User" CASCADE;',
  );
  const passwordHash = await hashPassword('CorrectHorseBattery9');
  const admin = await prisma.user.create({
    data: { email: 'admin@perf.test', passwordHash, role: 'ADMIN', firstName: 'Perf', lastName: 'Admin', emailVerifiedAt: new Date() },
  });
  await prisma.staffMember.create({ data: { userId: admin.id, permissions: [] } });

  const customers = [];
  for (let index = 0; index < CUSTOMERS; index += 1) {
    const customer = await prisma.user.create({
      data: {
        email: `customer-${index}@perf.test`,
        passwordHash,
        role: 'CUSTOMER',
        firstName: `Customer ${index}`,
        lastName: 'Perf',
        emailVerifiedAt: new Date(),
      },
    });
    customers.push(customer);
  }

  const products = await prisma.product.findMany();
  const product = products[0];

  for (const [customerIndex, customer] of customers.entries()) {
    for (let index = 0; index < ROWS_PER_CUSTOMER; index += 1) {
      const order = await prisma.order.create({
        data: {
          userId: customer.id,
          number: `PERF-${customerIndex}-${index}`,
          status: 'PAID',
          kind: 'NEW',
          total: 1000,
          currency: 'EUR',
        },
      });
      await prisma.orderItem.create({
        data: { orderId: order.id, productId: product?.id ?? 'none', name: 'App', quantity: 1, unitAmount: 1000, total: 1000 },
      });
      await prisma.invoice.create({
        data: { userId: customer.id, orderId: order.id, number: `INV-${order.number}`, status: 'PAID', amount: 1000, total: 1000, currency: 'EUR' },
      });
      await prisma.ticket.create({
        data: { userId: customer.id, subject: 'A question', status: 'OPEN', priority: 'NORMAL', category: 'OTHER' },
      });
      await prisma.instance.create({
        data: { userId: customer.id, name: `srv-${index}`, status: 'ONLINE', price: 1000, currency: 'EUR', productId: product?.id ?? 'none', ram: 1024, cpu: 100, disk: 10240 },
      });
    }
    for (let index = 0; index < ROWS_PER_CUSTOMER; index += 1) {
      await prisma.auditLog.create({ data: { action: 'test.action', targetType: 'user', targetId: customer.id, actorEmail: customer.email } });
    }
  }

  const customer = customers[0]!;
  const order = await prisma.order.findFirst({ where: { userId: customer.id } });
  const ticket = await prisma.ticket.findFirst({ where: { userId: customer.id } });
  const instance = await prisma.instance.findFirst({ where: { userId: customer.id } });
  return {
    adminId: admin.id,
    customerId: customer.id,
    orderId: order!.id,
    ticketId: ticket!.id,
    instanceId: instance!.id,
  };
}

/** Signs a client in and returns a function that calls the API. */
async function signIn(app: Awaited<ReturnType<typeof buildApp>>, email: string) {
  const response = await app.inject({ method: 'POST', url: '/api/auth/login', payload: { email, password: 'CorrectHorseBattery9' } });
  const cookies = (response.cookies ?? []).map((cookie) => `${cookie.name}=${cookie.value}`).join('; ');
  return async (url: string) => {
    const result = await app.inject({ method: 'GET', url, headers: { cookie: cookies } });
    return result.statusCode;
  };
}

async function main(): Promise<void> {
  const seeded = await seed();
  const app = await buildApp();
  await app.ready();

  const call = await signIn(app, 'admin@perf.test');
  const callCustomer = await signIn(app, 'customer-0@perf.test');

  const targets: Array<{ label: string; url: string; run: (url: string) => Promise<number> }> = [
    { label: 'admin overview', url: '/api/admin/overview', run: call },
    { label: 'admin customers', url: '/api/admin/customers', run: call },
    { label: 'admin orders', url: '/api/admin/orders', run: call },
    { label: 'admin services', url: '/api/admin/services', run: call },
    { label: 'admin tickets', url: '/api/admin/tickets', run: call },
    { label: 'admin audit', url: '/api/admin/audit', run: call },
    { label: 'admin promotions', url: '/api/admin/promotions', run: call },
    { label: 'admin dead letters', url: '/api/admin/dead-letters', run: call },
    { label: 'admin customer detail', url: `/api/admin/customers/${seeded.customerId}`, run: call },
    { label: 'admin email delivery', url: '/api/admin/email/delivery', run: call },
    { label: 'admin infrastructure', url: '/api/admin/infrastructure', run: call },
    { label: 'admin pricing', url: '/api/admin/pricing', run: call },
    { label: 'customer domains', url: '/api/domains', run: callCustomer },
    { label: 'customer subscriptions', url: '/api/billing/subscriptions', run: callCustomer },
    { label: 'customer notifications', url: '/api/settings/notifications', run: callCustomer },
    { label: 'customer order detail', url: `/api/orders/${seeded.orderId}`, run: callCustomer },
    { label: 'customer ticket detail', url: `/api/tickets/${seeded.ticketId}`, run: callCustomer },
    { label: 'customer instance detail', url: `/api/instances/${seeded.instanceId}`, run: callCustomer },
    { label: 'customer instances', url: '/api/instances', run: callCustomer },
    { label: 'customer orders', url: '/api/orders', run: callCustomer },
    { label: 'customer tickets', url: '/api/tickets', run: callCustomer },
    { label: 'customer invoices', url: '/api/billing/invoices', run: callCustomer },
    { label: 'customer billing summary', url: '/api/billing/summary', run: callCustomer },
    { label: 'customer settings', url: '/api/settings', run: callCustomer },
  ];

  const report: Array<{ label: string; url: string; status: number; queries: number; detail: string[] }> = [];
  for (const target of targets) {
    startCounting();
    const status = await target.run(target.url);
    stopCounting();
    const total = totalCalls();
    const detail = Object.entries(countedCalls()).map(([label, value]) => `${label}=${value}`);
    report.push({ label: target.label, url: target.url, status, queries: total, detail });
  }

  for (const line of report) {
    console.log(`${line.queries.toString().padStart(4)} queries  ${line.status}  ${line.label.padEnd(26)} ${line.url}`);
    console.log(`        ${line.detail.join('  ')}`);
  }

  await app.close();
  await prisma.$disconnect();
  process.exit(0);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});

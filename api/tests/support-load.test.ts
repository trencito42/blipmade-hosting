import { afterAll, beforeAll, describe, expect, it } from 'vitest';
import { prisma } from '../src/db.js';
import { closeSupportEvents } from '../src/services/support-events.js';
import { closeApp, createAdmin, getApp, registerAndLogin, resetDatabase, type TestClient } from './helpers.js';
import type { FastifyInstance } from 'fastify';

/**
 * A measurement, not a unit test: it runs only with LOAD=1 (and LOAD_USERS=n), against the disposable database.
 *
 *     LOAD=1 LOAD_USERS=100 npx vitest run tests/support-load.test.ts
 *
 * N customers each open a live stream and write one message; one member of the staff has the staff stream open and answers
 * every conversation. It reports how long a message takes to reach the staff stream and how long an answer takes to reach
 * the customer's stream, and that nothing was lost. It runs in one process against one database, so it is a floor, not a
 * promise about production.
 */
const run = process.env.LOAD === '1';
const USERS = Number(process.env.LOAD_USERS ?? 100);

let app: FastifyInstance;
let base = '';

const cookieOf = (client: TestClient) => [...client.cookies.entries()].map(([name, value]) => `${name}=${value}`).join('; ');

async function openStream(client: TestClient, path: string, onEvent: (name: string, data: string) => void): Promise<() => void> {
  const controller = new AbortController();
  const response = await fetch(`${base}${path}`, { headers: { cookie: cookieOf(client) }, signal: controller.signal });
  const reader = response.body!.getReader();
  const decoder = new TextDecoder();
  void (async () => {
    let buffer = '';
    try {
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        buffer += decoder.decode(value);
        let index;
        while ((index = buffer.indexOf('\n\n')) >= 0) {
          const frame = buffer.slice(0, index);
          buffer = buffer.slice(index + 2);
          const name = /event: (\w+)/.exec(frame)?.[1];
          if (name) onEvent(name, /data: (.*)/.exec(frame)?.[1] ?? '');
        }
      }
    } catch {
      /* closed */
    }
  })();
  return () => controller.abort();
}

const percentile = (values: number[], p: number) => [...values].sort((a, b) => a - b)[Math.min(values.length - 1, Math.floor(values.length * p))] ?? 0;

describe.skipIf(!run)('the live support under load', () => {
  beforeAll(async () => {
    await resetDatabase();
    app = await getApp();
    await app.listen({ port: 0, host: '127.0.0.1' });
    const address = app.server.address();
    base = `http://127.0.0.1:${typeof address === 'object' && address ? address.port : 0}`;
  }, 120_000);
  afterAll(async () => {
    await closeSupportEvents();
    await closeApp();
  });

  it('delivers every message and every answer', async () => {
    const { client: admin } = await createAdmin(app);
    const customers: { client: TestClient; ticketId?: string }[] = [];
    for (let i = 0; i < USERS; i++) customers.push({ client: (await registerAndLogin(app, `load${i}@example.com`)).client });

    const sentAt = new Map<string, number>();
    const toStaff: number[] = [];
    const toCustomer: number[] = [];
    const answeredAt = new Map<string, number>();
    const closers: (() => void)[] = [];

    closers.push(await openStream(admin, '/api/admin/support/stream', (name, data) => {
      if (name !== 'message') return;
      const ticketId = (JSON.parse(data) as { ticketId: string }).ticketId;
      const start = sentAt.get(ticketId);
      if (start && !answeredAt.has(ticketId)) toStaff.push(Date.now() - start);
    }));
    for (const entry of customers) {
      closers.push(await openStream(entry.client, '/api/support/stream', (name, data) => {
        if (name !== 'message') return;
        const ticketId = (JSON.parse(data) as { ticketId: string }).ticketId;
        const start = answeredAt.get(ticketId);
        if (start) toCustomer.push(Date.now() - start);
      }));
    }
    await new Promise((resolve) => setTimeout(resolve, 500));

    // All the customers write at once.
    const started = Date.now();
    await Promise.all(customers.map(async (entry) => {
      const created = await entry.client.request('POST', '/api/tickets', { subject: 'Load', body: 'Hello.' });
      entry.ticketId = created.body.ticket.id as string;
    }));
    // A message after creation, timed from the moment it is sent.
    await Promise.all(customers.map(async (entry) => {
      sentAt.set(entry.ticketId!, Date.now());
      await entry.client.request('POST', `/api/tickets/${entry.ticketId}/replies`, { body: 'Are you there?' });
    }));
    await new Promise((resolve) => setTimeout(resolve, 1500));
    // The staff answers all of them.
    await Promise.all(customers.map(async (entry) => {
      answeredAt.set(entry.ticketId!, Date.now());
      await admin.request('POST', `/api/tickets/${entry.ticketId}/replies`, { body: 'Yes.' });
    }));
    await new Promise((resolve) => setTimeout(resolve, 2500));
    for (const close of closers) close();

    const messages = await prisma.ticketMessage.count({ where: { internal: false } });
    console.log(`LOAD users=${USERS} created+wrote in ${Date.now() - started} ms; to staff stream: n=${toStaff.length} p50=${percentile(toStaff, 0.5)} ms p95=${percentile(toStaff, 0.95)} ms max=${Math.max(0, ...toStaff)} ms; to customers: n=${toCustomer.length} p50=${percentile(toCustomer, 0.5)} ms p95=${percentile(toCustomer, 0.95)} ms max=${Math.max(0, ...toCustomer)} ms; messages stored=${messages}`);
    expect(messages).toBe(USERS * 3);
    expect(toStaff.length).toBeGreaterThanOrEqual(USERS);
    expect(toCustomer.length).toBe(USERS);
  }, 300_000);
});

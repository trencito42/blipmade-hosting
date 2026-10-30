import { describe, it } from 'node:test';
import assert from 'node:assert/strict';
import { countLine, latePayments, serviceRows } from '../src/lib/services.ts';
import type { AccountBillingSummary, Instance, MailServiceView, VpsServerView } from '../src/lib/api.ts';

const instance = (overrides: Partial<Instance> = {}): Instance =>
  ({
    id: 'i1', name: 'bot', status: 'online', runtime: { state: 'running', condition: 'serving', checkedAt: null, stale: false },
    product: { slug: 'discord-bot', name: 'Discord Bot', icon: 'bot' }, ram: 512, cpu: 1, disk: 5, price: 249, currency: 'EUR',
    url: 'https://bot.apps.blipmade.com', createdAt: '2026-10-01T00:00:00Z', node: null, credentials: false, subscription: null, ...overrides,
  }) as Instance;

const server = (overrides: Partial<VpsServerView> = {}): VpsServerView => ({
  id: 's1', name: 'api', status: 'active', power: 'running', plan: { slug: 'vps-start', name: 'VPS Start' }, ram: 1024, cpu: 1, disk: 20,
  publicIp: '193.34.214.119', sshPort: 22101, dedicatedIp: false, sshCommand: null, lastError: null, createdAt: '2026-10-01T00:00:00Z', ...overrides,
});

const mail = (overrides: Partial<MailServiceView> = {}): MailServiceView =>
  ({
    id: 'm1', status: 'ACTIVE', plan: { slug: 'email-hosting-starter', name: 'Email Hosting Starter', category: 'EMAIL_HOSTING' },
    limits: { maxDomains: 1, maxMailboxes: 2 }, usage: { domains: 1, mailboxes: 1, storageMb: 0, storageLimitMb: 512 }, domains: [{ name: 'acme.ro' }],
    graceUntil: null, suspendedAt: null, cancelledAt: null, retentionUntil: null, lastError: null, createdAt: '2026-10-01T00:00:00Z', ...overrides,
  }) as unknown as MailServiceView;

const summary = (): AccountBillingSummary => ({
  currency: 'EUR', monthlyEstimate: 1547,
  subscriptions: [
    { id: 'a', serviceKind: 'mail', serviceId: 'm1', instanceId: null, instanceName: 'x', status: 'active', amount: 299, currency: 'EUR', currentPeriodEnd: null, cancelAtPeriodEnd: false },
    { id: 'b', serviceKind: 'vps', serviceId: 's1', instanceId: null, instanceName: 'x', status: 'past_due', amount: 399, currency: 'EUR', currentPeriodEnd: null, cancelAtPeriodEnd: false },
  ],
});

describe('the services of an account', () => {
  it('lists apps, servers and mail together, with the price of each from its subscription', () => {
    const rows = serviceRows({ instances: [instance()], servers: [server()], mail: [mail()], summary: summary() });
    assert.deepEqual(rows.map((row) => row.kind), ['app', 'server', 'mail']);
    assert.equal(rows[1]!.price, 399);
    assert.equal(rows[2]!.price, 299);
    assert.equal(rows[0]!.price, 249);
  });

  it('does not show a price it does not know', () => {
    const rows = serviceRows({ instances: [], servers: [server()], mail: [], summary: null });
    assert.equal(rows[0]!.price, null);
  });

  it('does not draw a server as running when the state is not known', () => {
    const rows = serviceRows({ instances: [], servers: [server({ power: 'unknown' })], mail: [], summary: null });
    assert.equal(rows[0]!.status, 'neutral');
    assert.equal(rows[0]!.statusLabel, 'State unknown');
  });

  it('flags a failed server, a suspended mail plan and a failed app', () => {
    const rows = serviceRows({
      instances: [instance({ status: 'failed' })],
      servers: [server({ status: 'failed' })],
      mail: [mail({ status: 'SUSPENDED' })],
      summary: null,
    });
    assert.ok(rows.every((row) => row.problem));
  });

  it('leaves out what was cancelled', () => {
    const rows = serviceRows({ instances: [], servers: [server({ status: 'cancelled' })], mail: [mail({ status: 'CANCELLED' })], summary: null });
    assert.equal(rows.length, 0);
  });

  it('finds the subscriptions whose payment is late', () => {
    assert.deepEqual(latePayments(summary()).map((entry) => entry.id), ['b']);
    assert.deepEqual(latePayments(null), []);
  });

  it('counts the services in one line', () => {
    const rows = serviceRows({ instances: [instance(), instance({ id: 'i2' })], servers: [server()], mail: [mail()], summary: null });
    assert.equal(countLine(rows), '2 apps and databases · 1 server · 1 mail plan');
  });
});

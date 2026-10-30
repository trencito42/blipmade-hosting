/**
 * Fixtures for the browser checks of the customer area.
 *
 * They are disposable test data, shaped like the answers of the API. They exist only inside the
 * browser test: nothing here is sent anywhere, and nothing here is shown by the product.
 */

const NOW = Date.now();
const iso = (offsetDays) => new Date(NOW + offsetDays * 86_400_000).toISOString();

export const USER = {
  id: 'u1', email: 'ada@example.com', firstName: 'Ada', lastName: 'Lovelace', name: 'Ada Lovelace',
  role: 'CUSTOMER', emailVerified: true, permissions: [],
};

const instance = (id, name, slug, productName, status, extra = {}) => ({
  id, name, status, runtime: { state: status === 'online' ? 'running' : null, condition: status === 'online' ? 'serving' : null, checkedAt: iso(0), stale: false },
  product: { slug, name: productName, icon: 'box' }, ram: 1024, cpu: 1, disk: 10, price: 349, currency: 'EUR',
  url: `https://${name}.apps.blipmade.com`, createdAt: iso(-12), node: { name: 'node-1' }, credentials: false,
  subscription: { status: 'active', currentPeriodEnd: iso(18) }, ...extra,
});

export const INSTANCES = [
  instance('i1', 'code-server-exeuw', 'code-server', 'Code Server', 'online'),
  instance('i2', 'mc-survival-with-a-very-long-name-that-must-be-cut', 'minecraft-paper', 'Minecraft Paper', 'degraded', { ram: 4096, cpu: 2, disk: 40, price: 1349 }),
  instance('i3', 'orders-db', 'postgresql', 'PostgreSQL', 'online', { url: null, price: 449 }),
];

export const SUMMARY = {
  currency: 'EUR', monthlyEstimate: 349 + 1349 + 449 + 299 + 399,
  monthlyByCurrency: [{ currency: 'EUR', amount: 349 + 1349 + 449 + 299 + 399 }],
  nextRenewal: { at: iso(6), amount: 299, currency: 'EUR', subscriptionId: 's-mail' },
  currentPeriodEnd: iso(6), paymentMethod: null, hasStripeCustomer: true,
  instances: [], cancellations: [], pendingRenewals: [],
  subscriptions: [
    { id: 's1', instanceId: 'i1', serviceKind: 'server', serviceId: 'i1', instanceName: 'code-server-exeuw', status: 'active', amount: 349, currency: 'EUR', currentPeriodEnd: iso(18), cancelAtPeriodEnd: false, stripeManaged: true },
    { id: 's2', instanceId: 'i2', serviceKind: 'server', serviceId: 'i2', instanceName: 'mc-survival', status: 'active', amount: 1349, currency: 'EUR', currentPeriodEnd: iso(11), cancelAtPeriodEnd: false, stripeManaged: true },
    { id: 's-mail', instanceId: null, serviceKind: 'mail', serviceId: 'm1', instanceName: 'Email Hosting Starter', status: 'active', amount: 299, currency: 'EUR', currentPeriodEnd: iso(6), cancelAtPeriodEnd: false, stripeManaged: true },
    { id: 's-vps', instanceId: null, serviceKind: 'vps', serviceId: 'v1', instanceName: 'api-prod', status: 'past_due', amount: 399, currency: 'EUR', currentPeriodEnd: iso(-2), cancelAtPeriodEnd: false, stripeManaged: true },
  ],
};

export const EMPTY_SUMMARY = { currency: 'EUR', monthlyEstimate: 0, monthlyByCurrency: [], nextRenewal: null, currentPeriodEnd: null, paymentMethod: null, hasStripeCustomer: false, instances: [], cancellations: [], pendingRenewals: [], subscriptions: [] };

export const SERVERS = [
  { id: 'v1', name: 'api-prod', status: 'active', power: 'running', plan: { slug: 'vps-start', name: 'VPS Start' }, ram: 1024, cpu: 1, disk: 20, publicIp: '193.34.214.119', sshPort: 22101, dedicatedIp: false, sshCommand: 'ssh -p 22101 debian@193.34.214.119', lastError: null, createdAt: iso(-3) },
];

export const MAIL = [
  { id: 'm1', status: 'ACTIVE', plan: { slug: 'email-hosting-starter', name: 'Email Hosting Starter', category: 'EMAIL_HOSTING' },
    limits: { maxDomains: 1, maxMailboxes: 2, maxAliases: 20, maxForwarding: 3, totalStorageMb: 512, mailboxQuotaMb: 256, sendLimit: 100, sendInterval: 'HOURLY' },
    usage: { domains: 1, mailboxes: 1, storageMb: 0, storageLimitMb: 512 }, domains: [{ id: 'd1', name: 'acme.ro', ownershipStatus: 'VERIFIED', status: 'ACTIVE' }],
    graceUntil: null, suspendedAt: null, cancelledAt: null, retentionUntil: null, lastError: null, createdAt: iso(-1), webmailUrl: 'https://mail.blipmade.com' },
];

export const DOMAINS = [
  { id: 'dm1', instanceId: 'i1', instanceName: 'code-server-exeuw', hostname: 'code-server-exeuw.apps.blipmade.com', status: 'active', targetPort: 30000, platform: true, addressChangeAvailableAt: null, dnsRecords: [], lastError: null,
    verification: { host: null, token: null, verified: true, verifiedAt: iso(-12), expiresAt: null, instructions: null } },
  { id: 'dm2', instanceId: 'i1', instanceName: 'code-server-exeuw', hostname: 'code.acme.ro', status: 'pending_dns', targetPort: 30000, platform: false, addressChangeAvailableAt: null,
    dnsRecords: [{ name: 'code.acme.ro', type: 'A', value: '193.34.214.143' }], lastError: null,
    verification: { host: '_blipmade-verify.code.acme.ro', token: 'abc123', verified: false, verifiedAt: null, expiresAt: iso(2), instructions: 'Add a TXT record' } },
];

export const TICKETS = [
  { id: 't1', number: 12, subject: 'The server does not start after the restart', category: 'technical', priority: 'normal', status: 'awaiting_customer', instanceId: 'i2', instanceName: 'mc-survival', serviceName: 'mc-survival', createdAt: iso(-4), updatedAt: iso(-1), lastReplyAt: iso(-1), assignedTo: 'Support', messageCount: 4 },
];

export const NOTIFICATIONS = [
  { id: 'n1', category: 'orders_billing', title: 'Your payment of €2.99 went through', body: 'The payment for the order BM-00019 was confirmed.', actionUrl: '/app/billing', actionLabel: 'Open the billing', readAt: null, createdAt: iso(-0.1) },
  { id: 'n2', category: 'hosting_services', title: 'Code Server is ready', body: 'The service Code Server is ready and it answers.', actionUrl: '/app/instances/i1', actionLabel: 'Open the service', readAt: iso(-1), createdAt: iso(-2) },
];

export const EVENTS = [
  { id: 'e1', type: 'runtime_state', message: 'The node reported the state "running" for this instance at 12:00. The platform still shows it as online.', createdAt: iso(-0.01) },
  { id: 'e2', type: 'files', message: 'Saved /server.properties.', createdAt: iso(-0.5) },
];

/** The answers of the API for one kind of account. */
export function answers(kind) {
  const empty = kind === 'new';
  return {
    'GET /auth/session': { user: USER },
    'GET /instances': { instances: empty ? [] : INSTANCES },
    'GET /billing/summary': empty ? EMPTY_SUMMARY : SUMMARY,
    'GET /billing/subscriptions': { subscriptions: empty ? [] : SUMMARY.subscriptions },
    'GET /billing/invoices': { invoices: empty ? [] : [{ id: 'inv1', number: 'BM-INV-00004', status: 'paid', amount: 299, tax: 0, total: 299, currency: 'EUR', hostedUrl: null, pdfUrl: null, billingAddress: null, createdAt: iso(-3), periodStart: iso(-3), periodEnd: iso(27) }] },
    'GET /vps': { servers: empty ? [] : SERVERS },
    'GET /mail/services': { services: empty ? [] : MAIL },
    'GET /mail/plans': { plans: [] },
    'GET /mail/domains': { domains: [] },
    'GET /domains': { domains: empty ? [] : DOMAINS },
    'GET /tickets': { tickets: empty ? [] : TICKETS },
    'GET /notifications/unread-count': { unread: empty ? 0 : 1 },
    'GET /notifications': { notifications: empty ? [] : NOTIFICATIONS, nextCursor: null, unread: empty ? 0 : 1 },
  };
}

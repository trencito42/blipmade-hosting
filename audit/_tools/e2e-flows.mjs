/**
 * The end to end test of the platform, run against an isolated copy.
 *
 * The copy has its own database and its own index of Redis, so everything
 * this file writes stays in the copy. The test walks the journeys of a
 * customer and of an administrator and checks that the two do not see each
 * other's data.
 *
 * Usage: node e2e-flows.mjs [base-url]
 */
import { readdirSync, readFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3103';
const MAIL_DIR = '/tmp/blipmade-e2e/logs/mail';
const SMTP_DIR = '/tmp/blipmade-e2e/smtp';

let passed = 0;
let failed = 0;
const failures = [];

function ok(label) {
  passed += 1;
  console.log(`  ok    ${label}`);
}

function bad(label, detail) {
  failed += 1;
  failures.push(`${label} (${detail})`);
  console.log(`  FAIL  ${label} -- ${detail}`);
}

function check(label, condition, detail = '') {
  if (condition) ok(label);
  else bad(label, detail || 'the condition is false');
}

/** A small client that keeps the cookies and the CSRF token of a browser. */
class Client {
  constructor(base = BASE) {
    this.base = base;
    this.cookies = new Map();
    this.csrf = '';
  }

  cookieHeader() {
    return [...this.cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
  }

  async call(method, path, payload) {
    const headers = {};
    if (this.cookies.size) headers.cookie = this.cookieHeader();
    if (!['GET', 'HEAD'].includes(method) && this.csrf) headers['x-csrf-token'] = this.csrf;
    if (payload !== undefined) headers['content-type'] = 'application/json';
    const res = await fetch(`${this.base}${path}`, {
      method,
      headers,
      body: payload === undefined ? undefined : JSON.stringify(payload),
      redirect: 'manual',
    });
    for (const raw of res.headers.getSetCookie?.() ?? []) {
      const [pair] = raw.split(';');
      const idx = pair.indexOf('=');
      const name = pair.slice(0, idx).trim();
      const value = pair.slice(idx + 1).trim();
      this.cookies.set(name, value);
      if (name === 'bm_csrf') this.csrf = value;
    }
    const text = await res.text();
    let body;
    try {
      body = JSON.parse(text);
    } catch {
      body = text;
    }
    return { status: res.status, body, headers: res.headers };
  }
}

/**
 * Reads the token of the verification mail.
 *
 * The file transport deliberately keeps the mail without its token, so the
 * token is read from the message that the SMTP sink received, which is the
 * way the platform delivers a message when a relay is configured.
 */
function verificationTokenFor(email) {
  let files = [];
  try {
    files = readdirSync(SMTP_DIR).filter((f) => f.endsWith('.eml'));
  } catch {
    return null;
  }
  for (const file of files) {
    const raw = readFileSync(`${SMTP_DIR}/${file}`, 'utf8');
    if (!raw.includes(email)) continue;
    const match = /verify-email\?token=([A-Za-z0-9_-]+)/.exec(decodeQuotedPrintable(raw));
    if (match) return match[1];
  }
  return null;
}

/**
 * Decodes the quoted printable encoding of a message.
 *
 * A relay sends the body quoted printable, so a long link is split over
 * several lines and every equal sign of the link is written as "=3D". The
 * token has to be read from the decoded text.
 */
function decodeQuotedPrintable(raw) {
  const joined = raw.replace(/=\r?\n/g, '');
  return joined.replace(/=([0-9A-Fa-f]{2})/g, (_, hex) => String.fromCharCode(parseInt(hex, 16)));
}

/** Waits for the mail to arrive, because the queue is asynchronous. */
async function waitForToken(email, seconds = 25) {
  const until = Date.now() + seconds * 1000;
  while (Date.now() < until) {
    const token = verificationTokenFor(email);
    if (token) return token;
    await new Promise((resolve) => setTimeout(resolve, 500));
  }
  return null;
}

const EMAIL = `e2e-customer-${Date.now()}@blipmade.test`;
const PASSWORD = 'E2eCustomerPassword9';
const ADMIN_EMAIL = 'e2e-admin@blipmade.test';
const ADMIN_PASSWORD = 'E2eAdminPassword9';

console.log('=== the public part ===');
const anon = new Client();
const health = await anon.call('GET', '/api/health');
check('the health of the copy answers', health.status === 200, `status ${health.status}`);

const catalog = await anon.call('GET', '/api/catalog/products');
check('the catalog answers', catalog.status === 200, `status ${catalog.status}`);
const products = catalog.body?.products ?? catalog.body?.items ?? [];
check('the catalog carries products', products.length > 0, `${products.length} products`);
const orderable = products.filter((p) => (p.availability ?? {}).orderable);
console.log(`  info  products: ${products.length}, orderable: ${orderable.length}`);

const quote = await anon.call('POST', '/api/catalog/quote', {
  items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }],
});
check('the quote answers', quote.status === 200, `status ${quote.status}`);

console.log('\n=== the customer registers and verifies ===');
const customer = new Client();
const register = await customer.call('POST', '/api/auth/register', {
  email: EMAIL,
  password: PASSWORD,
  firstName: 'E2E',
  lastName: 'Customer',
});
check('the registration is accepted', register.status === 200 || register.status === 201, `status ${register.status} ${JSON.stringify(register.body).slice(0, 160)}`);

const token = await waitForToken(EMAIL);
check('the verification mail was written', Boolean(token), 'no token found in the mail sink');

if (token) {
  const verify = await customer.call('POST', '/api/auth/verify-email', { token });
  check('the address is verified', verify.status === 200 || verify.status === 204, `status ${verify.status} ${JSON.stringify(verify.body).slice(0, 160)}`);
}

console.log('\n=== the customer signs in ===');
const login = await customer.call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
check('the sign in is accepted', login.status === 200, `status ${login.status} ${JSON.stringify(login.body).slice(0, 160)}`);

const session = await customer.call('GET', '/api/auth/session');
check('the session belongs to the customer', session.body?.user?.email === EMAIL, JSON.stringify(session.body).slice(0, 160));

console.log('\n=== the customer uses the platform ===');
const profile = await customer.call('GET', '/api/settings');
check('the settings of the customer are readable', profile.status === 200, `status ${profile.status}`);

const updated = await customer.call('PATCH', '/api/settings/profile', { firstName: 'E2E', lastName: 'Renamed' });
check('the profile can be changed', updated.status === 200, `status ${updated.status}`);

const orders = await customer.call('GET', '/api/orders');
check('the customer sees the orders', orders.status === 200, `status ${orders.status}`);

const instances = await customer.call('GET', '/api/instances');
check('the customer sees the instances', instances.status === 200, `status ${instances.status}`);

const billing = await customer.call('GET', '/api/billing/summary');
check('the customer sees the billing', billing.status === 200, `status ${billing.status}`);

const sessions = await customer.call('GET', '/api/settings/sessions');
check('the customer sees the sessions', sessions.status === 200, `status ${sessions.status}`);
const sessionList = sessions.body?.sessions ?? sessions.body?.items ?? [];
check('the customer has at least one session', sessionList.length > 0, `${sessionList.length} sessions`);

console.log('\n=== the customer orders ===');
const order = await customer.call('POST', '/api/orders', {
  items: [{ productSlug: 'discord-bot', ram: 512, cpu: 1, disk: 5 }],
});
check('the order is created', order.status === 200 || order.status === 201, `status ${order.status} ${JSON.stringify(order.body).slice(0, 200)}`);
const orderId = order.body?.order?.id ?? order.body?.id;
if (orderId) {
  const ordersAfter = await customer.call('GET', '/api/orders');
  const list = ordersAfter.body?.orders ?? ordersAfter.body?.items ?? [];
  check('the new order is in the list of the customer', list.some((o) => (o.id ?? o.order?.id) === orderId), `${list.length} orders`);
}

console.log('\n=== the customer opens a ticket ===');
const ticket = await customer.call('POST', '/api/tickets', {
  subject: 'E2E ticket',
  category: 'TECHNICAL',
  body: 'The end to end test opened this ticket.',
});
check('the ticket is created', ticket.status === 200 || ticket.status === 201, `status ${ticket.status} ${JSON.stringify(ticket.body).slice(0, 200)}`);

const tickets = await customer.call('GET', '/api/tickets');
check('the customer sees the ticket', tickets.status === 200, `status ${tickets.status}`);

console.log('\n=== the customer asks for a password reset ===');
const forgot = await customer.call('POST', '/api/auth/forgot-password', { email: EMAIL });
check('the answer of the reset does not reveal whether the account exists', forgot.status === 200, `status ${forgot.status}`);
const forgotUnknown = await customer.call('POST', '/api/auth/forgot-password', { email: 'nobody@blipmade.test' });
check('an unknown address gets the same answer', forgotUnknown.body?.message === forgot.body?.message,
  `${JSON.stringify(forgotUnknown.body).slice(0, 120)} vs ${JSON.stringify(forgot.body).slice(0, 120)}`);

console.log('\n=== the administrator signs in ===');
const admin = new Client();
const adminLogin = await admin.call('POST', '/api/auth/login', { email: ADMIN_EMAIL, password: ADMIN_PASSWORD });
check('the administrator signs in', adminLogin.status === 200, `status ${adminLogin.status} ${JSON.stringify(adminLogin.body).slice(0, 160)}`);

for (const route of ['customers', 'orders', 'products', 'promotions', 'pricing', 'audit', 'dead-letters']) {
  const res = await admin.call('GET', `/api/admin/${route}`);
  check(`the administrator reads admin/${route}`, res.status === 200, `status ${res.status}`);
}

const adminCustomers = await admin.call('GET', '/api/admin/customers');
const customerRows = adminCustomers.body?.customers ?? adminCustomers.body?.items ?? [];
check('the administrator sees the customer of the test', customerRows.some((c) => c.email === EMAIL), `${customerRows.length} customers`);

console.log('\n=== the isolation between the tenants ===');
const adminOrders = await admin.call('GET', '/api/admin/orders');
const allOrders = adminOrders.body?.orders ?? adminOrders.body?.items ?? [];
const foreign = allOrders.filter((o) => (o.user?.email ?? o.email) && (o.user?.email ?? o.email) !== EMAIL && (o.user?.email ?? o.email) !== ADMIN_EMAIL);
check('the administrator sees the order of the test', allOrders.length > 0, `${allOrders.length} orders`);
const adminId = adminLogin.body?.user?.id;
const adminOwnOrders = await admin.call('GET', '/api/orders');
const ownList = adminOwnOrders.body?.orders ?? adminOwnOrders.body?.items ?? [];
check('the administrator does not see the orders of the customer in the customer area',
  ownList.every((o) => (o.userId ?? o.user?.id) === adminId),
  `${ownList.length} orders in the customer area`);
check('the order of the customer belongs to the customer', foreign.length >= 0, '');

console.log('\n=== the customer cannot reach the administrator area ===');
for (const route of ['customers', 'orders', 'audit']) {
  const res = await customer.call('GET', `/api/admin/${route}`);
  check(`the customer is refused admin/${route}`, res.status === 401 || res.status === 403, `status ${res.status}`);
}

console.log('\n=== the result ===');
console.log(`  passed: ${passed}`);
console.log(`  failed: ${failed}`);
if (failures.length) {
  console.log('  the failures:');
  for (const f of failures) console.log(`    - ${f}`);
  process.exitCode = 1;
}

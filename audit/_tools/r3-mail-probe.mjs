/**
 * Proves that the platform really delivers a message over SMTP.
 *
 * The probe registers a customer on the isolated copy, waits for the message
 * that the platform delivers and writes down the raw message the relay
 * received. When the copy runs without a relay, the same probe shows the
 * file transport instead: the file that holds the message and the report the
 * platform writes about it.
 *
 * Usage: node audit/_tools/r3-mail-probe.mjs [base url] [email] [password]
 */
import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3113';
const EMAIL = process.argv[3] ?? 'r3-audit-customer@blipmade.test';
const PASSWORD = process.argv[4] ?? 'R3AuditCustomerPassword9';
const SMTP_DIR = process.env.R3_SMTP_DIR ?? '/tmp/blipmade-r3/smtp';
const MAIL_DIR = process.env.R3_MAIL_DIR ?? '/tmp/blipmade-r3/logs/mail';

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

function listFiles(dir) {
  try {
    return readdirSync(dir).filter((name) => !name.endsWith('.log'));
  } catch {
    return [];
  }
}

/** The message the relay received for this address, if there is one. */
function capturedMessage(email) {
  for (const name of listFiles(SMTP_DIR).sort()) {
    if (!name.endsWith('.eml')) continue;
    const raw = readFileSync(join(SMTP_DIR, name), 'utf8');
    if (raw.includes(email)) return { name, raw };
  }
  return null;
}

const anon = new Client();

console.log('=== what the platform says about its mail ===');
const health = await anon.call('GET', '/api/health');
console.log(`  GET /api/health -> ${health.status}`);
console.log(`  transport   : ${health.body?.mail}`);
console.log(`  configured  : ${health.body?.mailDelivery?.configured}`);
console.log(`  counts      : ${JSON.stringify(health.body?.mailDelivery?.counts)}`);

console.log('\n=== the customer asks for a message ===');
const customer = new Client();
const register = await customer.call('POST', '/api/auth/register', {
  email: EMAIL,
  password: PASSWORD,
  firstName: 'R3',
  lastName: 'Audit',
});
console.log(`  POST /api/auth/register -> ${register.status}`);
console.log(`  answer      : ${JSON.stringify(register.body)}`);

if (register.status === 409 || register.status === 401) {
  const login = await customer.call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
  console.log(`  POST /api/auth/login   -> ${login.status}`);
}

console.log('\n=== the message the relay received ===');
const until = Date.now() + 30_000;
let captured = null;
while (Date.now() < until) {
  captured = capturedMessage(EMAIL);
  if (captured) break;
  await new Promise((resolve) => setTimeout(resolve, 500));
}

if (captured) {
  console.log(`  file        : ${join(SMTP_DIR, captured.name)}`);
  console.log(`  bytes       : ${Buffer.byteLength(captured.raw, 'utf8')}`);
  console.log('  --- the raw message ------------------------------------------------');
  for (const line of captured.raw.split('\n')) console.log(`  | ${line}`);
  console.log('  --------------------------------------------------------------------');
} else {
  console.log(`  NO MESSAGE was received by the sink in ${SMTP_DIR}`);
}

console.log('\n=== the report of the platform about the message ===');
const admin = new Client();
const adminLogin = await admin.call('POST', '/api/auth/login', {
  email: 'r3-admin@blipmade.test',
  password: 'R3AuditAdminPassword9',
});
console.log(`  POST /api/auth/login (administrator) -> ${adminLogin.status}`);
const report = await admin.call('GET', '/api/admin/email/delivery');
console.log(`  GET /api/admin/email/delivery -> ${report.status}`);
console.log(`  transport : ${report.body?.email?.transport}`);
console.log(`  configured: ${report.body?.email?.configured}`);
console.log(`  counts    : ${JSON.stringify(report.body?.email?.counts)}`);
console.log(`  queue     : ${JSON.stringify(report.body?.email?.queue)}`);
for (const message of report.body?.email?.messages ?? []) {
  console.log(
    `  message   : kind=${message.kind} to=${message.to} state=${message.state} attempts=${message.attempts} deliveredAt=${message.deliveredAt}`,
  );
}

console.log('\n=== the file transport ===');
const files = listFiles(MAIL_DIR).filter((name) => name.endsWith('.json'));
console.log(`  directory  : ${MAIL_DIR}`);
console.log(`  files      : ${files.length}`);
for (const name of files.slice(0, 3)) {
  const path = join(MAIL_DIR, name);
  const info = statSync(path);
  console.log(`    ${name}  ${info.size} bytes  mode ${(info.mode & 0o777).toString(8)}`);
}
if (files.length) {
  const raw = readFileSync(join(MAIL_DIR, files[0]), 'utf8');
  console.log('  --- the first file of the file transport -----------------------------');
  for (const line of raw.split('\n')) console.log(`  | ${line}`);
  console.log('  --------------------------------------------------------------------');
}

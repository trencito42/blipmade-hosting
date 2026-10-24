/**
 * Asks the isolated copy to route a hostname and writes down its answer.
 *
 * The probe claims a hostname for an instance of the copy, gives the proof of
 * ownership to the stand-in for the resolver (audit/_tools/r3-dns-stub.mjs)
 * and asks the platform to route the hostname. The answer is printed as it
 * comes, so the state of the hostname and the reason it is not routed can be
 * read from the evidence.
 *
 * Usage: node audit/_tools/r3-domain-probe.mjs [base url] [hostname] [email] [password]
 */
import { writeFileSync } from 'node:fs';

const BASE = process.argv[2] ?? 'http://127.0.0.1:3113';
const HOSTNAME = process.argv[3] ?? 'r3-probe.example.test';
const EMAIL = process.argv[4] ?? 'r3-audit-customer@blipmade.test';
const PASSWORD = process.argv[5] ?? 'R3AuditCustomerPassword9';
const STUB_FILE = process.env.R3_DNS_STUB_FILE ?? '/tmp/blipmade-r3/dns-stub.json';

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

const customer = new Client();

console.log('=== the customer signs in ===');
const login = await customer.call('POST', '/api/auth/login', { email: EMAIL, password: PASSWORD });
console.log(`  POST /api/auth/login -> ${login.status}`);
if (login.status !== 200) {
  console.log(`  answer     : ${JSON.stringify(login.body)}`);
  process.exit(1);
}

console.log('\n=== the instances of the customer ===');
const instances = await customer.call('GET', '/api/instances');
const list = instances.body?.instances ?? instances.body?.items ?? [];
console.log(`  GET /api/instances -> ${instances.status}, ${list.length} instance(s)`);
for (const instance of list) console.log(`    ${instance.id}  ${instance.name}  ${instance.status}`);
const instance = list[0];
if (!instance) {
  console.log('  There is no instance. Run audit/_tools/r3-seed-instance.mjs first.');
  process.exit(1);
}

console.log('\n=== the customer claims the hostname ===');
const claim = await customer.call('POST', `/api/instances/${instance.id}/domains`, { hostname: HOSTNAME });
console.log(`  POST /api/instances/${instance.id}/domains -> ${claim.status}`);
console.log(`  answer     : ${JSON.stringify(claim.body, null, 2)}`);

const domain = claim.body?.domain;
if (!domain?.verification?.token) {
  console.log('  The hostname was not claimed, so there is nothing to prove.');
  process.exit(1);
}

console.log('\n=== the proof of ownership is given to the resolver ===');
writeFileSync(
  STUB_FILE,
  JSON.stringify({ host: domain.verification.host, token: domain.verification.token }, null, 2),
  'utf8',
);
console.log(`  ${domain.verification.host} -> ${domain.verification.token}`);
console.log(`  written to ${STUB_FILE}`);

console.log('\n=== the platform is asked to route the hostname ===');
const verify = await customer.call('POST', `/api/domains/${domain.id}/verify`);
console.log(`  POST /api/domains/${domain.id}/verify -> ${verify.status}`);
console.log(`  answer     : ${JSON.stringify(verify.body, null, 2)}`);

console.log('\n=== the hostname as the customer sees it ===');
const listed = await customer.call('GET', '/api/domains');
console.log(`  GET /api/domains -> ${listed.status}`);
console.log(`  answer     : ${JSON.stringify(listed.body, null, 2)}`);

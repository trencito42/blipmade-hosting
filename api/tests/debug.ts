import { buildApp } from '../src/app.js';
import { prisma } from '../src/db.js';
import { hashPassword } from '../src/lib/password.js';

const app = await buildApp();

await prisma.$executeRawUnsafe(
  'TRUNCATE TABLE "AuditLog","WebhookEvent","ProvisioningJob","InstanceEvent","InstanceDomain","TicketEvent","TicketMessage","Ticket","Payment","Invoice","Subscription","OrderItem","Order","Promotion","Instance","ProductOption","ProductPrice","Product","Node","Egg","StaffMember","VerificationToken","Session","User","Setting" CASCADE;',
);

function cookieHeader(cookies: Map<string, string>) {
  return [...cookies.entries()].map(([k, v]) => `${k}=${v}`).join('; ');
}

const cookies = new Map<string, string>();
let csrf = '';

async function call(method: string, url: string, payload?: unknown) {
  const headers: Record<string, string> = {};
  if (cookies.size) headers.cookie = cookieHeader(cookies);
  if (!['GET', 'HEAD'].includes(method) && csrf) headers['x-csrf-token'] = csrf;
  const res = await app.inject({ method: method as never, url, payload: payload as never, headers });
  for (const c of res.cookies ?? []) {
    cookies.set(c.name, c.value);
    if (c.name === 'bm_csrf') csrf = c.value;
  }
  let body: unknown;
  try {
    body = JSON.parse(res.body);
  } catch {
    body = res.body;
  }
  return { status: res.statusCode, body, headers: res.headers };
}

console.log('--- bootstrap (GET /api/health) ---');
const boot = await call('GET', '/api/health');
console.log(boot.status, 'csrf cookie present:', cookies.has('bm_csrf'));

console.log('\n--- register ---');
const password = await hashPassword('CorrectHorseBattery9');
const user = await prisma.user.create({
  data: { email: 'debug@example.com', passwordHash: password, emailVerifiedAt: new Date() },
});
console.log('user created', user.id);

console.log('\n--- product ---');
const product = await prisma.product.create({
  data: {
    slug: 'wordpress',
    name: 'WordPress',
    category: 'WEB_CMS',
    description: 'A website and blog platform.',
    icon: 'globe',
    minRam: 512,
    minCpu: 1,
    minDisk: 5,
    deployable: true,
    prices: { create: { period: 'MONTHLY', baseAmount: 149, ramPerGb: 60, cpuPerUnit: 40, diskPerGb: 2, currency: 'EUR' } },
  },
});

console.log('\n--- quote with csrf ---');
const quote = await call('POST', '/api/catalog/quote', {
  items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }],
});
console.log(quote.status, JSON.stringify(quote.body));

console.log('\n--- login flood (rate limit) ---');
for (let i = 0; i < 14; i++) {
  const res = await call('POST', '/api/auth/login', { email: 'debug@example.com', password: 'WrongPassword123' });
  if (i === 0 || res.status !== 401) console.log(`attempt ${i}: ${res.status} ${JSON.stringify(res.body).slice(0, 120)}`);
}

console.log('\n--- order + webhook ---');
const order = await call('POST', '/api/orders', { items: [{ productSlug: 'wordpress', ram: 512, cpu: 1, disk: 5 }] });
console.log('order:', order.status, JSON.stringify(order.body).slice(0, 200));
const orderId = order.body?.order?.id;

const hook = await call('POST', '/api/webhooks/stripe/test', {
  id: 'evt_debug_1',
  type: 'checkout.session.completed',
  orderId,
});
console.log('webhook:', hook.status, JSON.stringify(hook.body));

const events = await prisma.webhookEvent.findMany();
console.log('webhook events:', JSON.stringify(events, null, 1).slice(0, 1200));

const instances = await prisma.instance.findMany();
console.log('instances:', instances.length);

await app.close();
await prisma.$disconnect();

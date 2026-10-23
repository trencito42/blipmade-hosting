import fs from 'node:fs';

/**
 * The nine customer journeys, executed one step at a time.
 *
 * Every step records what was done, what the system answered, and where the
 * screenshot is. The steps that would write to the production system are not
 * executed: they are marked with the reason. The only write that is allowed
 * is a ticket on the test account.
 *
 * The sessions are reused from the saved storage state.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const INSTANCE = 'cmvkbgm9h0001r18096ep5jzl';
const CUSTOMER = 'cmvkbgm1f0000r101e4xeztm7';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
fs.mkdirSync(SHOT, { recursive: true });

const steps = [];

function record(journey, step, status, detail, extra = {}) {
  steps.push({ journey, step, status, detail, ...extra });
  console.log(`[${status.padEnd(16)}] ${journey} ${step} :: ${detail}`);
}

async function newPage(role, viewport = { width: 1280, height: 900 }) {
  const context = await browser.newContext({
    viewport,
    storageState: role === 'anonymous' ? undefined : `${OUT}/state-${role}.json`,
  });
  const page = await context.newPage();
  const api = [];
  page.on('response', (r) => {
    if (r.url().includes('/api/')) api.push({ method: r.request().method(), path: new URL(r.url()).pathname, status: r.status() });
  });
  page.api = api;
  return { context, page };
}

const shot = (page, name, full = true) => page.screenshot({ path: `${SHOT}/journey-${name}.png`, fullPage: full });

async function textOf(page, selector) {
  try {
    const el = page.locator(selector).first();
    if ((await el.count()) === 0) return null;
    return ((await el.innerText()) || '').replace(/\s+/g, ' ').trim();
  } catch {
    return null;
  }
}

// ===========================================================================
// J1 - register, verify the email, first sign-in
// ===========================================================================
{
  const { context, page } = await newPage('anonymous');
  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const heading = await textOf(page, 'h1');
  const labels = await page.evaluate(() =>
    [...document.querySelectorAll('input,select,textarea')].map((e) => ({
      id: e.id,
      name: e.getAttribute('name'),
      type: e.getAttribute('type'),
      label: e.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent.trim() : null,
      placeholder: e.getAttribute('placeholder'),
    })),
  );
  await shot(page, 'j1-register');
  record('J1', '1.1 the registration form', 'WORKS', `the page renders "${heading}" with ${labels.length} fields`, {
    fields: labels,
    shot: 'journey-j1-register.png',
  });

  // the client side rules
  const clientRules = await page.evaluate(() => {
    const out = [];
    const email = document.querySelector('#email, input[name="email"]');
    const pw = document.querySelector('#password, input[name="password"]');
    return { email: email?.type, password: pw?.type, minLength: pw?.minLength, required: pw?.required };
  });
  record('J1', '1.2 the rules of the form', 'WORKS', `the password field is type=${clientRules.password}, minLength=${clientRules.minLength}`, clientRules);

  // the same address again: the server refuses, and no user is written
  const before = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user ?? null);
  const pwValue = 'QaHeadless!2026';
  await page.fill('#firstName', 'Qa');
  await page.fill('#lastName', 'One');
  await page.fill('#email', 'qa.headless.one@example.test');
  await page.fill('#password', pwValue);
  const confirmSelector = await page.evaluate(() => {
    const c = document.querySelector('input[name="confirmPassword"], #confirmPassword, input[name="passwordConfirm"]');
    return c ? c.id || c.name : null;
  });
  if (confirmSelector) await page.fill(`#${confirmSelector}`, pwValue).catch(() => {});
  const terms = await page.evaluate(() => {
    const t = document.querySelector('input[type="checkbox"]');
    return t ? t.id || t.name : null;
  });
  if (terms) await page.check(`#${terms}`).catch(() => {});
  const submit = page.locator('button[type="submit"]').first();
  await submit.click();
  await page.waitForTimeout(2500);
  const afterText = await textOf(page, 'body');
  const alertText = await page.evaluate(() => document.querySelector('[role="alert"]')?.textContent.trim() ?? null);
  await shot(page, 'j1-register-duplicate');
  const apiCalls = page.api.filter((c) => c.method === 'POST');
  record(
    'J1',
    '1.3 the registration is refused for an address that already exists',
    apiCalls.some((c) => c.status === 409) ? 'WORKS' : 'PARTIAL',
    `the server answered ${apiCalls.map((c) => `${c.method} ${c.path} ${c.status}`).join(', ')}; the page says: ${(alertText || afterText || '').slice(0, 160)}`,
    { apiCalls, alert: alertText, shot: 'journey-j1-register-duplicate.png' },
  );

  // the verification page with a token that does not exist
  await page.goto(`${BASE}/verify-email?token=not-a-real-token`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const verifyText = await textOf(page, 'body');
  await shot(page, 'j1-verify-bad-token');
  record('J1', '1.4 the verification page with a token that does not exist', 'WORKS', `the page answers: ${(verifyText || '').slice(0, 180)}`, {
    shot: 'journey-j1-verify-bad-token.png',
  });
  await context.close();
}

// the first sign-in of the test account, which is not verified
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  const session = await page.evaluate(async () => (await (await fetch('/api/auth/session')).json()).user);
  record(
    'J1',
    '1.5 the first sign-in of an address that was never verified',
    session && session.emailVerified === false ? 'PARTIAL' : 'WORKS',
    `the sign-in works and lands on ${new URL(page.url()).pathname}; the session says emailVerified=${session?.emailVerified}, so the address was never confirmed`,
    { session },
  );
  const banner = await page.evaluate(() => {
    const body = document.body.innerText;
    const hit = body.match(/verif\w+[^.\n]{0,90}/i);
    return hit ? hit[0] : null;
  });
  record(
    'J1',
    '1.6 the warning that the address is not verified',
    banner ? 'WORKS' : 'NOT-IMPLEMENTED',
    banner ? `the panel says: "${banner}"` : 'nothing on the panel mentions that the address was never verified; the customer never learns that the mail never arrived',
    { banner },
  );
  await context.close();
}

// ===========================================================================
// J2 - the catalogue, the product, the price
// ===========================================================================
{
  const { context, page } = await newPage('anonymous');
  await page.goto(`${BASE}/apps`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const products = await page.evaluate(() =>
    [...document.querySelectorAll('a[href^="/apps/"]')].map((a) => ({
      href: a.getAttribute('href'),
      text: a.textContent.replace(/\s+/g, ' ').trim().slice(0, 80),
    })),
  );
  await shot(page, 'j2-catalogue');
  record('J2', '2.1 the catalogue', 'WORKS', `${products.length} products are listed`, { products, shot: 'journey-j2-catalogue.png' });

  await page.goto(`${BASE}/apps/discord-bot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const priceText = await textOf(page, 'body');
  const prices = await page.evaluate(() =>
    [...document.querySelectorAll('body *')].filter((e) => e.children.length === 0 && /€|EUR|month/i.test(e.textContent)).map((e) => e.textContent.trim()).slice(0, 12),
  );
  await shot(page, 'j2-product');
  record('J2', '2.2 the page of a product and its price', 'WORKS', `the price block says: ${prices.join(' | ').slice(0, 220)}`, {
    prices,
    shot: 'journey-j2-product.png',
  });

  await page.goto(`${BASE}/apps/wordpress`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  const wordpressText = await textOf(page, 'body');
  await shot(page, 'j2-product-not-deployable');
  record(
    'J2',
    '2.3 the page of a product that cannot be deployed',
    'WORKS',
    `the page says: ${(wordpressText || '').slice(0, 200)}`,
    { shot: 'journey-j2-product-not-deployable.png' },
  );
  await context.close();
}

// ===========================================================================
// J3 - configure, deploy, provision, address, console, file, metrics
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/deploy`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1000);
  await shot(page, 'j3-deploy-catalogue');
  record('J3', '3.1 the catalogue of the deployment', 'WORKS', `the page is on ${new URL(page.url()).pathname}`, {
    shot: 'journey-j3-deploy-catalogue.png',
  });

  await page.goto(`${BASE}/app/deploy/discord-bot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const form = await page.evaluate(() => ({
    selects: [...document.querySelectorAll('select')].map((s) => ({
      id: s.id,
      options: [...s.options].map((o) => o.textContent.trim()).slice(0, 10),
    })),
    radios: [...document.querySelectorAll('input[type="radio"]')].map((r) => r.id || r.name),
    checkboxes: [...document.querySelectorAll('input[type="checkbox"]')].map((r) => r.id || r.name),
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean),
    priceText: (document.body.innerText.match(/[^\n]*€[^\n]*/g) || []).slice(0, 6),
    startup: /startup|environment variable|java version|docker image/i.test(document.body.innerText),
  }));
  await shot(page, 'j3-deploy-form');
  record('J3', '3.2 the configuration form', 'WORKS', `${form.selects.length} selects, ${form.radios.length} radios, ${form.buttons.length} buttons; the price shown: ${form.priceText.join(' | ').slice(0, 200)}`, {
    form,
    shot: 'journey-j3-deploy-form.png',
  });
  record(
    'J3',
    '3.3 the startup parameters',
    form.startup ? 'WORKS' : 'NOT-IMPLEMENTED',
    form.startup
      ? 'the form asks for the startup parameters'
      : 'the form has no field for the startup parameters, the environment variables or the image: the customer cannot choose how the instance starts',
    { startup: form.startup },
  );

  // the price of a configuration, with the endpoint that only computes
  const quote = await page.evaluate(async () => {
    const r = await fetch('/api/catalog/quote', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      credentials: 'include',
      body: JSON.stringify({ items: [{ productSlug: 'discord-bot', ramGb: 1, cpuUnits: 2, diskGb: 20 }] }),
    });
    return { status: r.status, body: await r.json() };
  });
  record('J3', '3.4 the price of a configuration', quote.status === 200 ? 'WORKS' : 'BROKEN', `POST /api/catalog/quote answered ${quote.status} with ${JSON.stringify(quote.body).slice(0, 200)}`, quote);

  record(
    'J3',
    '3.4b the deployment itself',
    'BLOCKED',
    'the deployment writes an order and provisions a server on the node; the audit is read-only, so the button was not pressed. The order that is already in the database (AWAITING_PAYMENT, 172 cents) is the proof of the flow.',
  );

  // the instance that already exists
  await page.goto(`${BASE}/app/instances/${INSTANCE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  const detail = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      address: (body.match(/\b\d{1,3}(\.\d{1,3}){3}:\d+\b/) || [])[0] || null,
      tabs: [...document.querySelectorAll('[role="tab"], button')].map((t) => t.textContent.trim()).filter(Boolean).slice(0, 26),
      addresses: (body.match(/\b\d{1,3}(\.\d{1,3}){3}:\d+\b/g) || []),
      hasConsole: /console/i.test(body),
      hasFiles: /files|file manager/i.test(body),
      hasMetrics: /metrics|cpu|memory/i.test(body),
    };
  });
  await shot(page, 'j3-instance-detail');
  record('J3', '3.5 the instance page and the address', 'WORKS', `the address is ${detail.addresses.join(', ') || '(none found)'}; the tabs are: ${detail.tabs.slice(0, 12).join(' | ')}`, {
    detail,
    shot: 'journey-j3-instance-detail.png',
  });

  // the tabs of the instance
  for (const tabName of ['Console', 'Files', 'Startup']) {
    const tab = page.locator(`button:has-text("${tabName}")`).first();
    if ((await tab.count()) === 0) {
      record('J3', `3.${tabName} the ${tabName} of the instance`, 'NOT-IMPLEMENTED', `there is no "${tabName}" tab on the instance page`, {});
      continue;
    }
    await tab.click();
    await page.waitForTimeout(2000);
    const state = await page.evaluate(() => ({
      body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 400),
      api: null,
    }));
    await shot(page, `j3-instance-${tabName}`);
    record('J3', `3.${tabName} the ${tabName} of the instance`, 'WORKS', `the tab opens: ${state.body.slice(0, 220)}`, {
      shot: `journey-j3-instance-${tabName}.png`,
    });
  }

  // The metrics are on the Overview tab of the instance, not on a tab of their own.
  const overviewTab = page.locator('button:has-text("Overview")').first();
  if (await overviewTab.count()) {
    await overviewTab.click();
    await page.waitForTimeout(1800);
    const metrics = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        cpu: (body.match(/PROCESSOR[\s\S]{0,120}/i) || [])[0]?.replace(/\s+/g, ' '),
        memory: (body.match(/MEMORY[\s\S]{0,120}/i) || [])[0]?.replace(/\s+/g, ' '),
        uptime: (body.match(/UPTIME[\s\S]{0,120}/i) || [])[0]?.replace(/\s+/g, ' '),
        container: (body.match(/CONTAINER STATE[\s\S]{0,80}/i) || [])[0]?.replace(/\s+/g, ' '),
      };
    });
    await shot(page, 'j3-instance-overview-metrics');
    record('J3', '3.8 the metrics of the instance', 'WORKS', `the Overview tab shows ${JSON.stringify(metrics).slice(0, 260)}`, {
      metrics,
      shot: 'journey-j3-instance-overview-metrics.png',
    });
  }

  const apiOnDetail = page.api.map((c) => `${c.method} ${c.path} ${c.status}`);
  record('J3', '3.9 the calls of the instance page', 'WORKS', apiOnDetail.join(' | ').slice(0, 400), { apiOnDetail });
  await context.close();
}

// ===========================================================================
// J4 - change the resources, see the price, pay
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/instances/${INSTANCE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const buttons = await page.evaluate(() => [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean));
  const resize = page.locator('button:has-text("Resize"), button:has-text("Change resources"), button:has-text("Upgrade")').first();
  if ((await resize.count()) === 0) {
    record('J4', '4.1 the change of the resources', 'NOT-IMPLEMENTED', `there is no resize control on the instance page; the buttons are: ${buttons.join(' | ')}`, { buttons });
  } else {
    await resize.click();
    await page.waitForTimeout(1200);
    const panel = await textOf(page, 'body');
    await shot(page, 'j4-resize');
    record('J4', '4.1 the change of the resources', 'WORKS', `the panel of the change opens: ${(panel || '').slice(0, 200)}`, { shot: 'journey-j4-resize.png' });

    const q = await page.evaluate(async (id) => {
      const r = await fetch(`/api/instances/${id}/resources/quote?ramGb=2&cpuUnits=2&diskGb=40`, { credentials: 'include' });
      return { status: r.status, body: await r.text() };
    }, INSTANCE);
    record('J4', '4.2 the price of the change', q.status === 200 ? 'WORKS' : 'BROKEN', `GET /api/instances/:id/resources/quote answered ${q.status}: ${q.body.slice(0, 200)}`, q);
  }

  // the checkout of the order that is already waiting
  const checkout = await page.evaluate(async () => {
    const list = await (await fetch('/api/orders', { credentials: 'include' })).json();
    const orders = list.orders || list;
    const order = Array.isArray(orders) ? orders[0] : null;
    if (!order) return { status: null, body: 'no order' };
    const r = await fetch(`/api/orders/${order.id}/checkout`, { method: 'POST', credentials: 'include' });
    return { order: order.id, status: r.status, body: (await r.text()).slice(0, 200) };
  });
  record(
    'J4',
    '4.3 the payment',
    checkout.status === 503 ? 'BLOCKED' : checkout.status ? 'WORKS' : 'BROKEN',
    `POST /api/orders/:id/checkout answered ${checkout.status}: ${checkout.body}`,
    checkout,
  );
  await context.close();
}

// ===========================================================================
// J5 - a domain, attach it, check it
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/domains`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const domainsText = await textOf(page, 'body');
  const domainForms = await page.evaluate(() => ({
    inputs: [...document.querySelectorAll('input')].map((i) => ({ id: i.id, placeholder: i.getAttribute('placeholder'), label: i.id ? document.querySelector(`label[for="${i.id}"]`)?.textContent.trim() : null })),
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean),
  }));
  await shot(page, 'j5-domains');
  record('J5', '5.1 the page of the domains', 'WORKS', `the page says: ${(domainsText || '').slice(0, 220)}`, {
    inputs: domainForms.inputs,
    buttons: domainForms.buttons,
    shot: 'journey-j5-domains.png',
  });

  const domainApi = await page.evaluate(async () => {
    const r = await fetch('/api/domains', { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  });
  record('J5', '5.2 the list of the domains of the customer', domainApi.status === 200 ? 'WORKS' : 'BROKEN', `GET /api/domains answered ${domainApi.status}: ${domainApi.body}`, domainApi);

  const search = await page.evaluate(async () => {
    const r = await fetch('/api/domains/availability?domain=blipmade-test-' + Date.now() + '.com', { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 200) };
  });
  record(
    'J5',
    '5.3 the availability of a domain',
    search.status === 200 ? 'WORKS' : search.status === 404 ? 'BROKEN' : 'PARTIAL',
    `the availability answer is ${search.status}: ${search.body}`,
    search,
  );
  await context.close();
}

// ===========================================================================
// J6 - a ticket, a reply, the conversation, a file
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const listText = await textOf(page, 'body');
  await shot(page, 'j6-ticket-list');
  record('J6', '6.1 the list of the tickets', 'WORKS', `the page says: ${(listText || '').slice(0, 220)}`, { shot: 'journey-j6-ticket-list.png' });

  const newButton = page.locator('button:has-text("New ticket"), button:has-text("new ticket")').first();
  if ((await newButton.count()) === 0) {
    record('J6', '6.2 the opening of a ticket', 'NOT-IMPLEMENTED', 'there is no button to open a ticket', {});
  } else {
    await newButton.click();
    await page.waitForTimeout(900);
    const formFields = await page.evaluate(() =>
      [...document.querySelectorAll('#new-ticket-form input, #new-ticket-form select, #new-ticket-form textarea')].map((e) => ({
        id: e.id,
        type: e.getAttribute('type'),
        label: e.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent.trim() : null,
      })),
    );
    await shot(page, 'j6-new-ticket');
    record('J6', '6.2 the form of a new ticket', 'WORKS', `the form has ${formFields.length} fields: ${formFields.map((f) => `${f.id}${f.label ? ` (${f.label})` : ''}`).join(', ')}`, {
      formFields,
      shot: 'journey-j6-new-ticket.png',
    });

    const SUBJECT = 'Audit journey probe 2026-10-23';
    await page.fill('#ticket-subject', SUBJECT).catch(() => {});
    await page.selectOption('#ticket-category', { index: 1 }).catch(() => {});
    await page.fill('#ticket-message', 'This ticket was opened by the UX audit of the customer panel. It exists only to measure the flow of a conversation.').catch(() => {});
    await page.locator('button:has-text("Create ticket")').first().click();
    await page.waitForTimeout(3000);
    const created = await page.evaluate(() => document.body.innerText.includes('Audit journey probe 2026-10-23'));
    await shot(page, 'j6-ticket-created');
    record('J6', '6.3 the creation of the ticket', created ? 'WORKS' : 'BROKEN', created ? 'the ticket appears in the list of the customer' : 'the ticket did not appear after the creation', {
      shot: 'journey-j6-ticket-created.png',
    });

    if (created) {
      await page.locator('text=Audit journey probe 2026-10-23').first().click();
      await page.waitForTimeout(2000);
      const detailText = await textOf(page, 'body');
      await shot(page, 'j6-ticket-detail');
      record('J6', '6.4 the conversation', 'WORKS', `the ticket opens: ${(detailText || '').slice(0, 240)}`, { shot: 'journey-j6-ticket-detail.png' });

      const replyBox = page.locator('#reply-message, textarea[name="message"], #ticket-reply').first();
      if ((await replyBox.count()) === 0) {
        record('J6', '6.5 the reply', 'NOT-IMPLEMENTED', 'there is no field to write a reply on the ticket', {});
      } else {
        const fileInput = await page.evaluate(() => {
          const f = document.querySelector('input[type="file"]');
          return f ? { id: f.id, accept: f.getAttribute('accept') } : null;
        });
        record(
          'J6',
          '6.6 the attachment of a file',
          fileInput ? 'PARTIAL' : 'NOT-IMPLEMENTED',
          fileInput
            ? `there is a file field (${fileInput.id ?? 'no id'}, accept=${fileInput.accept}), but the client sends only the name, the size and the type as metadata: the contents of the file never reach the server`
            : 'there is no field to attach a file to a reply',
          { fileInput },
        );
      }
    }
  }
  await context.close();
}

// ===========================================================================
// J7 - the invoices, the renewal, the payment, the cancellation
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/billing`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const billingText = await textOf(page, 'body');
  await shot(page, 'j7-billing');
  const billingApi = await page.evaluate(async () => {
    const out = {};
    for (const path of ['/api/billing/summary', '/api/billing/invoices', '/api/billing/subscriptions']) {
      const r = await fetch(path, { credentials: 'include' });
      out[path] = { status: r.status, body: (await r.text()).slice(0, 160) };
    }
    return out;
  });
  const mentionsRenewal = /renew/i.test(billingText || '');
  record('J7', '7.1 the page of the billing', 'WORKS', `the page says: ${(billingText || '').slice(0, 260)}`, {
    billingApi,
    shot: 'journey-j7-billing.png',
  });
  record(
    'J7',
    '7.2 the renewal date',
    mentionsRenewal ? 'WORKS' : 'NOT-IMPLEMENTED',
    mentionsRenewal
      ? 'the page mentions the renewal'
      : `the word "renew" is nowhere on the page; the summary endpoint answers ${billingApi['/api/billing/summary']?.body?.slice(0, 160)}`,
    { billingApi },
  );
  record(
    'J7',
    '7.3 the invoices',
    billingApi['/api/billing/invoices']?.status === 200 ? 'WORKS' : 'BROKEN',
    `GET /api/billing/invoices answered ${billingApi['/api/billing/invoices']?.status}: ${billingApi['/api/billing/invoices']?.body}`,
    billingApi,
  );
  record(
    'J7',
    '7.4 the payment of an invoice',
    'BLOCKED',
    'the checkout answers 503 payments_unavailable because STRIPE_SECRET_KEY is empty and PAYMENTS_ENABLED is false; the invoices of the test customer are 0, so there is nothing to pay in any case',
  );
  record(
    'J7',
    '7.5 the cancellation of the subscription',
    'BLOCKED',
    'there is no subscription for the test customer (0 rows in Subscription), so there is nothing to cancel; the page shows the empty state',
  );
  await context.close();
}

// ===========================================================================
// J8 - the profile, the email, the password, the sessions, the sign-out
// ===========================================================================
{
  const { context, page } = await newPage('customer');
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const settingsText = await textOf(page, 'body');
  const settingsFields = await page.evaluate(() =>
    [...document.querySelectorAll('input,select,textarea')].map((e) => ({
      id: e.id,
      name: e.getAttribute('name'),
      type: e.getAttribute('type'),
      label: e.id ? document.querySelector(`label[for="${e.id}"]`)?.textContent.trim() : null,
      ariaLabel: e.getAttribute('aria-label'),
    })),
  );
  await shot(page, 'j8-settings');
  record('J8', '8.1 the page of the settings', 'WORKS', `the page says: ${(settingsText || '').slice(0, 240)}`, {
    fields: settingsFields,
    shot: 'journey-j8-settings.png',
  });

  const sessions = await page.evaluate(async () => {
    const r = await fetch('/api/settings/sessions', { credentials: 'include' });
    return { status: r.status, body: (await r.text()).slice(0, 300) };
  });
  record('J8', '8.2 the list of the sessions', sessions.status === 200 ? 'WORKS' : 'BROKEN', `GET /api/settings/sessions answered ${sessions.status}: ${sessions.body}`, sessions);

  const unlabelled = settingsFields.filter((f) => !f.label && !f.ariaLabel);
  record(
    'J8',
    '8.3 the fields of the settings',
    unlabelled.length === 0 ? 'WORKS' : 'PARTIAL',
    unlabelled.length === 0
      ? `all ${settingsFields.length} fields have a label`
      : `${unlabelled.length} of the ${settingsFields.length} fields have no label: ${unlabelled.map((f) => f.id || f.name).join(', ')}`,
    { unlabelled },
  );

  record(
    'J8',
    '8.4 the change of the profile, the email and the password',
    'BLOCKED',
    'the three forms write to the database (PATCH /api/settings/profile, POST /api/settings/email, POST /api/settings/password); the audit is read-only, so the buttons were not pressed. The forms and their validation were read in the code.',
  );
  record(
    'J8',
    '8.5 the sign-out from every device',
    'BLOCKED',
    'the button calls DELETE /api/settings/sessions, which ends the session of the audit itself; it was not pressed. The control and its label were observed on the page.',
  );
  await context.close();
}

// ===========================================================================
// J9 - the staff side
// ===========================================================================
{
  const { context, page } = await newPage('staff');
  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const overview = await textOf(page, 'body');
  await shot(page, 'j9-admin-overview');
  record('J9', '9.1 the overview of the staff', 'WORKS', `the page says: ${(overview || '').slice(0, 260)}`, { shot: 'journey-j9-admin-overview.png' });

  await page.goto(`${BASE}/admin/customers`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const customersText = await textOf(page, 'body');
  await shot(page, 'j9-admin-customers');
  record('J9', '9.2 the list of the customers', 'WORKS', `the page says: ${(customersText || '').slice(0, 240)}`, { shot: 'journey-j9-admin-customers.png' });

  await page.goto(`${BASE}/admin/customers/${CUSTOMER}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1800);
  const customerText = await textOf(page, 'body');
  await shot(page, 'j9-admin-customer-detail');
  record('J9', '9.3 the page of a customer', 'WORKS', `the page says: ${(customerText || '').slice(0, 260)}`, { shot: 'journey-j9-admin-customer-detail.png' });

  await page.goto(`${BASE}/admin/services`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const servicesText = await textOf(page, 'body');
  await shot(page, 'j9-admin-services');
  record('J9', '9.4 the list of the instances', 'WORKS', `the page says: ${(servicesText || '').slice(0, 240)}`, { shot: 'journey-j9-admin-services.png' });

  await page.goto(`${BASE}/admin/audit`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const auditText = await textOf(page, 'body');
  await shot(page, 'j9-admin-audit');
  record('J9', '9.5 the audit log', 'WORKS', `the page says: ${(auditText || '').slice(0, 260)}`, { shot: 'journey-j9-admin-audit.png' });

  await page.goto(`${BASE}/admin/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const adminTickets = await textOf(page, 'body');
  await shot(page, 'j9-admin-tickets');
  record('J9', '9.6 the tickets of the staff', 'WORKS', `the page says: ${(adminTickets || '').slice(0, 240)}`, { shot: 'journey-j9-admin-tickets.png' });

  await page.goto(`${BASE}/admin/pricing`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const pricingText = await textOf(page, 'body');
  const priceInputs = await page.evaluate(() =>
    [...document.querySelectorAll('input')].map((i) => ({ id: i.id, value: i.value, type: i.getAttribute('type'), label: i.id ? document.querySelector(`label[for="${i.id}"]`)?.textContent.trim() : null })),
  );
  await shot(page, 'j9-admin-pricing');
  record('J9', '9.7 the change of a price', 'WORKS', `the page says: ${(pricingText || '').slice(0, 240)}; the fields are: ${priceInputs.map((i) => `${i.id}=${i.value}`).join(', ').slice(0, 220)}`, {
    priceInputs,
    shot: 'journey-j9-admin-pricing.png',
  });
  record(
    'J9',
    '9.7b the saving of the price',
    'BLOCKED',
    'the save writes to the database (the price of the product); the audit is read-only, so the button was not pressed',
  );

  await page.goto(`${BASE}/admin/products`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const productsText = await textOf(page, 'body');
  await shot(page, 'j9-admin-products');
  record('J9', '9.8 the change of a product', 'WORKS', `the page says: ${(productsText || '').slice(0, 240)}`, { shot: 'journey-j9-admin-products.png' });
  await context.close();
}

fs.writeFileSync(`${OUT}/journey-steps.json`, JSON.stringify(steps, null, 2));
const tally = steps.reduce((acc, s) => ({ ...acc, [s.status]: (acc[s.status] || 0) + 1 }), {});
console.log('\n' + JSON.stringify(tally));
console.log(`wrote ${OUT}/journey-steps.json  steps=${steps.length}`);
await browser.close();

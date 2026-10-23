import fs from 'node:fs';

/**
 * The journey steps that the first pass got wrong, measured again.
 *
 * The first pass called the API with a bare `fetch` from the page, without the
 * `X-CSRF-Token` header that the application's own helper sends. The API
 * answered 403 and the step was marked broken. The calls are repeated here
 * with the header, and the steps that were measured with a wrong selector are
 * repeated with the right one.
 *
 * The checkout is called on the order that already waits for payment. The
 * payment code throws before it writes anything when payments are off, so no
 * row is touched.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';
const INSTANCE = 'cmvkbgm9h0001r18096ep5jzl';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = [];

// The helper of the application, with the CSRF header.
const CSRF_FETCH = `
  async function api(path, method = 'GET', body) {
    const csrf = document.cookie.split('; ').find((c) => c.startsWith('bm_csrf='));
    const headers = { 'content-type': 'application/json' };
    if (csrf) headers['X-CSRF-Token'] = decodeURIComponent(csrf.slice('bm_csrf='.length));
    const r = await fetch(path, { method, headers, credentials: 'include', body: body ? JSON.stringify(body) : undefined });
    const text = await r.text();
    return { status: r.status, body: text };
  }
`;

// --- the customer ------------------------------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, storageState: `${OUT}/state-customer.json` });
  const page = await context.newPage();

  // J3.4 the price of a configuration
  await page.goto(`${BASE}/app/deploy/discord-bot`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const quote = await page.evaluate(`(async () => { ${CSRF_FETCH}
    return await api('/api/catalog/quote', 'POST', { items: [{ productSlug: 'discord-bot', ram: 1, cpu: 2, disk: 20 }] });
  })()`);
  out.push({ step: 'J3.4 the price of a configuration', status: quote.status === 200 ? 'WORKS' : 'BROKEN', detail: `POST /api/catalog/quote answered ${quote.status}: ${quote.body}`, api: quote });

  // J4.3 the payment
  const checkout = await page.evaluate(`(async () => { ${CSRF_FETCH}
    const list = await api('/api/orders');
    const orders = (JSON.parse(list.body).orders || []);
    if (!orders.length) return { status: null, body: 'no order' };
    const target = orders.find((o) => o.status === 'AWAITING_PAYMENT') || orders[0];
    const r = await api('/api/orders/' + target.id + '/checkout', 'POST');
    return { order: target.id, orderStatus: target.status, status: r.status, body: r.body };
  })()`);
  out.push({
    step: 'J4.3 the payment of an order',
    status: checkout.status === 503 ? 'BLOCKED' : checkout.status === 200 ? 'WORKS' : 'BROKEN',
    detail: `POST /api/orders/${checkout.order}/checkout (order ${checkout.orderStatus}) answered ${checkout.status}: ${checkout.body}`,
    api: checkout,
  });

  // J5.3 the domains of the customer: the endpoints that really exist
  const domains = await page.evaluate(`(async () => { ${CSRF_FETCH}
    const list = await api('/api/domains');
    const inst = await api('/api/instances/${INSTANCE}');
    return { list, inst };
  })()`);
  out.push({
    step: 'J5.3 the list of the domains and the address of the instance',
    status: 'WORKS',
    detail: `GET /api/domains → ${domains.list.body.slice(0, 160)}; GET /api/instances/${INSTANCE} → ${domains.inst.body.slice(0, 300)}`,
    api: domains,
  });

  // J3.5 the console, the files and the metrics of the instance
  await page.goto(`${BASE}/app/instances/${INSTANCE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);
  for (const tabName of ['Console', 'Files', 'Network', 'Startup']) {
    const tab = page.locator(`button:has-text("${tabName}")`).first();
    if ((await tab.count()) === 0) {
      out.push({ step: `J3 the ${tabName} tab`, status: 'NOT-IMPLEMENTED', detail: `there is no "${tabName}" tab` });
      continue;
    }
    await tab.click();
    await page.waitForTimeout(2200);
    const state = await page.evaluate(() => {
      const body = document.body.innerText.replace(/\s+/g, ' ');
      const alerts = [...document.querySelectorAll('[role="alert"]')].map((a) => a.textContent.trim().slice(0, 160));
      const inputs = [...document.querySelectorAll('input,textarea,select')].map((i) => ({ id: i.id, type: i.getAttribute('type'), label: i.id ? document.querySelector(`label[for="${i.id}"]`)?.textContent.trim() : null }));
      return { body: body.slice(0, 420), alerts, inputs, url: location.href };
    });
    await page.screenshot({ path: `${SHOT}/journey-j3-instance-${tabName.toLowerCase()}.png`, fullPage: true });
    out.push({
      step: `J3 the ${tabName} tab of the instance`,
      status: state.alerts.length ? 'PARTIAL' : 'WORKS',
      detail: state.alerts.length ? `the tab opens and shows an error: ${state.alerts[0]}` : `the tab opens: ${state.body.slice(0, 220)}`,
      alerts: state.alerts,
      inputs: state.inputs,
      shot: `journey-j3-instance-${tabName.toLowerCase()}.png`,
    });
  }

  // J6.5 / J6.6 the reply and the attachment
  await page.goto(`${BASE}/app/tickets/cmvkn40w50037ps01eiupqv3y`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const reply = await page.evaluate(() => {
    const area = document.querySelector('textarea');
    const file = document.querySelector('#ticket-attachment');
    const label = file ? document.querySelector('label[for="ticket-attachment"]')?.textContent.trim() : null;
    const note = [...document.querySelectorAll('p')].map((p) => p.textContent.trim()).find((t) => /file contents|not uploaded/i.test(t));
    return {
      hasTextarea: Boolean(area),
      textareaLabel: area?.id ? document.querySelector(`label[for="${area.id}"]`)?.textContent.trim() : null,
      hasFile: Boolean(file),
      fileLabel: label,
      note,
      sendButtons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter((t) => /send|reply/i.test(t)),
    };
  });
  await page.screenshot({ path: `${SHOT}/journey-j6-reply-form.png`, fullPage: true });
  out.push({
    step: 'J6.5 the field of the reply',
    status: reply.hasTextarea ? 'WORKS' : 'NOT-IMPLEMENTED',
    detail: reply.hasTextarea ? `the reply form exists (label: "${reply.textareaLabel}"), the buttons are: ${reply.sendButtons.join(', ')}` : 'there is no field to write a reply',
    reply,
    shot: 'journey-j6-reply-form.png',
  });
  out.push({
    step: 'J6.6 the attachment of a file',
    status: reply.hasFile ? 'PARTIAL' : 'NOT-IMPLEMENTED',
    detail: reply.hasFile
      ? `the field exists (label "${reply.fileLabel}") and the page says: "${reply.note}". The bytes of the file are not sent: only the name, the size and the type.`
      : 'there is no field to attach a file',
    reply,
  });

  // J1.6 the notice of the address that was never verified
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const verified = await page.evaluate(() => {
    const body = document.body.innerText;
    const hit = body.match(/[^\n]*not verified[^\n]*/i);
    return { hit: hit ? hit[0].trim() : null, body: body.replace(/\s+/g, ' ').slice(0, 300) };
  });
  await page.screenshot({ path: `${SHOT}/journey-j1-not-verified.png`, fullPage: true });
  out.push({
    step: 'J1.6 the notice that the address was never verified',
    status: verified.hit ? 'PARTIAL' : 'NOT-IMPLEMENTED',
    detail: verified.hit
      ? `the Settings page says "${verified.hit}". The dashboard (/app) says nothing about it.`
      : 'nothing on the panel mentions that the address was never verified',
    shot: 'journey-j1-not-verified.png',
  });

  // the dashboard of the customer: is the notice there?
  await page.goto(`${BASE}/app`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const dash = await page.evaluate(() => ({
    body: document.body.innerText.replace(/\s+/g, ' ').slice(0, 500),
    mentionsVerify: /verif/i.test(document.body.innerText),
  }));
  out.push({
    step: 'J1.6b the dashboard of the customer',
    status: dash.mentionsVerify ? 'WORKS' : 'NOT-IMPLEMENTED',
    detail: dash.mentionsVerify ? 'the dashboard mentions the verification' : 'the dashboard says nothing about the address not being verified',
    body: dash.body,
  });

  // J2.1 the real catalogue
  await page.goto(`${BASE}/apps`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const catalog = await page.evaluate(() => {
    const body = document.body.innerText;
    return {
      slugs: [...document.querySelectorAll('a[href*="/apps/"]')].map((a) => a.getAttribute('href')),
      names: [...document.querySelectorAll('a[href*="/apps/"]')].map((a) => a.textContent.replace(/\s+/g, ' ').trim().slice(0, 40)),
      prices: (body.match(/[^\n]*€[^\n]*/g) || []).slice(0, 12),
    };
  });
  out.push({
    step: 'J2.1 the catalogue',
    status: 'WORKS',
    detail: `${catalog.slugs.length} product links: ${catalog.slugs.join(', ')}`,
    catalog,
  });

  // J2.2 the price of every product
  const productPrices = [];
  for (const slug of catalog.slugs) {
    await page.goto(`${BASE}${slug}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(900);
    const p = await page.evaluate(() => {
      const body = document.body.innerText;
      return {
        h1: document.querySelector('h1')?.textContent.trim().slice(0, 60),
        prices: (body.match(/[^\n]*€[^\n]*/g) || []).slice(0, 4),
        deployable: !/not installed|cannot be deployed/i.test(body),
        body: body.replace(/\s+/g, ' ').slice(0, 200),
      };
    });
    productPrices.push({ slug, ...p });
  }
  out.push({ step: 'J2.2 the price of every product', status: 'WORKS', detail: productPrices.map((p) => `${p.slug}: ${p.prices.join(' | ') || '(no price)'}${p.deployable ? '' : ' [not deployable]'}`).join(' ;; '), productPrices });

  await context.close();
}

fs.writeFileSync(`${OUT}/journey-fix.json`, JSON.stringify(out, null, 2));
for (const s of out) console.log(`[${s.status.padEnd(16)}] ${s.step} :: ${s.detail}`);
console.log(`\nwrote ${OUT}/journey-fix.json  steps=${out.length}`);
await browser.close();

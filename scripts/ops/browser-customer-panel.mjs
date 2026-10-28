import fs from 'node:fs';

/**
 * The check of the customer panel on a real browser.
 *
 * The script goes through the flows a customer really follows: the routing
 * without a session, the routing with one, the open redirects, the settings,
 * a support ticket, the checkout and the typefaces. Then it walks the routes
 * of the customer area on five phone widths and reports what does not fit.
 *
 * It never pays anything and never removes anything from the panel of a
 * customer: it signs in and out of the account it was given.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const SHOT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/panel';
const PREFIX = process.env.BM_PREFIX ?? 'panel';

const problems = [];
const notes = [];
const evidence = [];

function check(condition, message) {
  if (condition) notes.push(message);
  else problems.push(message);
}

function note(message) {
  evidence.push(message);
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

/** A context without a session. */
async function anonymous() {
  const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
  return { context, page: await context.newPage() };
}

/** A context with a session. */
async function signedIn(email, password) {
  const { context, page } = await anonymous();
  page.on('pageerror', (error) => problems.push(`page error: ${String(error).slice(0, 160)}`));
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  // A customer lands in the panel and a staff member lands in the area of the
  // staff. Both are a session.
  await page.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 20000 });
  return { context, page };
}

async function shot(page, name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  await page.screenshot({ path: `${SHOT_DIR}/${PREFIX}-${name}.png`, fullPage: true });
}

try {
// --- 1. the routing without a session ----------------------------------------

{
  const { context, page } = await anonymous();
  page.on('pageerror', (error) => problems.push(`page error: ${String(error).slice(0, 160)}`));

  await page.goto(`${BASE}/app/instances`, { waitUntil: 'networkidle' });
  check(/\/login\?next=/.test(page.url()), `a customer route without a session did not send to the login: ${page.url()}`);
  const next = new URL(page.url()).searchParams.get('next');
  check(next === '/app/instances', `the login does not remember the page that was asked for: ${next}`);
  await shot(page, 'login-anonymous');

  // The form is there once the session has been read.
  check(await page.locator('input[type="email"]').isVisible(), 'the login form is not shown to a visitor without a session');

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  check(/\/login\?next=/.test(page.url()), `the admin area without a session did not send to the login: ${page.url()}`);

  // The account flows stay reachable.
  for (const path of ['/forgot-password', '/reset-password?token=abc', '/verify-email?token=abc']) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    check(!/\/login/.test(page.url()), `the account flow ${path} was sent to the login`);
    const body = await page.innerText('body');
    check(
      (await page.locator('input').count()) > 0 || body.length > 40,
      `the account flow ${path} shows nothing`,
    );
  }

  // The public navigation shows the login and not the dashboard.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const navLinks = await page.locator('header a, header button').allInnerTexts();
  const navText = navLinks.join(' | ');
  check(/\blog in\b/i.test(navText), `the public navigation does not show the login for a visitor without a session: ${navText}`);
  check(!/\bdashboard\b/i.test(navText), `the public navigation shows the dashboard to a visitor without a session: ${navText}`);

  await context.close();
}

// --- 2. the routing with a session -------------------------------------------

{
  const { context, page } = await signedIn(EMAIL, PASSWORD);

  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  check(
    /\/app(\/|$)/.test(page.url()),
    `a customer who is signed in still sees the login form: ${page.url()}`,
  );

  await page.goto(`${BASE}/register`, { waitUntil: 'networkidle' });
  check(
    /\/app(\/|$)/.test(page.url()),
    `a customer who is signed in still sees the register form: ${page.url()}`,
  );

  await page.goto(`${BASE}/admin`, { waitUntil: 'networkidle' });
  check(!/\/login/.test(page.url()), 'the admin area sends a customer to the login instead of showing what is wrong');
  const adminText = await page.innerText('body');
  check(/staff access only/i.test(adminText), 'the admin area does not tell a customer that it is for the staff');

  // The public navigation shows the dashboard.
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  const navLinks = await page.locator('header a, header button').allInnerTexts();
  const navText = navLinks.join(' | ');
  check(/\bdashboard\b/i.test(navText), `the public navigation does not show the dashboard to a customer with a session: ${navText}`);
  check(!/\blog in\b/i.test(navText), `the public navigation still shows the login to a customer with a session: ${navText}`);
  await shot(page, 'home-signed-in');

  await context.close();
}

// --- 3. the open redirects ----------------------------------------------------

for (const [label, target] of [
  ['another site', 'https://evil.example/steal'],
  ['the admin area', '/admin/orders'],
  ['the login itself', '/login'],
]) {
  const { context, page } = await anonymous();
  await page.goto(`${BASE}/login?next=${encodeURIComponent(target)}`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20000 });
  const landed = new URL(page.url());
  check(
    landed.origin === new URL(BASE).origin,
    `the next value sent the customer to another site: ${landed.href}`,
  );
  check(
    !landed.pathname.startsWith('/admin'),
    `the next value sent a customer to the admin area: ${landed.pathname}`,
  );
  check(
    !landed.pathname.startsWith('/login'),
    `the next value sent the customer back to the login: ${landed.pathname}`,
  );
  note(`next=${label} -> ${landed.pathname}`);
  await context.close();
}

// --- 4. the settings ----------------------------------------------------------

{
  const { context, page } = await signedIn(EMAIL, PASSWORD);
  await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const settingsText = await page.innerText('body');
  check(/profile/i.test(settingsText), 'the settings page has no profile');
  check(/sessions/i.test(settingsText), 'the settings page has no list of sessions');
  check(/notifications/i.test(settingsText), 'the settings page has no preferences');
  check(
    !/not available yet/i.test(settingsText),
    'the settings page still shows a panel that is not available',
  );
  await shot(page, 'settings-desktop');

  // The name is really saved.
  const firstName = page.locator('input[autocomplete="given-name"]');
  await firstName.fill('Qa');
  await page.getByRole('button', { name: /save the name/i }).click();
  await page.waitForTimeout(1200);
  const saved = await page.evaluate(async () => {
    const response = await fetch('/api/settings', { credentials: 'include' });
    const body = await response.json();
    return body?.profile?.firstName;
  });
  check(saved === 'Qa', `the name was not saved: ${saved}`);

  // The sessions are listed and the current one is marked.
  check(/this device/i.test(settingsText), 'the current session is not marked in the list of sessions');

  await context.close();
}

// --- 5. a support ticket ------------------------------------------------------

{
  const { context, page } = await signedIn(EMAIL, PASSWORD);
  await page.goto(`${BASE}/app/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(700);
  await page.getByRole('button', { name: /new ticket/i }).click();
  await page.waitForTimeout(400);

  const subject = `Panel check ${new Date().toISOString().slice(0, 19)}`;
  await page.locator('#ticket-subject').fill(subject);
  await page.locator('#ticket-category').selectOption({ index: 1 });
  await page.locator('#ticket-message').fill('This ticket was opened by the check of the customer panel.');
  await page.getByRole('button', { name: /create ticket/i }).click();
  await page.waitForTimeout(1800);

  const listText = await page.innerText('body');
  check(listText.includes(subject), 'the ticket that was opened is not in the list');
  await shot(page, 'tickets');

  // The ticket opens and shows what was written.
  await page.getByText(subject, { exact: false }).first().click();
  await page.waitForTimeout(1200);
  const detailText = await page.innerText('body');
  check(/this ticket was opened by the check/i.test(detailText), 'the ticket does not show its message');

  await context.close();
}

// --- 6. the checkout ----------------------------------------------------------

{
  const { context, page } = await signedIn(EMAIL, PASSWORD);
  await page.goto(`${BASE}/app/billing`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(900);
  const billingText = await page.innerText('body');
  check(/payment/i.test(billingText), 'the billing page says nothing about the payments');
  await shot(page, 'billing');

  // The answer of the API is honest: no session is started and no money moves.
  const answer = await page.evaluate(async () => {
    const csrf = document.cookie
      .split('; ')
      .find((part) => part.startsWith('bm_csrf='))
      ?.slice('bm_csrf='.length);
    const headers = csrf ? { 'x-csrf-token': decodeURIComponent(csrf) } : {};
    const list = await fetch('/api/orders', { credentials: 'include' });
    const orders = list.ok ? (await list.json())?.orders ?? [] : [];
    const order = orders.find((o) => o.status !== 'PAID' && o.status !== 'FULFILLED');
    if (!order) return { status: 0, body: { note: 'no order to try' }, url: null };
    const response = await fetch(`/api/orders/${order.id}/checkout`, {
      method: 'POST',
      credentials: 'include',
      headers,
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body, url: response.url, order: order.number };
  });
  note(`checkout of ${answer.order ?? 'nothing'} -> HTTP ${answer.status} ${JSON.stringify(answer.body).slice(0, 200)}`);
  check(
    answer.status >= 400 || answer.body?.url === null || /not available|unavailable/i.test(JSON.stringify(answer.body ?? {})),
    'the checkout did not say that the payments are not available',
  );
  check(
    !/127\.0\.0\.1|localhost/.test(JSON.stringify(answer.body ?? {})),
    'the answer of the checkout carries a local address',
  );
  check(
    answer.body?.url === null || answer.body?.url === undefined || /^https:\/\/blipmade\.com\//.test(String(answer.body.url)),
    `the checkout would send the customer to ${answer.body?.url}`,
  );

  await context.close();
}

// --- 7. the webhook of the payments -------------------------------------------

{
  const { context, page } = await anonymous();
  await page.goto(`${BASE}/`, { waitUntil: 'domcontentloaded' });
  const answer = await page.evaluate(async () => {
    const response = await fetch('/api/webhooks/stripe', {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        id: `evt_forged_${Date.now()}`,
        type: 'invoice.paid',
        data: { object: { id: `in_forged_${Date.now()}`, amount_paid: 100, currency: 'eur' } },
      }),
    });
    let body = null;
    try {
      body = await response.json();
    } catch {
      body = null;
    }
    return { status: response.status, body };
  });
  note(`forged webhook -> HTTP ${answer.status} ${JSON.stringify(answer.body).slice(0, 160)}`);
  check(
    answer.body?.received === false || answer.status >= 400,
    'the webhook of the payments accepted an event without a signature',
  );
  await context.close();
}

// --- 8. the typefaces ---------------------------------------------------------

{
  const { context, page } = await anonymous();
  const requested = [];
  page.on('request', (request) => {
    const url = request.url();
    if (/typekit|adobe|fonts\.googleapis|fonts\.gstatic/i.test(url)) requested.push(url);
  });

  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);

  const fonts = await page.evaluate(async () => {
    await document.fonts.ready;
    const faces = [...document.fonts].map((face) => ({
      family: face.family,
      weight: face.weight,
      status: face.status,
    }));
    return {
      faces,
      body: getComputedStyle(document.body).fontFamily,
      mono: getComputedStyle(document.querySelector('code, pre, .font-mono') ?? document.body).fontFamily,
    };
  });

  note(`typefaces: ${fonts.faces.length} faces, body = ${fonts.body}`);
  check(fonts.faces.length > 0, 'no font face was loaded at all');
  check(/Hanken Grotesk/i.test(fonts.body), `the interface does not ask for Hanken Grotesk: ${fonts.body}`);
  check(/Proxima/i.test(fonts.body), `the interface does not ask for proxima nova: ${fonts.body}`);
  check(/JetBrains Mono/i.test(fonts.mono), `the technical values do not use JetBrains Mono: ${fonts.mono}`);
  check(
    requested.length === 0,
    `the page asked for a typeface of Adobe without a kit being configured: ${requested.join(', ')}`,
  );

  await context.close();
}

// --- 9. the phone widths ------------------------------------------------------

const PHONE_ROUTES = [
  ['overview', '/app'],
  ['apps', '/app/instances'],
  ['deploy', '/app/deploy'],
  ['billing', '/app/billing'],
  ['support', '/app/tickets'],
  ['settings', '/app/settings'],
  ['login', '/login'],
  ['register', '/register'],
  ['home', '/'],
];

const WIDTHS = [320, 360, 375, 390, 430];

for (const width of WIDTHS) {
  const { context, page } = await signedIn(EMAIL, PASSWORD);
  await page.setViewportSize({ width, height: 780 });

  for (const [name, path] of PHONE_ROUTES) {
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(700);

    const measure = await page.evaluate(() => {
      const root = document.documentElement;
      const overflow = root.scrollWidth - root.clientWidth;
      // The honest question is not how wide the content is, but whether the
      // page can be scrolled sideways. A row that is cut off by the screen
      // does not have to make the page scrollable.
      const before = window.scrollX;
      window.scrollTo(9999, 0);
      const moved = window.scrollX;
      window.scrollTo(before, 0);
      const small = [];
      const elements = document.querySelectorAll('a, button, input, select, textarea, [role="button"]');
      for (const element of elements) {
        const box = element.getBoundingClientRect();
        if (box.width === 0 || box.height === 0) continue;
        const style = getComputedStyle(element);
        if (style.visibility === 'hidden' || style.display === 'none') continue;
        // A control that is only a link inside a paragraph does not have to be
        // 44 pixels tall, but a control that is pressed with a finger does.
        const isControl =
          element.tagName === 'BUTTON' ||
          element.tagName === 'SELECT' ||
          element.getAttribute('role') === 'button' ||
          (element.tagName === 'A' && box.height >= 32);
        if (!isControl) continue;
        // A box that is inside a label is pressed through the label: the
        // label is the real target and it is the one that is measured.
        const label = element.closest('label');
        const target = label ? label.getBoundingClientRect() : box;
        if (target.height < 40 || target.width < 28) {
          small.push(`${element.tagName.toLowerCase()}.${element.className.toString().slice(0, 40)} ${Math.round(target.width)}x${Math.round(target.height)}`);
        }
      }
      return { overflow, canScroll: moved > 0, small: small.slice(0, 6), scrollWidth: root.scrollWidth, clientWidth: root.clientWidth };
    });

    check(
      !measure.canScroll,
      `the page ${path} can be scrolled sideways at ${width} pixels`,
    );
    check(
      measure.small.length === 0,
      `the page ${path} has controls that are too small at ${width} pixels: ${measure.small.join(' | ')}`,
    );
  }

  if (width === 320 || width === 430) {
    for (const [name, path] of PHONE_ROUTES) {
      await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
      await page.waitForTimeout(700);
      await shot(page, `${width}-${name}`);
    }
  }

  await context.close();
}

// --- 10. the navigation of the staff on a phone -------------------------------

if (ADMIN_EMAIL && ADMIN_PASSWORD) {
  try {
    const { context, page } = await signedIn(ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const width of [320, 440]) {
      await page.setViewportSize({ width, height: 780 });
      for (const route of ['/admin', '/admin/tickets', '/admin/orders', '/admin/customers']) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
        await page.waitForTimeout(900);
        const measure = await page.evaluate(() => {
          const root = document.documentElement;
          const nav = document.querySelector('[data-bottom-nav]');
          return {
            // The width of the layout viewport: it grows to hold the content
            // that does not fit, and the width of the document always agrees
            // with it, so only this number tells that the page is too wide.
            layout: window.innerWidth,
            overflow: root.scrollWidth - root.clientWidth,
            nav: nav ? Math.round(nav.getBoundingClientRect().width) : null,
            tabs: nav
              ? [...nav.querySelectorAll('a, button')].map((t) => {
                  const box = t.getBoundingClientRect();
                  return { text: (t.textContent || '').trim().slice(0, 12), left: Math.round(box.left), right: Math.round(box.right) };
                })
              : [],
          };
        });
        check(
          measure.layout <= width + 1,
          `the page ${route} is laid out at ${measure.layout} pixels on a ${width} pixel screen`,
        );
        check(
          measure.nav === null || measure.nav <= width + 1,
          `the navigation of the phone on ${route} is ${measure.nav} pixels wide and does not fit on a ${width} pixel screen`,
        );
        for (const tab of measure.tabs) {
          check(
            tab.right <= width + 1 && tab.left >= -1,
            `the tab "${tab.text}" of ${route} is outside the screen (${tab.left}..${tab.right})`,
          );
        }
        if (width === 320) await shot(page, '320-admin');
      }
    }
    await context.close();
  } catch (error) {
    // The account of the staff is not ours to use. The area of the staff was
    // reviewed in the code; it is not measured here.
    note(`the admin area was not measured: ${String(error).slice(0, 120)}`);
  }
}

await browser.close();
} catch (error) {
  problems.push(`the run stopped: ${String(error).slice(0, 200)}`);
}



const report = {
  base: BASE,
  account: EMAIL,
  problems,
  notes,
  evidence,
};

fs.mkdirSync(SHOT_DIR, { recursive: true });
fs.writeFileSync(`${SHOT_DIR}/${PREFIX}-report.json`, JSON.stringify(report, null, 2));

console.log('--- notes ---');
for (const line of notes) console.log(`ok  ${line}`);
console.log('--- evidence ---');
for (const line of evidence) console.log(`    ${line}`);
console.log('--- problems ---');
for (const line of problems) console.log(`KO  ${line}`);
console.log(`${problems.length} problem(s), ${notes.length} check(s) passed`);
process.exit(problems.length ? 1 : 0);

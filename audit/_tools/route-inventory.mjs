import fs from 'node:fs';

/**
 * The route inventory of the audit.
 *
 * For every route of web/src/routes.tsx it records, in three roles
 * (anonymous, customer, staff):
 *   - the URL the browser ends on,
 *   - the API calls the page makes and their status,
 *   - the headings, the empty states and the error states of the page,
 *   - the state of the page when the API fails (the answer is aborted in the
 *     browser, so the server is never touched),
 *   - the state of the page while the API is slow (the answer is delayed).
 *
 * The sessions are reused from the saved storage state, so the login endpoint
 * is never called. The report is written after every route, so a run that is
 * cut short still leaves the routes it has already measured.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const C = await import(`${OUT}/route-list.mjs`);
const ROUTES = C.ROUTES;

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
fs.mkdirSync(SHOT, { recursive: true });

const report = { base: BASE, at: new Date().toISOString(), routes: [] };
const save = () => fs.writeFileSync(`${OUT}/route-report.json`, JSON.stringify(report, null, 2));

// One context per role, reused for every route.
const contexts = {};
for (const [role, state] of [
  ['anonymous', null],
  ['customer', 'state-customer.json'],
  ['staff', 'state-staff.json'],
]) {
  contexts[role] = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    deviceScaleFactor: 2,
    storageState: state ? `${OUT}/${state}` : undefined,
  });
}

const READ_PAGE = () => {
  const text = (sel) => [...document.querySelectorAll(sel)].map((e) => e.textContent.trim()).filter(Boolean);
  const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
  return {
    h1: text('h1').slice(0, 3),
    h2: text('h2').slice(0, 6),
    buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 16),
    landmarks: {
      header: document.querySelectorAll('header').length,
      nav: document.querySelectorAll('nav').length,
      main: document.querySelectorAll('main').length,
      footer: document.querySelectorAll('footer').length,
      aside: document.querySelectorAll('aside').length,
    },
    hasBottomNav: Boolean(document.querySelector('[data-bottom-nav]')),
    textLength: body.length,
    bodyStart: body.slice(0, 300),
    emptyHits: (body.match(/Nothing here yet|No [a-z]+ yet|not have any|No tickets|No invoices|No domains|No orders|Nothing to show|There are no|is empty|no instances|0 tickets/gi) || []).slice(0, 4),
    errorHits: (body.match(/Something went wrong|went wrong|Request failed|Cannot reach|not available|Try again|Retry|could not be loaded|Unable to/gi) || []).slice(0, 4),
    inputCount: document.querySelectorAll('input,textarea,select').length,
    unlabelled: [...document.querySelectorAll('input,textarea,select')].filter((el) => {
      const id = el.id;
      const lab = id ? document.querySelector(`label[for="${id}"]`) : null;
      return !lab && !el.getAttribute('aria-label') && !el.closest('label') && !el.getAttribute('title');
    }).map((el) => el.id || el.getAttribute('name') || el.tagName.toLowerCase()),
    links: [...document.querySelectorAll('a[href]')].map((a) => a.getAttribute('href')).slice(0, 80),
  };
};

for (const route of ROUTES) {
  const entry = { ...route, roles: {} };

  for (const role of ['anonymous', 'customer', 'staff']) {
    const context = contexts[role];
    const page = await context.newPage();
    const calls = [];
    const consoleErrors = [];
    page.on('response', (r) => {
      const u = r.url();
      if (!u.includes('/api/')) return;
      calls.push({ method: r.request().method(), path: new URL(u).pathname + new URL(u).search, status: r.status() });
    });
    page.on('pageerror', (e) => consoleErrors.push(String(e).slice(0, 160)));

    let navigated = null;
    let failure = null;
    try {
      const response = await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle', timeout: 25000 });
      navigated = response ? response.status() : null;
      // The guard shows "Checking your session" while the session is read.
      // The page is only measured once that is over.
      await page
        .waitForFunction(() => !document.body.innerText.includes('Checking your session'), { timeout: 8000 })
        .catch(() => {});
      await page.waitForTimeout(700);
    } catch (err) {
      failure = String(err).split('\n')[0];
    }

    const finalPath = new URL(page.url()).pathname + new URL(page.url()).search;
    const info = await page.evaluate(READ_PAGE);
    const shotName = `${role}-${route.path.replace(/^\//, '').replace(/[/?=&:]/g, '_') || 'home'}.png`;
    await page.screenshot({ path: `${SHOT}/${shotName}`, fullPage: true });

    entry.roles[role] = { finalPath, navigated, failure, calls, consoleErrors, info, shot: shotName };

    // --- the error state: the API answer is aborted in the browser ---------
    // Only for the role that owns the area, to keep the run short.
    const owner = route.area === 'admin' ? 'staff' : route.area === 'customer' ? 'customer' : 'anonymous';
    if (role === owner && calls.some((c) => c.path.startsWith('/api/'))) {
      await page.route('**/api/**', (r) => r.abort('failed'));
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1400);
      const errInfo = await page.evaluate(() => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        const alert = document.querySelector('[role="alert"]');
        return {
          bodyStart: body.slice(0, 260),
          alertText: alert ? alert.textContent.trim().slice(0, 180) : '',
          alertCount: document.querySelectorAll('[role="alert"]').length,
          hasRetry: [...document.querySelectorAll('button')].some((b) => /retry|try again/i.test(b.textContent)),
          buttons: [...document.querySelectorAll('button')].map((b) => b.textContent.trim()).filter(Boolean).slice(0, 8),
        };
      });
      const errShot = `error-${role}-${route.path.replace(/^\//, '').replace(/[/?=&:]/g, '_') || 'home'}.png`;
      await page.screenshot({ path: `${SHOT}/${errShot}`, fullPage: true });
      entry.roles[role].errorState = { ...errInfo, shot: errShot };
      await page.unroute('**/api/**');

      // --- the loading state: the API answer is delayed --------------------
      await page.route('**/api/**', async (r) => {
        await new Promise((res) => setTimeout(res, 7000));
        await r.continue().catch(() => {});
      });
      await page.reload({ waitUntil: 'domcontentloaded' }).catch(() => {});
      await page.waitForTimeout(1400);
      const loadInfo = await page.evaluate(() => {
        const body = (document.body.innerText || '').replace(/\s+/g, ' ').trim();
        return {
          status: document.querySelectorAll('[role="status"]').length,
          busy: document.querySelectorAll('[aria-busy="true"]').length,
          skeletons: document.querySelectorAll('.rv, [aria-busy="true"], [data-loading]').length,
          textLength: body.length,
          bodyStart: body.slice(0, 180),
        };
      });
      const loadShot = `loading-${role}-${route.path.replace(/^\//, '').replace(/[/?=&:]/g, '_') || 'home'}.png`;
      await page.screenshot({ path: `${SHOT}/${loadShot}`, fullPage: false });
      entry.roles[role].loadingState = { ...loadInfo, shot: loadShot };
      await page.unroute('**/api/**');
    }

    await page.close();
  }

  report.routes.push(entry);
  save();
  console.log(
    `${route.path.padEnd(30)} anon=${entry.roles.anonymous.finalPath.padEnd(26)} cust=${entry.roles.customer.finalPath.padEnd(26)} staff=${entry.roles.staff.finalPath}`,
  );
}

console.log(`\nwrote ${OUT}/route-report.json  routes=${report.routes.length}`);
await browser.close();

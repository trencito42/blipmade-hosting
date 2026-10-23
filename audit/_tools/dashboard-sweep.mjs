/**
 * Sweeps the views of the customer area and of the staff area and writes what
 * it measures to a JSON file.
 *
 * For every route and every width the script reads what is on the screen: the
 * layout, the tables, the errors of the console, the requests that failed, the
 * calls to action and the state of the page (empty, loading, error or filled).
 * It never writes to the platform: it signs in, reads and measures.
 *
 *   node dashboard-sweep.mjs
 *
 * Environment:
 *   BM_BASE        the address of the site
 *   BM_EMAIL       the account of the customer
 *   BM_PASSWORD   its password
 *   BM_ADMIN_EMAIL the account of the staff
 *   BM_ADMIN_PASSWORD its password
 *   BM_OUT         where the measurements are written
 *   BM_WIDTHS      the widths, separated by commas
 *   BM_ROLE        customer, admin or both
 *   BM_ROUTES      the routes, separated by commas
 */

import fs from 'node:fs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const OUT = process.env.BM_OUT ?? '/tmp/dashboard-sweep.json';
const WIDTHS = (process.env.BM_WIDTHS ?? '1440,834,390').split(',').map(Number);
const ROLE = process.env.BM_ROLE ?? 'both';

/** The routes of the customer area. */
const CUSTOMER_ROUTES = [
  '/app',
  '/app/deploy',
  '/app/instances',
  '/app/domains',
  '/app/billing',
  '/app/tickets',
  '/app/settings',
];

/** The routes of the staff area. */
const ADMIN_ROUTES = [
  '/admin',
  '/admin/customers',
  '/admin/orders',
  '/admin/services',
  '/admin/products',
  '/admin/pricing',
  '/admin/tickets',
  '/admin/promotions',
  '/admin/infrastructure',
  '/admin/audit',
  '/admin/staff',
  '/admin/settings',
];

/** The public routes. */
const PUBLIC_ROUTES = ['/', '/apps', '/apps/wordpress', '/apps/discord-bot', '/docs', '/status'];

const report = { base: BASE, at: new Date().toISOString(), routes: [], errors: [] };

/** Signs in and returns the page of the session. */
async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 30000 });
  return page;
}

/** Reads everything that can be read from the page. */
async function measure(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value);
    const visible = (el) => {
      const box = el.getBoundingClientRect();
      const style = getComputedStyle(el);
      return box.width > 0 && box.height > 0 && style.visibility !== 'hidden' && style.display !== 'none';
    };

    // --- the tables ------------------------------------------------------
    const tables = [...document.querySelectorAll('table')].map((table) => {
      const headers = [...table.querySelectorAll('thead th')].map((th) => {
        const box = th.getBoundingClientRect();
        return { text: (th.textContent ?? '').trim().slice(0, 24), x: round(box.x), width: round(box.width) };
      });
      const rows = [...table.querySelectorAll('tbody tr')];
      const cells = rows[0]
        ? [...rows[0].children].map((cell) => {
            const box = cell.getBoundingClientRect();
            return { text: (cell.textContent ?? '').trim().slice(0, 24), x: round(box.x), width: round(box.width) };
          })
        : [];
      const body = table.querySelector('tbody');
      const box = table.parentElement;
      const offsets = headers.map((header, index) => {
        const cell = cells[index];
        return cell ? Math.abs(header.x - cell.x) : null;
      });
      const known = offsets.filter((value) => value !== null);
      return {
        headers: headers.length,
        cells: cells.length,
        rows: rows.length,
        tbodyDisplay: body ? getComputedStyle(body).display : null,
        maxOffset: known.length ? Math.max(...known) : null,
        tableWidth: round(table.getBoundingClientRect().width),
        containerWidth: box ? round(box.getBoundingClientRect().width) : null,
        rowRight: cells.length ? Math.max(...cells.map((cell) => cell.x + cell.width)) : null,
        truncated: [...table.querySelectorAll('td')].filter((td) => td.scrollWidth > td.clientWidth + 1).length,
        nowrap: [...table.querySelectorAll('td')].filter((td) => getComputedStyle(td).whiteSpace === 'nowrap').length,
      };
    });

    // --- the calls to action ---------------------------------------------
    const ctas = [...document.querySelectorAll('a[href], button')]
      .filter(visible)
      .map((el) => ({
        tag: el.tagName.toLowerCase(),
        label: (el.textContent ?? '').replace(/\s+/g, ' ').trim().slice(0, 40),
        href: el.tagName === 'A' ? el.getAttribute('href') : null,
        disabled: el.hasAttribute('disabled') || el.getAttribute('aria-disabled') === 'true',
      }))
      .filter((el) => el.label.length > 0);

    // --- the accessibility of the page -----------------------------------
    const imagesWithoutAlt = [...document.querySelectorAll('img')].filter((img) => !img.hasAttribute('alt')).length;
    const buttonsWithoutName = [...document.querySelectorAll('button, a[href]')]
      .filter(visible)
      .filter((el) => !(el.textContent ?? '').trim() && !el.getAttribute('aria-label') && !el.getAttribute('title')).length;
    const inputsWithoutLabel = [...document.querySelectorAll('input, select, textarea')].filter((input) => {
      if (input.type === 'hidden') return false;
      const id = input.getAttribute('id');
      const labelled =
        (id && document.querySelector(`label[for="${id}"]`)) ||
        input.getAttribute('aria-label') ||
        input.getAttribute('aria-labelledby') ||
        input.closest('label');
      return !labelled;
    }).length;
    const headings = [...document.querySelectorAll('h1,h2,h3')].map((h) => h.tagName + ':' + (h.textContent ?? '').trim().slice(0, 30));

    // --- the state of the page -------------------------------------------
    const text = document.body.innerText;
    const loading = /loading|se încarcă/i.test(text) && /…|\.\.\./.test(text);
    const empty = /nothing here|no .* yet|niciun|nu există|empty/i.test(text);
    const error = /could not|nu s-a putut|something went wrong|failed/i.test(text);

    // --- the width of the page -------------------------------------------
    const doc = document.documentElement;
    const wide = [...document.querySelectorAll('body *')]
      .filter((el) => el.getBoundingClientRect().right > window.innerWidth + 1)
      .slice(0, 4)
      .map((el) => `${el.tagName.toLowerCase()}.${String(el.className).split(' ').filter(Boolean).slice(0, 3).join('.')}`);

    return {
      url: location.href,
      title: document.title,
      scrollWidth: doc.scrollWidth,
      innerWidth: window.innerWidth,
      overflow: doc.scrollWidth > window.innerWidth + 1,
      wide,
      tables,
      ctas,
      a11y: { imagesWithoutAlt, buttonsWithoutName, inputsWithoutLabel, headings },
      states: { loading, empty, error },
      text: text.replace(/\s+/g, ' ').slice(0, 300),
    };
  });
}

/** Follows the first link that matches a pattern, to find the detail pages. */
async function discover(context, route, pattern) {
  const page = await context.newPage();
  await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const href = await page.evaluate((source) => {
    const link = [...document.querySelectorAll('a[href]')].find((a) => new RegExp(source).test(a.getAttribute('href') ?? ''));
    return link ? link.getAttribute('href') : null;
  }, pattern);
  await page.close();
  return href;
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

try {
  // --- the public pages ---------------------------------------------------
  {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await context.newPage();
    for (const route of PUBLIC_ROUTES) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        const failed = [];
        const onConsole = (message) => {
          if (message.type() === 'error') errors.push(message.text().slice(0, 200));
        };
        const onResponse = (response) => {
          if (response.status() >= 400) failed.push(`${response.status()} ${response.url().slice(0, 120)}`);
        };
        page.on('console', onConsole);
        page.on('response', onResponse);
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1400);
        report.routes.push({ area: 'public', route, width, ...(await measure(page)), consoleErrors: errors, failedRequests: failed });
        page.off('console', onConsole);
        page.off('response', onResponse);
      }
    }
    await context.close();
  }

  // --- the customer area ---------------------------------------------------
  if ((ROLE === 'both' || ROLE === 'customer') && EMAIL && PASSWORD) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await signIn(context, EMAIL, PASSWORD);

    // The detail pages are found from the lists, so the sweep follows the
    // data of the stack it runs against.
    const instanceHref = await discover(context, '/app/instances', /^\/app\/instances\/[^/?]+/);
    const ticketHref = await discover(context, '/app/tickets', /^\/app\/tickets\/[^/?]+/);
    const routes = [...CUSTOMER_ROUTES];
    if (instanceHref) routes.push(instanceHref);
    if (ticketHref) routes.push(ticketHref);

    for (const route of routes) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        const failed = [];
        const onConsole = (message) => {
          if (message.type() === 'error') errors.push(message.text().slice(0, 200));
        };
        const onResponse = (response) => {
          if (response.status() >= 400) failed.push(`${response.status()} ${response.url().slice(0, 120)}`);
        };
        page.on('console', onConsole);
        page.on('response', onResponse);
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        report.routes.push({ area: 'customer', route, width, ...(await measure(page)), consoleErrors: errors, failedRequests: failed });
        page.off('console', onConsole);
        page.off('response', onResponse);
      }
    }
    await context.close();
  }

  // --- the staff area ------------------------------------------------------
  if ((ROLE === 'both' || ROLE === 'admin') && ADMIN_EMAIL && ADMIN_PASSWORD) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await signIn(context, ADMIN_EMAIL, ADMIN_PASSWORD);
    const customerHref = await discover(context, '/admin/customers', /^\/admin\/customers\/[^/?]+/);
    const routes = [...ADMIN_ROUTES];
    if (customerHref) routes.push(customerHref);

    for (const route of routes) {
      for (const width of WIDTHS) {
        await page.setViewportSize({ width, height: 900 });
        const errors = [];
        const failed = [];
        const onConsole = (message) => {
          if (message.type() === 'error') errors.push(message.text().slice(0, 200));
        };
        const onResponse = (response) => {
          if (response.status() >= 400) failed.push(`${response.status()} ${response.url().slice(0, 120)}`);
        };
        page.on('console', onConsole);
        page.on('response', onResponse);
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        report.routes.push({ area: 'admin', route, width, ...(await measure(page)), consoleErrors: errors, failedRequests: failed });
        page.off('console', onConsole);
        page.off('response', onResponse);
      }
    }
    await context.close();
  }
} catch (error) {
  report.errors.push(error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

for (const entry of report.routes) {
  const tables = entry.tables.map((t) => `${t.headers}/${t.cells} off=${t.maxOffset} disp=${t.tbodyDisplay}`).join(' | ');
  console.log(
    `${entry.area} ${String(entry.width).padStart(4)}px ${entry.route}: overflow=${entry.overflow ? 'YES' : 'no'} tables=[${tables}] a11y=${entry.a11y.buttonsWithoutName}/${entry.a11y.inputsWithoutLabel}/${entry.a11y.imagesWithoutAlt} errors=${entry.consoleErrors.length} failed=${entry.failedRequests.length}`,
  );
}
for (const error of report.errors) console.log(`ERROR ${error}`);
console.log(`written: ${OUT}`);

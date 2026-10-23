import fs from 'node:fs';

/**
 * Reproduction and verification of the three UI/UX inconsistencies.
 *
 * The script never writes to the platform: it signs in, reads the pages and
 * measures the layout. It measures what is on the screen, not what the code
 * intends, so it can be run before and after the fix and show the difference.
 *
 *   ISSUE 1  the price of the catalog against the price of the configurator
 *   ISSUE 2  the alignment of the columns of the tables
 *   ISSUE 3  the deploy button of a product that cannot be deployed
 *
 * The session is created once per role and reused for every width, because
 * the login of the platform is limited to a few attempts per address.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const ADMIN_EMAIL = process.env.BM_ADMIN_EMAIL ?? '';
const ADMIN_PASSWORD = process.env.BM_ADMIN_PASSWORD ?? '';
const OUT = process.env.BM_OUT ?? '/tmp/repro-uiux.json';

const WIDTHS = (process.env.BM_WIDTHS ?? '1440,834,390').split(',').map(Number);

const report = { issue1: [], issue2: [], issue3: [], errors: [] };

function fail(scope, message) {
  report.errors.push(`${scope}: ${message}`);
}

async function signIn(context, email, password) {
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'domcontentloaded' });
  await page.fill('input[type="email"]', email);
  await page.fill('input[type="password"]', password);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/(app|admin)(\/|$)/, { timeout: 30000 });
  return page;
}

/**
 * Reads the tables of the page and compares the position of every header with
 * the position of the cell below it. In a table that works, the two are the
 * same. The width of the row against the width of the box says whether the row
 * fills the box or only a part of it.
 */
async function measureTables(page) {
  return page.evaluate(() => {
    const round = (value) => Math.round(value);
    return [...document.querySelectorAll('table')].map((table) => {
      const headers = [...table.querySelectorAll('thead th')].map((th) => {
        const box = th.getBoundingClientRect();
        return { text: (th.textContent ?? '').trim().slice(0, 24), x: round(box.x), width: round(box.width) };
      });
      const rows = [...table.querySelectorAll('tbody tr')];
      const cells = rows[0]
        ? [...rows[0].children].map((cell) => {
            const box = cell.getBoundingClientRect();
            return {
              text: (cell.textContent ?? '').trim().slice(0, 24),
              x: round(box.x),
              y: round(box.y),
              width: round(box.width),
            };
          })
        : [];
      const body = table.querySelector('tbody');
      const box = table.parentElement;
      const tableBox = table.getBoundingClientRect();
      // The distance between the header and the cell of the same column.
      const offsets = headers.map((header, index) => {
        const cell = cells[index];
        return cell ? Math.abs(header.x - cell.x) : null;
      });
      const offsetsKnown = offsets.filter((value) => value !== null);
      // The width of the row of the body against the width of the table.
      const rowRight = cells.length ? Math.max(...cells.map((cell) => cell.x + cell.width)) : 0;
      return {
        headers,
        cells,
        rowCount: rows.length,
        tbodyDisplay: body ? getComputedStyle(body).display : null,
        tableWidth: round(tableBox.width),
        containerWidth: box ? round(box.getBoundingClientRect().width) : null,
        // The columns of a table that works sit on top of each other.
        maxOffset: offsetsKnown.length ? Math.max(...offsetsKnown) : null,
        // The row of a table that works reaches the end of the table.
        rowRight,
      };
    });
  });
}

/** Reads the price of a product page and the estimate of the configurator. */
async function readPriceFlow(page, slug) {
  await page.goto(`${BASE}/apps/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(1200);
  const page1 = await page.evaluate(() => {
    const text = document.body.innerText;
    const price = text.match(/€\s?\d+[.,]\d{2}/);
    const minimum = text.match(/Minimum resources[\s\S]{0,220}/);
    const cta = [...document.querySelectorAll('a,button')].filter((el) =>
      /deploy this (app|database)/i.test(el.textContent ?? ''),
    );
    return {
      price: price ? price[0] : null,
      minimumPanel: minimum ? minimum[0].replace(/\s+/g, ' ').slice(0, 220) : null,
      ctaCount: cta.length,
      ctaText: cta[0] ? (cta[0].textContent ?? '').trim() : null,
      ctaHref: cta[0] && cta[0].tagName === 'A' ? cta[0].getAttribute('href') : null,
      ctaDisabled: cta[0] && cta[0].hasAttribute('disabled') ? true : false,
      reason: (text.match(/This product cannot be ordered yet\.[^\n]*/) || [])[0] ?? null,
    };
  });

  await page.goto(`${BASE}/app/deploy/${slug}`, { waitUntil: 'domcontentloaded' });
  await page.waitForTimeout(2000);
  const page2 = await page.evaluate(() => {
    const text = document.body.innerText;
    const money = [...text.matchAll(/€\s?\d+[.,]\d{2}/g)].map((match) => match[0]);
    const pressed = [...document.querySelectorAll('button[aria-pressed="true"]')].map((el) => (el.textContent ?? '').trim());
    const disk = document.querySelector('#deploy-disk');
    return {
      money: money.slice(0, 12),
      pressed: pressed,
      disk: disk ? disk.value : null,
      url: location.href,
      blocked: /cannot be ordered|not available to deploy|not validated for deployment/i.test(text),
      starting: (text.match(/Starting price[^\n]*/) || [])[0] ?? null,
      recommended: (text.match(/Recommended configuration[^\n]*/) || [])[0] ?? null,
    };
  });

  return { productPage: page1, configurator: page2 };
}

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

try {
  // --- ISSUE 1 and ISSUE 3: the pages of the products ------------------------
  if (EMAIL && PASSWORD) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await signIn(context, EMAIL, PASSWORD);

    for (const slug of (process.env.BM_PRODUCTS ?? 'wordpress,discord-bot').split(',')) {
      const flow = await readPriceFlow(page, slug.trim());
      report.issue1.push({ slug, ...flow });
      report.issue3.push({
        slug,
        ctaCount: flow.productPage.ctaCount,
        ctaText: flow.productPage.ctaText,
        ctaHref: flow.productPage.ctaHref,
        reason: flow.productPage.reason,
        blockedInConfigurator: flow.configurator.blocked,
      });
    }

    // The configuration has to survive a refresh and the back button.
    const slug = (process.env.BM_PRODUCTS ?? 'discord-bot').split(',')[0].trim();
    await page.goto(`${BASE}/app/deploy/${slug}?ram=2048&cpu=2&disk=20`, { waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const before = await page.evaluate(() => ({
      url: location.href,
      pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map((el) => (el.textContent ?? '').trim()),
      disk: document.querySelector('#deploy-disk')?.value ?? null,
    }));
    await page.reload({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const afterReload = await page.evaluate(() => ({
      url: location.href,
      pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map((el) => (el.textContent ?? '').trim()),
      disk: document.querySelector('#deploy-disk')?.value ?? null,
    }));
    await page.goBack({ waitUntil: 'domcontentloaded' });
    await page.waitForTimeout(1500);
    const afterBack = await page.evaluate(() => ({
      url: location.href,
      pressed: [...document.querySelectorAll('button[aria-pressed="true"]')].map((el) => (el.textContent ?? '').trim()),
      disk: document.querySelector('#deploy-disk')?.value ?? null,
    }));
    report.issue1.push({ slug, navigation: { before, afterReload, afterBack } });

    // --- ISSUE 2: the tables of the customer area ----------------------------
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of (process.env.BM_CUSTOMER_ROUTES ?? '/app/tickets,/app/instances,/app/billing').split(',')) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        report.issue2.push({ role: 'customer', width, route, tables: await measureTables(page) });
      }
    }

    await context.close();
  }

  // --- ISSUE 2: the tables of the staff area ---------------------------------
  if (ADMIN_EMAIL && ADMIN_PASSWORD) {
    const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
    const page = await signIn(context, ADMIN_EMAIL, ADMIN_PASSWORD);
    for (const width of WIDTHS) {
      await page.setViewportSize({ width, height: 900 });
      for (const route of (process.env.BM_ADMIN_ROUTES ?? '/admin/customers,/admin/orders,/admin/services,/admin/tickets').split(',')) {
        await page.goto(`${BASE}${route}`, { waitUntil: 'domcontentloaded' });
        await page.waitForTimeout(1500);
        report.issue2.push({ role: 'admin', width, route, tables: await measureTables(page) });
      }
    }
    await context.close();
  }
} catch (error) {
  fail('script', error instanceof Error ? error.stack ?? error.message : String(error));
} finally {
  await browser.close();
}

fs.writeFileSync(OUT, JSON.stringify(report, null, 2));

// A short summary that can be read without opening the file.
for (const entry of report.issue1) {
  if (entry.navigation) {
    console.log(
      `ISSUE1 ${entry.slug} navigation: before=${entry.navigation.before.url} ram=${entry.navigation.before.pressed.join('|')} disk=${entry.navigation.before.disk}`,
    );
    console.log(
      `ISSUE1 ${entry.slug} after reload: ram=${entry.navigation.afterReload.pressed.join('|')} disk=${entry.navigation.afterReload.disk} | after back: ram=${entry.navigation.afterBack.pressed.join('|')} disk=${entry.navigation.afterBack.disk}`,
    );
    continue;
  }
  console.log(
    `ISSUE1 ${entry.slug}: catalog=${entry.productPage.price} configurator=${entry.configurator.money.join(' ')} pressed=${entry.configurator.pressed.join('|')} disk=${entry.configurator.disk}`,
  );
  console.log(`      starting="${entry.configurator.starting}" recommended="${entry.configurator.recommended}"`);
}
for (const entry of report.issue3) {
  console.log(`ISSUE3 ${entry.slug}: cta=${entry.ctaCount} text="${entry.ctaText}" reason="${entry.reason}" blockedInConfigurator=${entry.blockedInConfigurator}`);
}
for (const entry of report.issue2) {
  for (const table of entry.tables) {
    console.log(
      `ISSUE2 ${entry.role} ${entry.width}px ${entry.route}: headers=${table.headers.length} cells=${table.cells.length} tbodyDisplay=${table.tbodyDisplay} maxOffset=${table.maxOffset} tableWidth=${table.tableWidth} rowRight=${table.rowRight}`,
    );
  }
}
for (const error of report.errors) console.log(`ERROR ${error}`);
console.log(`written: ${OUT}`);

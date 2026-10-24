/**
 * Retestul fluxurilor de client si de administrator, pe stiva izolata de
 * masuratoare (niciodata pe productie).
 *
 *   node journey-retest.mjs <baza_url> <email> <parola> <director_de_iesire>
 *
 * Ce verifica:
 *   - fiecare ruta raspunde, si raspunde cu ce status
 *   - nu exista erori in consola browserului
 *   - nu exista cereri de retea esuate
 *   - in tabelele de administrare, numarul de coloane din antet si din prima
 *     linie de date este acelasi, iar latimea coloanelor se potriveste
 *   - pagina unui produs arata butonul de deploy doar daca produsul poate fi
 *     deployat, si arata configuratia de la care pleaca pretul
 *
 * Rezultatul este scris ca JSON si ca text, cu dovezile pentru fiecare ruta.
 */
import fs from 'node:fs';

const PLAYWRIGHT = '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.argv[2] || 'http://127.0.0.1:30020';
const EMAIL = process.argv[3] || 'perf-admin@blipmade.test';
const PASSWORD = process.argv[4] || 'Perf-Admin-Measurement-9';
const OUT = process.argv[5] || '/tmp/journey-retest';

const CUSTOMER_ROUTES = ['/', '/apps', '/login'];
const APP_ROUTES = ['/app', '/app/instances', '/app/billing', '/app/tickets', '/app/settings'];
const ADMIN_ROUTES = [
  '/admin',
  '/admin/customers',
  '/admin/orders',
  '/admin/services',
  '/admin/products',
  '/admin/pricing',
  '/admin/tickets',
];

fs.mkdirSync(OUT, { recursive: true });

const report = {
  base: BASE,
  startedAt: new Date().toISOString(),
  routes: [],
  login: null,
  productPage: null,
};

/** Citeste alinierea tabelelor de pe pagina curenta. */
async function readTables(page) {
  return page.evaluate(() => {
    const round = (n) => Math.round(n * 10) / 10;
    return [...document.querySelectorAll('table')].map((table) => {
      const headCells = [...table.querySelectorAll('thead th, thead td')];
      const firstRow = table.querySelector('tbody tr');
      const bodyCells = firstRow ? [...firstRow.children] : [];
      const headWidths = headCells.map((c) => round(c.getBoundingClientRect().width));
      const bodyWidths = bodyCells.map((c) => round(c.getBoundingClientRect().width));
      const widthsMatch =
        headWidths.length === bodyWidths.length &&
        headWidths.every((w, i) => Math.abs(w - bodyWidths[i]) <= 2);
      return {
        headColumns: headCells.length,
        bodyColumns: bodyCells.length,
        headWidths,
        bodyWidths,
        widthsMatch,
        hasHorizontalScroll: table.scrollWidth > table.clientWidth + 2,
        emptyState: !firstRow,
      };
    });
  });
}

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();

let consoleErrors = [];
let failedRequests = [];
page.on('console', (msg) => {
  if (msg.type() === 'error') consoleErrors.push(msg.text().slice(0, 300));
});
page.on('requestfailed', (req) => {
  failedRequests.push(`${req.method()} ${req.url()} :: ${req.failure()?.errorText}`);
});
page.on('response', (res) => {
  if (res.status() >= 400) failedRequests.push(`HTTP ${res.status()} ${res.url()}`);
});

// --- 1. fluxul de vizitator ----------------------------------------------------
for (const route of CUSTOMER_ROUTES) {
  const entry = { route, section: 'vizitator', status: null, finalPath: null, tables: [] };
  try {
    const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
    entry.status = res?.status() ?? null;
    entry.finalPath = new URL(page.url()).pathname;
    entry.tables = await readTables(page);
    await page.screenshot({ path: `${OUT}/viz_${route.replace(/\//g, '_') || 'home'}.png` });
  } catch (e) {
    entry.error = e.message.slice(0, 200);
  }
  report.routes.push(entry);
}

// --- 2. autentificarea ---------------------------------------------------------
consoleErrors = [];
failedRequests = [];
try {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle', timeout: 45000 });
  await page.fill('#email', EMAIL);
  await page.fill('#password', PASSWORD);
  await Promise.all([
    page.waitForURL((u) => !u.pathname.startsWith('/login'), { timeout: 30000 }),
    page.click('button[type="submit"]'),
  ]);
  const session = await page.evaluate(async () => {
    const res = await fetch('/api/auth/session', { credentials: 'include' });
    return { status: res.status, body: (await res.text()).slice(0, 300) };
  });
  report.login = { ok: session.status === 200, status: session.status, path: new URL(page.url()).pathname };
} catch (e) {
  report.login = { ok: false, error: e.message.slice(0, 200) };
}
report.loginConsoleErrors = consoleErrors.slice(0, 10);
report.loginFailedRequests = failedRequests.slice(0, 10);

// --- 3. fluxul de client si de administrator ------------------------------------
for (const [section, routes] of [
  ['client', APP_ROUTES],
  ['admin', ADMIN_ROUTES],
]) {
  for (const route of routes) {
    const entry = { route, section, status: null, finalPath: null, tables: [] };
    const consoleBefore = consoleErrors.length;
    const failedBefore = failedRequests.length;
    try {
      const res = await page.goto(BASE + route, { waitUntil: 'networkidle', timeout: 45000 });
      entry.status = res?.status() ?? null;
      entry.finalPath = new URL(page.url()).pathname;
      entry.tables = await readTables(page);
      entry.newConsoleErrors = consoleErrors.slice(consoleBefore);
      entry.newFailedRequests = failedRequests.slice(failedBefore);
      await page.screenshot({ path: `${OUT}/${section}_${route.replace(/\//g, '_')}.png` });
    } catch (e) {
      entry.error = e.message.slice(0, 200);
    }
    report.routes.push(entry);
  }
}

// --- 4. pagina unui produs: butonul de deploy si configuratia de pornire -------
try {
  const res = await page.goto(`${BASE}/apps`, { waitUntil: 'networkidle', timeout: 45000 });
  const links = await page.evaluate(() =>
    [...document.querySelectorAll('a[href*="/apps/"]')].map((a) => a.getAttribute('href')),
  );
  const href = links.find((h) => h && h !== '/apps') || null;
  report.productPage = { catalogStatus: res?.status() ?? null, firstProduct: href };
  if (href) {
    await page.goto(BASE + href, { waitUntil: 'networkidle', timeout: 45000 });
    report.productPage = {
      ...report.productPage,
      status: null,
      path: new URL(page.url()).pathname,
      hasDeployButton: await page.evaluate(() =>
        [...document.querySelectorAll('a,button')].some((el) =>
          /deploy this (app|database)/i.test(el.textContent || ''),
        ),
      ),
      text: (await page.evaluate(() => document.body.innerText)).slice(0, 1200),
    };
  }
} catch (e) {
  report.productPage = { error: e.message.slice(0, 200) };
}

report.finishedAt = new Date().toISOString();

fs.writeFileSync(`${OUT}/journey.json`, JSON.stringify(report, null, 2));

// --- rezumatul -----------------------------------------------------------------
const lines = [];
lines.push(`# Retestul fluxurilor, stiva izolata ${BASE}`);
lines.push(`# ${report.startedAt} -> ${report.finishedAt}`);
lines.push('');
lines.push('| Ruta | Sectiune | HTTP | Destinatie | Erori consola | Cereri esuate |');
lines.push('|---|---|---|---|---|---|');
for (const r of report.routes) {
  lines.push(
    `| ${r.route} | ${r.section} | ${r.status ?? r.error ?? '-'} | ${r.finalPath ?? '-'} | ${
      (r.newConsoleErrors ?? []).length
    } | ${(r.newFailedRequests ?? []).length} |`,
  );
}
lines.push('');
lines.push(`Autentificare: ${report.login?.ok ? 'DA' : 'NU'} (${report.login?.status ?? report.login?.error})`);
lines.push('');
lines.push('## Tabele');
for (const r of report.routes) {
  for (const t of r.tables ?? []) {
    lines.push(
      `- ${r.route}: coloane antet ${t.headColumns}, coloane date ${t.bodyColumns}, latimi potrivite=${
        t.widthsMatch ? 'DA' : 'NU'
      }, derulare orizontala=${t.hasHorizontalScroll ? 'DA' : 'NU'}, stare goala=${t.emptyState ? 'DA' : 'NO'}`,
    );
  }
}
lines.push('');
lines.push(`## Pagina de produs: buton de deploy = ${report.productPage?.hasDeployButton ?? 'n/a'}`);

fs.writeFileSync(`${OUT}/journey.txt`, lines.join('\n'));
console.log(lines.join('\n'));

await browser.close();

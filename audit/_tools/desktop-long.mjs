import fs from 'node:fs';

/**
 * The desktop sweep at 1920 and the long-content probe.
 *
 * Part one: every route at 1920 px, in the three roles, with the full page.
 *
 * Part two: the long-content case. The production data set holds no long
 * instance name, no long address and no domain, so the long text is put into
 * the live DOM of the running page and the overflow is measured again. The
 * CSS, the boxes and the breakpoints are the real ones; only the string is
 * synthetic. The long ticket subject is NOT synthetic: the ticket
 * `cmvkn40w50037ps01eiupqv3y` really carries a 96 character subject.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const LONG = 'blipmade-very-long-customer-name-for-layout-testing@example-domain.test';

const ROUTES = [
  { path: '/', role: 'anonymous' },
  { path: '/apps', role: 'anonymous' },
  { path: '/apps/discord-bot', role: 'anonymous' },
  { path: '/docs', role: 'anonymous' },
  { path: '/status', role: 'anonymous' },
  { path: '/login', role: 'anonymous' },
  { path: '/register', role: 'anonymous' },
  { path: '/app', role: 'customer' },
  { path: '/app/instances', role: 'customer' },
  { path: '/app/instances/cmvkbgm9h0001r18096ep5jzl', role: 'customer' },
  { path: '/app/deploy', role: 'customer' },
  { path: '/app/deploy/discord-bot', role: 'customer' },
  { path: '/app/domains', role: 'customer' },
  { path: '/app/billing', role: 'customer' },
  { path: '/app/tickets', role: 'customer' },
  { path: '/app/tickets/cmvkn40w50037ps01eiupqv3y', role: 'customer' },
  { path: '/app/settings', role: 'customer' },
  { path: '/admin', role: 'staff' },
  { path: '/admin/customers', role: 'staff' },
  { path: '/admin/customers/cmvkbgm1f0000r101e4xeztm7', role: 'staff' },
  { path: '/admin/orders', role: 'staff' },
  { path: '/admin/services', role: 'staff' },
  { path: '/admin/products', role: 'staff' },
  { path: '/admin/pricing', role: 'staff' },
  { path: '/admin/tickets', role: 'staff' },
  { path: '/admin/promotions', role: 'staff' },
  { path: '/admin/infrastructure', role: 'staff' },
  { path: '/admin/audit', role: 'staff' },
  { path: '/admin/staff', role: 'staff' },
  { path: '/admin/settings', role: 'staff' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = { at: new Date().toISOString(), long: [] };

const contexts = {};
for (const [role, state] of [
  ['anonymous', null],
  ['customer', 'state-customer.json'],
  ['staff', 'state-staff.json'],
]) {
  contexts[role] = await browser.newContext({
    viewport: { width: 1920, height: 1080 },
    deviceScaleFactor: 1,
    storageState: state ? `${OUT}/${state}` : undefined,
  });
}

for (const route of ROUTES) {
  const context = contexts[route.role];
  const page = await context.newPage();
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const name = `w1920-${route.role}-${route.path.replace(/^\//, '').replace(/[/?=&:]/g, '_') || 'home'}.png`;
  await page.screenshot({ path: `${SHOT}/${name}`, fullPage: true });

  // --- the long content ---------------------------------------------------
  const probe = await page.evaluate((long) => {
    const root = document.documentElement;
    const before = root.scrollWidth;

    // The elements that carry a name: a title, an address, a piece of text
    // that the customer reads as a name.
    const targets = [...document.querySelectorAll('h1, h2, h3, a, span, p, td, strong, b, code')].filter((el) => {
      const t = (el.textContent || '').trim();
      if (!t || t.length > 60) return false;
      if (el.children.length > 0) return false;
      const r = el.getBoundingClientRect();
      return r.width > 0 && r.height > 0;
    });

    const changed = [];
    for (const el of targets.slice(0, 40)) {
      const original = el.textContent;
      el.textContent = long;
      changed.push({ el, original });
    }

    const overflowing = [];
    for (const el of document.querySelectorAll('body *')) {
      const style = getComputedStyle(el);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      if (style.textOverflow === 'ellipsis') continue;
      if (el.clientWidth <= 1) continue;
      const over = el.scrollWidth - el.clientWidth;
      if (over <= 1) continue;
      const box = el.getBoundingClientRect();
      overflowing.push({
        selector: el.tagName.toLowerCase() + (el.id ? `#${el.id}` : '') + '.' + String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.'),
        text: (el.textContent || '').trim().slice(0, 50),
        over,
        width: Math.round(box.width),
        right: Math.round(box.right),
      });
    }
    const past = [...document.querySelectorAll('body *')]
      .filter((el) => {
        const box = el.getBoundingClientRect();
        return box.width && box.right > window.innerWidth + 1;
      })
      .map((el) => ({
        selector: el.tagName.toLowerCase() + '.' + String(el.className || '').trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.'),
        right: Math.round(el.getBoundingClientRect().right),
        text: (el.textContent || '').trim().slice(0, 40),
      }));

    const after = root.scrollWidth;

    for (const { el, original } of changed) el.textContent = original;

    return {
      scrollWidthBefore: before,
      scrollWidthAfter: after,
      layoutViewport: root.clientWidth,
      changedCount: changed.length,
      overflowing: overflowing.slice(0, 10),
      past: past.slice(0, 6),
    };
  }, LONG);

  if (probe.scrollWidthAfter > probe.layoutViewport || probe.overflowing.length || probe.past.length) {
    out.long.push({ path: route.path, role: route.role, ...probe });
  }
  await page.close();
  console.log(
    `${route.path.padEnd(44)} scroll ${probe.scrollWidthBefore}->${probe.scrollWidthAfter} vp=${probe.layoutViewport} overflow=${probe.overflowing.length} past=${probe.past.length}`,
  );
}

fs.writeFileSync(`${OUT}/long-content.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}/long-content.json  affected=${out.long.length}`);
await browser.close();

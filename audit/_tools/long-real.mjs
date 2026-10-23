import fs from 'node:fs';

/**
 * The long content that really exists.
 *
 * The production data set holds a ticket with a 96 character subject:
 * "My Discord bot keeps crashing after the latest update and I cannot open
 * the console to read the logs". It is a real row, not a string put in by a
 * script, so the measurement is a measurement of the product.
 *
 * The same script also checks the fixed bar of the phone: the last thing a
 * customer can read must not stay behind it.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const TICKET = 'cmvkn40w50037ps01eiupqv3y';
const LONG_SUBJECT = 'My Discord bot keeps crashing after the latest update and I cannot open the console to read the logs';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = [];

for (const width of [320, 390, 1280]) {
  const context = await browser.newContext({
    viewport: { width, height: 780 },
    deviceScaleFactor: 2,
    isMobile: width < 700,
    hasTouch: width < 700,
    storageState: `${OUT}/state-customer.json`,
  });
  const page = await context.newPage();

  // --- the list of the tickets, with the row that really has a long subject
  await page.goto(`${BASE}/app/tickets`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const row = await page.evaluate((subject) => {
    const link = [...document.querySelectorAll('a')].find((a) => a.textContent.includes(subject.slice(0, 40)));
    if (!link) return { found: false };
    const tr = link.closest('tr') || link.closest('li') || link.parentElement;
    const cell = link.closest('td') || link;
    const r = tr.getBoundingClientRect();
    const c = cell.getBoundingClientRect();
    const s = getComputedStyle(tr);
    const sc = getComputedStyle(cell);
    return {
      found: true,
      subject: subject.length,
      rowWidth: Math.round(r.width),
      rowScrollWidth: tr.scrollWidth,
      rowClientWidth: tr.clientWidth,
      rowOverflow: tr.scrollWidth - tr.clientWidth,
      rowTextOverflow: s.textOverflow,
      rowWhiteSpace: s.whiteSpace,
      cellWidth: Math.round(c.width),
      cellScrollWidth: cell.scrollWidth,
      cellOverflow: cell.scrollWidth - cell.clientWidth,
      cellTextOverflow: sc.textOverflow,
      linkText: link.textContent.slice(0, 120),
      linkVisibleWidth: Math.round(link.getBoundingClientRect().width),
      linkScrollWidth: link.scrollWidth,
      rowRight: Math.round(r.right),
      viewport: window.innerWidth,
    };
  }, LONG_SUBJECT);
  await page.screenshot({ path: `${SHOT}/long-ticket-list-${width}.png`, fullPage: width >= 1280 });
  out.push({ width, page: '/app/tickets', ...row });
  console.log(`\n[list ${width}]`, JSON.stringify(row, null, 1));

  // --- the page of the ticket
  await page.goto(`${BASE}/app/tickets/${TICKET}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1500);
  const detail = await page.evaluate((subject) => {
    const el = [...document.querySelectorAll('h1, h2, h3, dd, p, span')].find((e) => e.textContent.trim() === subject);
    if (!el) return { found: false };
    const s = getComputedStyle(el);
    const parent = el.parentElement;
    const ps = getComputedStyle(parent);
    return {
      found: true,
      tag: el.tagName.toLowerCase(),
      cls: String(el.className).slice(0, 120),
      width: Math.round(el.getBoundingClientRect().width),
      scrollWidth: el.scrollWidth,
      overflow: el.scrollWidth - el.clientWidth,
      textOverflow: s.textOverflow,
      whiteSpace: s.whiteSpace,
      overflowWrap: s.overflowWrap,
      wordBreak: s.wordBreak,
      parentWidth: Math.round(parent.getBoundingClientRect().width),
      parentOverflow: parent.scrollWidth - parent.clientWidth,
      parentTextOverflow: ps.textOverflow,
      parentWhiteSpace: ps.whiteSpace,
      parentOverflowWrap: ps.overflowWrap,
    };
  }, LONG_SUBJECT);
  await page.screenshot({ path: `${SHOT}/long-ticket-detail-${width}.png`, fullPage: width >= 1280 });
  out.push({ width, page: `/app/tickets/:id`, ...detail });
  console.log(`\n[detail ${width}]`, JSON.stringify(detail, null, 1));

  await context.close();
}

// --- the fixed bar of the phone ------------------------------------------------
for (const width of [320, 390]) {
  for (const path of ['/app', '/app/instances/cmvkbgm9h0001r18096ep5jzl', '/app/tickets', '/app/settings']) {
    const context = await browser.newContext({
      viewport: { width, height: 780 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      storageState: `${OUT}/state-customer.json`,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1200);
    const info = await page.evaluate(async () => {
      window.scrollTo(0, 999999);
      await new Promise((r) => setTimeout(r, 400));
      window.scrollTo(0, 999999);
      await new Promise((r) => setTimeout(r, 400));
      const bar = [...document.querySelectorAll('nav')].find((n) => {
        const s = getComputedStyle(n);
        const b = n.getBoundingClientRect();
        return s.position === 'fixed' && b.height > 20 && b.bottom > window.innerHeight - 5;
      });
      const barBox = bar ? bar.getBoundingClientRect() : null;
      const leaves = [...document.querySelectorAll('main *, main')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.height > 0 && r.width > 0 && s.visibility !== 'hidden' && el.children.length === 0 && el.textContent.trim();
        })
        .map((el) => ({ el, box: el.getBoundingClientRect() }));
      const last = leaves.length ? leaves[leaves.length - 1] : null;
      const main = document.querySelector('main');
      return {
        barTop: barBox ? Math.round(barBox.top) : null,
        barHeight: barBox ? Math.round(barBox.height) : null,
        mainPaddingBottom: main ? getComputedStyle(main).paddingBottom : null,
        bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
        lastText: last ? last.el.textContent.trim().slice(0, 46) : null,
        lastBottom: last ? Math.round(last.box.bottom) : null,
        hidden: barBox && last ? last.box.bottom > barBox.top + 1 : null,
        atBottom: Math.round(window.scrollY) >= Math.round(document.body.scrollHeight - window.innerHeight) - 4,
      };
    });
    await page.screenshot({ path: `${SHOT}/bar-${width}-${path.replace(/^\//, '').replace(/[/?=&:]/g, '_')}.png` });
    out.push({ width, page: path, bar: info });
    console.log(
      `${width}px ${path.padEnd(44)} barTop=${info.barTop} lastBottom=${info.lastBottom} hidden=${info.hidden} pad=${info.mainPaddingBottom}/${info.bodyPaddingBottom} atBottom=${info.atBottom}`,
    );
    await context.close();
  }
}

fs.writeFileSync(`${OUT}/long-real.json`, JSON.stringify(out, null, 2));
console.log(`\nwrote ${OUT}/long-real.json`);
await browser.close();

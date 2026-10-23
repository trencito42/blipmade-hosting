import fs from 'node:fs';

/**
 * Two details of the instance page on a phone, measured.
 *
 *  1. The strip of the twelve tabs: is it a scroll strip, and does it fit?
 *  2. The row of the activity: the text of the event is longer than the card.
 *     The row is `truncate` with a `break-words` child, and the script of the
 *     sweep reported the child beyond the edge of the screen. The question is
 *     whether the customer sees an ellipsis or a cut line.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';
const INSTANCE = 'cmvkbgm9h0001r18096ep5jzl';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

for (const width of [320, 360, 390, 430]) {
  const context = await browser.newContext({
    viewport: { width, height: 780 },
    deviceScaleFactor: 3,
    isMobile: true,
    hasTouch: true,
    storageState: `${OUT}/state-customer.json`,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}/app/instances/${INSTANCE}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(2000);

  const info = await page.evaluate(() => {
    // The strip that holds the tabs.
    const strip = [...document.querySelectorAll('div')].find((el) => {
      const s = getComputedStyle(el);
      return (
        (s.overflowX === 'auto' || s.overflowX === 'scroll') &&
        el.querySelectorAll('button').length >= 8 &&
        el.getBoundingClientRect().height < 90
      );
    });
    const stripBox = strip ? strip.getBoundingClientRect() : null;
    const stripStyle = strip ? getComputedStyle(strip) : null;

    // The row of the activity: the text that is longer than the card.
    const p = document.querySelector('p.truncate');
    const span = p ? p.querySelector('span') : null;
    const pBox = p ? p.getBoundingClientRect() : null;
    const spanBox = span ? span.getBoundingClientRect() : null;

    // The clipper: the nearest ancestor that hides the overflow.
    let clipper = null;
    if (span) {
      let node = span.parentElement;
      while (node && node !== document.body) {
        const s = getComputedStyle(node);
        if (s.overflow === 'hidden' || s.overflowX === 'hidden') {
          const box = node.getBoundingClientRect();
          clipper = { selector: node.tagName.toLowerCase() + '.' + String(node.className).trim().split(/\s+/).slice(0, 3).join('.'), overflow: s.overflow, right: Math.round(box.right), width: Math.round(box.width) };
          break;
        }
        node = node.parentElement;
      }
    }

    const nav = document.querySelector('nav');
    const navBox = nav ? nav.getBoundingClientRect() : null;

    return {
      viewport: window.innerWidth,
      strip: stripBox
        ? {
            overflowX: stripStyle.overflowX,
            scrollWidth: strip.scrollWidth,
            clientWidth: strip.clientWidth,
            canScroll: strip.scrollWidth > strip.clientWidth,
            right: Math.round(stripBox.right),
            tabs: strip.querySelectorAll('button').length,
          }
        : null,
      activity: p
        ? {
            pWidth: Math.round(pBox.width),
            pRight: Math.round(pBox.right),
            pOverflow: getComputedStyle(p).overflow,
            pTextOverflow: getComputedStyle(p).textOverflow,
            pWhiteSpace: getComputedStyle(p).whiteSpace,
            spanText: (span?.textContent || '').slice(0, 80),
            spanRight: spanBox ? Math.round(spanBox.right) : null,
            spanScrollWidth: span ? span.scrollWidth : null,
            clipper,
          }
        : null,
      bottomNav: navBox ? { right: Math.round(navBox.right), width: Math.round(navBox.width), bottom: Math.round(navBox.bottom) } : null,
      layoutViewport: document.documentElement.clientWidth,
      docScrollWidth: document.documentElement.scrollWidth,
    };
  });

  await page.screenshot({ path: `${SHOT}/inst-${width}-viewport.png` });
  const activity = page.locator('text=Recent activity').first();
  if (await activity.count()) {
    await activity.scrollIntoViewIfNeeded();
    await page.waitForTimeout(400);
    await page.screenshot({ path: `${SHOT}/inst-${width}-activity.png` });
  }

  console.log(`\n=== ${width}px ===`);
  console.log(JSON.stringify(info, null, 2));
  await context.close();
}

await browser.close();

import fs from 'node:fs';

/**
 * Does the fixed bottom bar of the phone hide the end of the content?
 *
 * The bar is `position: fixed` at the bottom. The page has to reserve room
 * for it, or the last element of the page stays behind the bar and cannot
 * be scrolled out from under it.
 *
 * The check: scroll the page to the end and compare the bottom of the last
 * element with the top of the bar.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const ROUTES = [
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
  { path: '/admin/audit', role: 'staff' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = [];

for (const width of [320, 390]) {
  for (const route of ROUTES) {
    const context = await browser.newContext({
      viewport: { width, height: 780 },
      deviceScaleFactor: 2,
      isMobile: true,
      hasTouch: true,
      storageState: `${OUT}/state-${route.role}.json`,
    });
    const page = await context.newPage();
    await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
    await page.waitForTimeout(1500);

    const info = await page.evaluate(async () => {
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 500));
      window.scrollTo(0, document.body.scrollHeight);
      await new Promise((r) => setTimeout(r, 400));

      // The bar of the phone: the fixed navigation at the bottom.
      const bars = [...document.querySelectorAll('nav')].filter((n) => {
        const s = getComputedStyle(n);
        const b = n.getBoundingClientRect();
        return s.position === 'fixed' && b.bottom > window.innerHeight - 5 && b.height > 20;
      });
      const bar = bars[0];
      const barBox = bar ? bar.getBoundingClientRect() : null;

      // The last thing that can be read: the last element with text.
      const candidates = [...document.querySelectorAll('main *, main')]
        .filter((el) => {
          const r = el.getBoundingClientRect();
          const s = getComputedStyle(el);
          return r.height > 0 && r.width > 0 && s.visibility !== 'hidden' && el.children.length === 0 && el.textContent.trim();
        })
        .map((el) => ({ el, box: el.getBoundingClientRect() }));
      const last = candidates.length ? candidates[candidates.length - 1] : null;

      const main = document.querySelector('main');
      const mainStyle = main ? getComputedStyle(main) : null;

      return {
        scrolledTo: Math.round(window.scrollY),
        maxScroll: Math.round(document.body.scrollHeight - window.innerHeight),
        bar: barBox ? { top: Math.round(barBox.top), height: Math.round(barBox.height) } : null,
        mainPaddingBottom: mainStyle ? mainStyle.paddingBottom : null,
        bodyPaddingBottom: getComputedStyle(document.body).paddingBottom,
        lastText: last ? { text: last.el.textContent.trim().slice(0, 50), bottom: Math.round(last.box.bottom), right: Math.round(last.box.right) } : null,
        hiddenBehindBar: barBox && last ? last.box.bottom > barBox.top + 1 : null,
      };
    });

    await page.screenshot({ path: `${SHOT}/bottom-${width}-${route.path.replace(/^\//, '').replace(/[/?=&:]/g, '_')}.png` });
    out.push({ width, path: route.path, ...info });
    console.log(
      `${width}px ${route.path.padEnd(44)} barTop=${info.bar ? info.bar.top : 'none'} lastBottom=${info.lastText ? info.lastText.bottom : '-'} hidden=${info.hiddenBehindBar} padBottom=${info.mainPaddingBottom}/${info.bodyPaddingBottom}`,
    );
    await context.close();
  }
}

fs.writeFileSync(`${OUT}/bottom-bar.json`, JSON.stringify(out, null, 2));
const hidden = out.filter((r) => r.hiddenBehindBar);
console.log(`\nhidden behind the bar: ${hidden.length}/${out.length}`);
await browser.close();

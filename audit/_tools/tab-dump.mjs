import fs from 'node:fs';

/** The raw box-shadow of every stop of the tab order, on the login page. */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const TARGET = process.env.BM_PATH ?? '/login';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}${TARGET}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1200);

for (let i = 0; i < 12; i += 1) {
  await page.keyboard.press('Tab');
  await page.waitForTimeout(120);
  const f = await page.evaluate(() => {
    const el = document.activeElement;
    if (!el || el === document.body) return null;
    const s = getComputedStyle(el);
    return {
      tag: el.tagName.toLowerCase(),
      id: el.id,
      cls: String(el.className).slice(0, 90),
      text: (el.textContent || el.getAttribute('aria-label') || '').trim().replace(/\s+/g, ' ').slice(0, 26),
      fv: el.matches(':focus-visible'),
      boxShadow: s.boxShadow,
      outline: `${s.outlineWidth} ${s.outlineStyle}`,
      ringShadow: s.getPropertyValue('--tw-ring-shadow').trim(),
    };
  });
  if (!f) continue;
  const hasRing = /0px 0px 0px [1-9]/.test(f.boxShadow);
  console.log(`fv=${f.fv} ring=${hasRing ? 'YES' : 'no '} | ${f.tag}#${f.id} "${f.text}"`);
  console.log(`     box-shadow: ${f.boxShadow}`);
  console.log(`     --tw-ring-shadow: ${f.ringShadow}`);
}

await browser.close();

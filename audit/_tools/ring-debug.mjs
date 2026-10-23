import fs from 'node:fs';

/** Why the ring of the design system does not show: the ring variables are read. */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 } });
const page = await context.newPage();
await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1000);

// The button that carries the ring utility of the design system.
await page.focus('button[type="submit"]');

const info = await page.evaluate(() => {
  const el = document.activeElement;
  const s = getComputedStyle(el);
  const names = [
    '--tw-ring-color',
    '--tw-ring-shadow',
    '--tw-ring-offset-width',
    '--tw-ring-offset-color',
    '--tw-shadow',
    '--tw-shadow-colored',
    '--color-acc',
  ];
  const vars = {};
  for (const n of names) vars[n] = s.getPropertyValue(n).trim();
  return {
    tag: el.tagName.toLowerCase(),
    id: el.id,
    cls: el.className,
    boxShadow: s.boxShadow,
    outline: `${s.outlineWidth} ${s.outlineStyle} ${s.outlineColor}`,
    matchesFocusVisible: el.matches(':focus-visible'),
    matchesFocus: el.matches(':focus'),
    hasRingClass: el.className.includes('ring-2'),
    ringAccClass: el.className.includes('ring-acc'),
    vars,
  };
});

console.log(JSON.stringify(info, null, 2));
await browser.close();

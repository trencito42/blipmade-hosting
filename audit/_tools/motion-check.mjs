import fs from 'node:fs';

/**
 * The three claims of the design system that are checked in the browser:
 *   1. the ring of the auth field is on the container, not on the input;
 *   2. the reduced motion is honoured;
 *   3. the motion that is not covered by the reduced motion.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

// --- 1. the container of the auth field -------------------------------------
{
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2 });
  const page = await context.newPage();
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(800);
  await page.focus('#email');
  await page.waitForTimeout(300);
  const info = await page.evaluate(() => {
    const input = document.querySelector('#email');
    const shell = input.parentElement;
    const s = getComputedStyle(shell);
    return {
      shellClass: shell.className,
      shellBoxShadow: s.boxShadow,
      shellRingShadow: s.getPropertyValue('--tw-ring-shadow').trim(),
      shellRingColor: s.getPropertyValue('--tw-ring-color').trim(),
      inputBoxShadow: getComputedStyle(input).boxShadow,
    };
  });
  console.log('--- the auth field, focused ---');
  console.log(JSON.stringify(info, null, 2));
  await page.screenshot({ path: `${SHOT}/a11y-login-email-focused.png`, clip: { x: 300, y: 150, width: 680, height: 260 } });
  await context.close();
}

// --- 2. the reduced motion ---------------------------------------------------
for (const reduced of [false, true]) {
  const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, reducedMotion: reduced ? 'reduce' : 'no-preference' });
  const page = await context.newPage();
  await page.goto(`${BASE}/`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);
  const info = await page.evaluate(() => {
    const pick = (sel) => {
      const el = document.querySelector(sel);
      if (!el) return null;
      const s = getComputedStyle(el);
      return { transitionDuration: s.transitionDuration, animationName: s.animationName, animationDuration: s.animationDuration, transform: s.transform, opacity: s.opacity };
    };
    const animated = [...document.querySelectorAll('*')].filter((el) => {
      const s = getComputedStyle(el);
      return s.animationName !== 'none' || (s.transitionDuration !== '0s' && s.transitionDuration !== '');
    });
    const sample = animated.slice(0, 8).map((el) => {
      const s = getComputedStyle(el);
      return {
        tag: el.tagName.toLowerCase(),
        cls: String(el.className).slice(0, 70),
        animationName: s.animationName,
        animationDuration: s.animationDuration,
        transitionDuration: s.transitionDuration,
        transitionProperty: s.transitionProperty,
      };
    });
    return {
      prefersReduced: matchMedia('(prefers-reduced-motion: reduce)').matches,
      htmlScrollBehavior: getComputedStyle(document.documentElement).scrollBehavior,
      animatedCount: animated.length,
      sample,
      rv: pick('.rv'),
      float: pick('.bm-float'),
    };
  });
  console.log(`\n--- reducedMotion=${reduced} ---`);
  console.log(JSON.stringify(info, null, 2));
  await context.close();
}

await browser.close();

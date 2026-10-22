/**
 * Verifies that the custom scrollbar is applied and captures how it looks.
 *
 * The style is read back from the browser so the result is a fact and not an
 * assumption, and a screenshot is taken of a page that scrolls.
 */
import fs from 'node:fs';

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ??
  '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'http://127.0.0.1:3000';
const OUT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots';

fs.mkdirSync(OUT_DIR, { recursive: true });

const browser = await chromium.launch({
  executablePath: '/usr/bin/chromium',
  headless: false,
  // Playwright hides scrollbars by default, which would hide the very thing
  // this script is checking.
  ignoreDefaultArgs: ['--hide-scrollbars'],
  args: ['--no-sandbox', '--disable-dev-shm-usage'],
});
const context = await browser.newContext({ viewport: { width: 1440, height: 900 } });
const page = await context.newPage();

try {
  await page.goto(`${BASE}/docs`, { waitUntil: 'networkidle', timeout: 60000 });
  await page.waitForTimeout(1500);

  const styles = await page.evaluate(() => {
    const read = (pseudo) => {
      const style = getComputedStyle(document.documentElement, pseudo);
      return {
        width: style.width,
        height: style.height,
        backgroundColor: style.backgroundColor,
        borderRadius: style.borderRadius,
        display: style.display,
      };
    };
    const root = getComputedStyle(document.documentElement);
    const body = getComputedStyle(document.body);
    return {
      scrollbarWidth: root.scrollbarWidth,
      scrollbarColor: root.scrollbarColor,
      scrollbarGutter: root.scrollbarGutter,
      bodyOverflowX: body.overflowX,
      thumb: read('::-webkit-scrollbar-thumb'),
      track: read('::-webkit-scrollbar-track'),
      scroll: read('::-webkit-scrollbar'),
      documentScrollable: document.documentElement.scrollHeight > window.innerHeight,
    };
  });
  console.log('=== computed styles ===');
  console.log(JSON.stringify(styles, null, 2));

  // Scroll a little so the thumb sits away from the top, then capture.
  await page.evaluate(() => window.scrollTo({ top: 600, behavior: 'instant' }));
  await page.waitForTimeout(700);
  await page.screenshot({ path: `${OUT_DIR}/scrollbar-desktop.png` });
  console.log('screenshot ->', `${OUT_DIR}/scrollbar-desktop.png`);

  // The phone layout scrolls too.
  const phone = await browser.newContext({
    viewport: { width: 390, height: 844 },
    deviceScaleFactor: 2,
    isMobile: true,
    hasTouch: true,
  });
  const phonePage = await phone.newPage();
  await phonePage.goto(`${BASE}/docs`, { waitUntil: 'networkidle', timeout: 60000 });
  await phonePage.waitForTimeout(1200);
  await phonePage.evaluate(() => window.scrollTo({ top: 500, behavior: 'instant' }));
  await phonePage.waitForTimeout(600);
  await phonePage.screenshot({ path: `${OUT_DIR}/scrollbar-mobile.png` });
  console.log('screenshot ->', `${OUT_DIR}/scrollbar-mobile.png`);
} catch (error) {
  console.log('failed:', error.message);
} finally {
  await browser.close();
}

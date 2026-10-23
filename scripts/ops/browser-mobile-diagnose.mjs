import fs from 'node:fs';

/**
 * The measurement of the mobile layout.
 *
 * The script opens a route on the width of a phone and writes down what the
 * document really looks like: the viewport, the root element, the content
 * that does not fit into its own box and the fonts the browser really loaded.
 *
 * Two things are measured, because one of them alone always lies:
 *
 *   - `scrollWidth` of the document. The body carries `overflow-x: hidden`,
 *     so the document never reports an overflow, even when the text of a card
 *     reaches past its edge. A check that only looks at the document sees a
 *     clean page.
 *   - `scrollWidth` against `clientWidth` of every single element. This is
 *     the measurement that survives the mask: an element whose content is
 *     wider than its own box is the text that leaves the card.
 *
 * The measurement is done with the flags the Chrome DevTools uses when a
 * phone is chosen there, so the numbers are the numbers of the device
 * emulation and not the numbers of a plain desktop window.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const EMAIL = process.env.BM_EMAIL ?? '';
const PASSWORD = process.env.BM_PASSWORD ?? '';
const WIDTH = Number(process.env.BM_WIDTH ?? 440);
const HEIGHT = Number(process.env.BM_HEIGHT ?? 956);
const ROUTES = (process.env.BM_ROUTES ?? '/app').split(',');
const SHOT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/mobile';
const PREFIX = process.env.BM_PREFIX ?? 'mobile';
const LABEL = process.env.BM_LABEL ?? String(WIDTH);
const SKIP_LOGIN = process.env.BM_SKIP_LOGIN === '1';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });

/**
 * A context with the flags of the device emulation of the DevTools: the page
 * believes it runs on a phone, the pixels are dense and the finger is the
 * pointer. A context without `isMobile` measures a window that is narrow,
 * which is not the same thing as a phone.
 */
const context = await browser.newContext({
  viewport: { width: WIDTH, height: HEIGHT },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
  userAgent:
    'Mozilla/5.0 (iPhone; CPU iPhone OS 18_0 like Mac OS X) AppleWebKit/605.1.15 (KHTML, like Gecko) Version/18.0 Mobile/15E148 Safari/604.1',
});
const page = await context.newPage();

const fontRequests = [];
page.on('request', (request) => {
  const url = request.url();
  if (/\.(woff2?|ttf|otf)(\?|$)/i.test(url) || /fonts\./i.test(url)) fontRequests.push(url);
});

if (!SKIP_LOGIN) {
  await page.goto(`${BASE}/login`, { waitUntil: 'networkidle' });
  await page.fill('input[type="email"]', EMAIL);
  await page.fill('input[type="password"]', PASSWORD);
  await page.click('button[type="submit"]');
  await page.waitForURL(/\/app(\/|$)/, { timeout: 20000 });
}

for (const route of ROUTES) {
  await page.goto(`${BASE}${route}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const report = await page.evaluate(() => {
    const root = document.documentElement;
    const body = document.body;

    /** The path that leads to an element, so the overflow can be found in the code. */
    const path = (element) => {
      const parts = [];
      let current = element;
      while (current && current !== document.documentElement && parts.length < 7) {
        let name = current.tagName.toLowerCase();
        if (current.id) name += `#${current.id}`;
        else if (current.className && typeof current.className === 'string') {
          const classes = current.className.trim().split(/\s+/).filter(Boolean).slice(0, 5);
          if (classes.length) name += `.${classes.join('.')}`;
        }
        parts.unshift(name);
        current = current.parentElement;
      }
      return parts.join(' > ');
    };

    const describe = (element) => {
      const style = getComputedStyle(element);
      const box = element.getBoundingClientRect();
      return {
        path: path(element),
        width: Math.round(box.width),
        left: Math.round(box.left),
        right: Math.round(box.right),
        display: style.display,
        position: style.position,
        overflowX: style.overflowX,
        whiteSpace: style.whiteSpace,
        textOverflow: style.textOverflow,
        minWidth: style.minWidth,
        boxWidth: style.width,
        flex: style.flex,
        gridTemplateColumns: style.gridTemplateColumns,
      };
    };

    // The viewport of the document and the one the eye sees.
    const meta = document.querySelector('meta[name="viewport"]');
    const visual = window.visualViewport;

    // Does the page really scroll sideways?
    const before = window.scrollX;
    window.scrollTo(9999, 0);
    const after = window.scrollX;
    window.scrollTo(0, 0);

    /**
     * The content that does not fit into its own box.
     *
     * `scrollWidth` is bigger than `clientWidth` when the content of an
     * element reaches past its edge. When the element clips, the text is cut
     * off; when it does not clip, the text leaves the card and is only cut off
     * by the body, which is the defect the user sees.
     */
    const spilling = [];
    const clipped = [];
    for (const element of document.querySelectorAll('body *')) {
      const style = getComputedStyle(element);
      if (style.display === 'none' || style.visibility === 'hidden') continue;
      if (style.overflowX === 'auto' || style.overflowX === 'scroll') continue;
      const over = element.scrollWidth - element.clientWidth;
      if (over <= 1 || element.clientWidth === 0) continue;
      const info = {
        ...describe(element),
        over,
        scrollWidth: element.scrollWidth,
        clientWidth: element.clientWidth,
        text: (element.textContent || '').trim().slice(0, 70),
      };
      if (style.overflowX === 'hidden' || style.overflowX === 'clip') clipped.push(info);
      else spilling.push(info);
    }
    spilling.sort((a, b) => b.over - a.over);
    clipped.sort((a, b) => b.over - a.over);

    // The elements that reach past the edge of the screen.
    const wide = [];
    for (const element of document.querySelectorAll('body *')) {
      const box = element.getBoundingClientRect();
      if (box.width === 0 && box.height === 0) continue;
      const style = getComputedStyle(element);
      if (style.visibility === 'hidden' || style.display === 'none') continue;
      if (box.right <= window.innerWidth + 1 && box.left >= -1) continue;
      wide.push({ ...describe(element), text: (element.textContent || '').trim().slice(0, 60) });
    }
    wide.sort((a, b) => b.right - a.right);

    const rootStyle = getComputedStyle(root);
    const bodyStyle = getComputedStyle(body);

    return {
      document: {
        url: location.href,
        title: document.title,
        lang: root.lang,
        htmlLang: root.getAttribute('lang'),
        metaViewport: meta ? meta.getAttribute('content') : null,
        innerWidth: window.innerWidth,
        innerHeight: window.innerHeight,
        clientWidth: root.clientWidth,
        scrollWidth: root.scrollWidth,
        bodyScrollWidth: body.scrollWidth,
        bodyClientWidth: body.clientWidth,
        visualViewportWidth: visual ? Math.round(visual.width) : null,
        visualViewportScale: visual ? visual.scale : null,
        devicePixelRatio: window.devicePixelRatio,
        scrollXBefore: before,
        scrollXAfter: after,
        canScrollSideways: after > before,
        rootRect: (() => {
          const r = root.getBoundingClientRect();
          return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
        })(),
        bodyRect: (() => {
          const r = body.getBoundingClientRect();
          return { width: Math.round(r.width), left: Math.round(r.left), right: Math.round(r.right) };
        })(),
        htmlOverflowX: rootStyle.overflowX,
        bodyOverflowX: bodyStyle.overflowX,
        bodyFontFamily: bodyStyle.fontFamily,
        bodyFontSize: bodyStyle.fontSize,
      },
      spilling: spilling.slice(0, 20),
      clipped: clipped.slice(0, 20),
      wide: wide.slice(0, 20),
      fonts: {
        loaded: [...document.fonts]
          .filter((f) => f.status === 'loaded')
          .map((f) => `${f.family} ${f.weight} ${f.style}`),
        families: [...new Set([...document.fonts].map((f) => f.family))],
      },
      mobileNav: {
        headerNavLinks: [...document.querySelectorAll('header a')].map((a) => a.textContent.trim()).filter(Boolean),
        bottomTabs: [...document.querySelectorAll('[data-bottom-nav] a, [data-bottom-nav] button')].map((t) => ({
          text: (t.textContent || '').trim(),
          w: Math.round(t.getBoundingClientRect().width),
          h: Math.round(t.getBoundingClientRect().height),
        })),
        bottomBar: !!document.querySelector('[data-bottom-nav]'),
      },
    };
  });

  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const name = route.replace(/^\//, '').replace(/\//g, '_') || 'home';
  await page.screenshot({ path: `${SHOT_DIR}/${PREFIX}-${LABEL}-${name}.png`, fullPage: true });

  console.log(`\n======== ${route} at ${WIDTH}x${HEIGHT} ========`);
  console.log('document:', JSON.stringify(report.document));
  console.log('fonts loaded:', JSON.stringify(report.fonts));
  console.log('mobileNav:', JSON.stringify(report.mobileNav));
  console.log(`SPILLING out of their own box (${report.spilling.length}):`);
  for (const item of report.spilling) console.log('   !', JSON.stringify(item));
  console.log(`clipped inside their box (${report.clipped.length}):`);
  for (const item of report.clipped) console.log('   ~', JSON.stringify(item));
  console.log(`past the edge of the screen (${report.wide.length}):`);
  for (const item of report.wide) console.log('   >', JSON.stringify(item));
}

console.log('\nfont requests:');
for (const url of [...new Set(fontRequests)]) console.log('  ', url);

await browser.close();

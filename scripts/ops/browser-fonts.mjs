import fs from 'node:fs';

/**
 * Checks the typeface of the interface in a real browser.
 *
 * The script opens the site in a clean session and writes down what the
 * browser really did: which files it asked for, what they answered, which
 * faces are loaded and how wide the text of the interface is drawn.
 *
 * The declaration in the stylesheet is not the proof. The proof is the
 * request for the file, the face with the state `loaded` and the text that is
 * drawn with it.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const ROUTE = process.env.BM_ROUTE ?? '/';
const SHOT_DIR = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/mobile';
const PREFIX = process.env.BM_PREFIX ?? 'fonts';
const LABEL = process.env.BM_LABEL ?? 'check';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
// A clean session: no cache, no cookies, nothing from a previous visit.
const context = await browser.newContext({
  viewport: { width: 440, height: 956 },
  deviceScaleFactor: 3,
  isMobile: true,
  hasTouch: true,
});
const page = await context.newPage();

const fontRequests = [];
page.on('response', async (response) => {
  const url = response.url();
  if (!/\.(woff2?|ttf|otf)(\?|$)/i.test(url) && !url.includes('/fonts/')) return;
  let type = '';
  try {
    type = (await response.allHeaders())['content-type'] || '';
  } catch {
    type = '';
  }
  fontRequests.push({ url, status: response.status(), type });
});

await page.goto(`${BASE}${ROUTE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

const report = await page.evaluate(() => {
  const faces = [...document.fonts].map((face) => ({
    family: face.family,
    weight: face.weight,
    style: face.style,
    status: face.status,
  }));

  /**
   * The width of the same text, drawn with the family of the interface and
   * with a family that is certainly not there.
   *
   * When the two widths are the same, the face of the interface is not being
   * used: the text is drawn with the fallback.
   */
  const measure = (family) => {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    context.font = `400 32px ${family}`;
    return Math.round(context.measureText('Blipmade proxima nova 0123').width);
  };

  const probe = document.createElement('span');
  probe.textContent = 'Blipmade proxima nova 0123';
  probe.style.cssText =
    'position:fixed;left:-9999px;top:0;font:400 32px var(--font-sans);white-space:nowrap';
  document.body.appendChild(probe);
  const drawn = Math.round(probe.getBoundingClientRect().width);
  probe.remove();

  const body = getComputedStyle(document.body);

  return {
    computedFontFamily: body.fontFamily,
    faces,
    proximaNovaFaces: faces.filter((face) => /proxima/i.test(face.family)),
    geistFaces: faces.filter((face) => /geist/i.test(face.family)),
    loadedFamilies: [...new Set(faces.filter((face) => face.status === 'loaded').map((face) => face.family))],
    widths: {
      drawnWithStack: drawn,
      withProximaNova: measure('"Proxima Nova"'),
      withFallbackOnly: measure('"No Such Family"'),
      withGeist: measure('"Geist Variable"'),
    },
  };
});

fs.mkdirSync(SHOT_DIR, { recursive: true });
await page.screenshot({ path: `${SHOT_DIR}/${PREFIX}-${LABEL}.png`, fullPage: false });

console.log(`--- ${BASE}${ROUTE}`);
console.log('computed font-family:', report.computedFontFamily);
console.log('loaded families    :', JSON.stringify(report.loadedFamilies));
console.log('proxima nova faces :', JSON.stringify(report.proximaNovaFaces));
console.log('geist faces        :', JSON.stringify(report.geistFaces));
console.log('widths             :', JSON.stringify(report.widths));
console.log('font requests      :');
for (const request of fontRequests) {
  console.log(`   ${request.status} ${request.type} ${request.url}`);
}

// The face of the interface is used when the browser says it is loaded.
const loaded = report.proximaNovaFaces.filter((face) => face.status === 'loaded');

// The family that is drawn is found by comparing the width of the text with
// the width of the same text drawn with a family that is named.
let drawn = 'a family that is neither Geist nor the system fallback';
if (report.widths.drawnWithStack === report.widths.withGeist) drawn = 'Geist Variable';
else if (report.widths.drawnWithStack === report.widths.withFallbackOnly) drawn = 'the system fallback';
else if (loaded.length) drawn = 'Proxima Nova';

console.log(`\nproxima nova loaded : ${loaded.length} of ${report.proximaNovaFaces.length}`);
console.log(`typeface in use    : ${drawn}`);
console.log(`typeface expected  : ${loaded.length ? 'Proxima Nova' : 'Geist Variable (the fallback)'}`);

await browser.close();

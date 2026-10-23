import fs from 'node:fs';

/**
 * The focus indicator, measured again.
 *
 * The indicator of the design system is a ring (`focus-visible:ring-2
 * focus-visible:ring-acc`), not an outline. The ring lives in the
 * `box-shadow` of the element, so the whole shadow is read and every layer
 * is checked for a spread that is not zero and a colour that is not
 * transparent.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';

const ROUTES = [
  { path: '/', role: 'anonymous' },
  { path: '/login', role: 'anonymous' },
  { path: '/apps', role: 'anonymous' },
  { path: '/app', role: 'customer' },
  { path: '/app/instances', role: 'customer' },
  { path: '/app/instances/cmvkbgm9h0001r18096ep5jzl', role: 'customer' },
  { path: '/app/deploy/discord-bot', role: 'customer' },
  { path: '/app/tickets', role: 'customer' },
  { path: '/app/settings', role: 'customer' },
  { path: '/admin', role: 'staff' },
  { path: '/admin/staff', role: 'staff' },
];

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const out = [];

for (const route of ROUTES) {
  const context = await browser.newContext({
    viewport: { width: 1280, height: 900 },
    storageState: route.role === 'anonymous' ? undefined : `${OUT}/state-${route.role}.json`,
  });
  const page = await context.newPage();
  await page.goto(`${BASE}${route.path}`, { waitUntil: 'networkidle' });
  await page.waitForTimeout(1200);

  const seen = new Set();
  for (let i = 0; i < 22; i += 1) {
    await page.keyboard.press('Tab');
    const f = await page.evaluate(() => {
      const el = document.activeElement;
      if (!el || el === document.body) return null;
      const style = getComputedStyle(el);
      const shadow = style.boxShadow || 'none';
      // Every layer of the shadow: "<colour> <x> <y> <spread> <blur>".
      const layers = shadow === 'none' ? [] : shadow.split(/,(?![^(]*\))/);
      const rings = layers
        .map((layer) => {
          // The order of the lengths of a shadow is x, y, blur, spread. The
          // ring is the layer with a spread that is not zero.
          const m = layer.trim().match(/^(.*?)\s+(-?[\d.]+)px\s+(-?[\d.]+)px(?:\s+(-?[\d.]+)px)?(?:\s+(-?[\d.]+)px)?$/);
          if (!m) return null;
          const colour = m[1];
          const lengths = [m[2], m[3], m[4], m[5]].filter((v) => v !== undefined).map(Number);
          const spread = lengths.length >= 4 ? lengths[3] : 0;
          const transparent = /rgba?\([^)]*,\s*0\s*\)$/.test(colour) || /transparent/.test(colour);
          return { layer: layer.trim(), colour, spread, transparent };
        })
        .filter(Boolean)
        .filter((l) => l.spread > 0 && !l.transparent);

      const outlineWidth = parseFloat(style.outlineWidth) || 0;
      const hasOutline = outlineWidth > 0 && style.outlineStyle !== 'none';
      const hasRing = rings.length > 0;

      const rect = el.getBoundingClientRect();
      return {
        selector:
          el.tagName.toLowerCase() +
          (el.id ? `#${el.id}` : '') +
          (el.className && typeof el.className === 'string'
            ? '.' + el.className.trim().split(/\s+/).filter(Boolean).slice(0, 3).join('.')
            : ''),
        text: (el.textContent || el.getAttribute('aria-label') || el.getAttribute('placeholder') || '').trim().replace(/\s+/g, ' ').slice(0, 30),
        focusVisible: el.matches(':focus-visible'),
        hasOutline,
        outline: `${style.outlineWidth} ${style.outlineStyle} ${style.outlineColor}`,
        hasRing,
        rings,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
        visible: hasOutline || hasRing,
      };
    });
    if (!f) continue;
    const key = f.selector + f.text;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push({ path: route.path, role: route.role, ...f });
  }
  await context.close();
}

fs.writeFileSync(`${OUT}/focus-report.json`, JSON.stringify(out, null, 2));

const noIndicator = out.filter((f) => !f.visible);
console.log(`controls examined: ${out.length}`);
console.log(`without a focus indicator: ${noIndicator.length}`);
const byRoute = {};
for (const f of noIndicator) byRoute[f.path] = (byRoute[f.path] || 0) + 1;
console.log(JSON.stringify(byRoute, null, 2));
for (const f of noIndicator.slice(0, 20)) {
  console.log(`  ${f.path.padEnd(40)} ${f.selector.slice(0, 70).padEnd(72)} |${f.text.slice(0, 24)}| ${f.w}x${f.h}`);
}
await browser.close();

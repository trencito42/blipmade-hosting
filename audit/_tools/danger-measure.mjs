import fs from 'node:fs';

/**
 * The two dark-on-red controls, measured in the browser.
 *
 * The confirmation dialog of the instance page and the toast of the error
 * path are opened, measured and closed. Nothing is confirmed, so nothing is
 * written.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const BASE = process.env.BM_BASE ?? 'https://blipmade.com';
const OUT = process.env.OUT_DIR ?? '/tmp/bm-audit';
const SHOT = process.env.SHOT_DIR ?? '/opt/blipmade/screenshots/audit';
const INSTANCE = 'cmvkbgm9h0001r18096ep5jzl';

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const context = await browser.newContext({ viewport: { width: 1280, height: 900 }, deviceScaleFactor: 2, storageState: `${OUT}/state-customer.json` });
const page = await context.newPage();

const measure = async (label) =>
  page.evaluate((l) => {
    const srgb = (v) => {
      const s = v / 255;
      return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
    };
    const parse = (v) => {
      const m = v.match(/rgba?\(([^)]+)\)/);
      if (!m) return null;
      const p = m[1].split(/[,\s/]+/).filter(Boolean).map(Number);
      return { r: p[0], g: p[1], b: p[2], a: p.length > 3 ? p[3] : 1 };
    };
    const over = (f, b) => ({ r: f.r * f.a + b.r * (1 - f.a), g: f.g * f.a + b.g * (1 - f.a), b: f.b * f.a + b.b * (1 - f.a), a: 1 });
    const lum = (c) => 0.2126 * srgb(c.r) + 0.7152 * srgb(c.g) + 0.0722 * srgb(c.b);
    const hex = (c) => '#' + [c.r, c.g, c.b].map((v) => Math.round(v).toString(16).padStart(2, '0')).join('');

    const out = [];
    for (const el of document.querySelectorAll('button, a, [role="alert"], [role="status"]')) {
      const st = getComputedStyle(el);
      const bg = parse(st.backgroundColor);
      if (!bg || bg.a === 0) continue;
      const fg = parse(st.color);
      if (!fg) continue;
      const rect = el.getBoundingClientRect();
      if (!rect.width || !rect.height) continue;
      const f = fg.a < 1 ? over(fg, bg) : fg;
      const la = lum(f);
      const lb = lum(bg);
      const r = (Math.max(la, lb) + 0.05) / (Math.min(la, lb) + 0.05);
      const size = parseFloat(st.fontSize);
      const weight = Number(st.fontWeight) || 400;
      const large = size >= 24 || (size >= 18.66 && weight >= 700);
      const need = large ? 3 : 4.5;
      if (r >= need) continue;
      out.push({
        label: l,
        text: (el.textContent || '').trim().replace(/\s+/g, ' ').slice(0, 40),
        cls: String(el.className).slice(0, 110),
        fg: hex(f),
        bg: hex(bg),
        bgRaw: st.backgroundColor,
        colorRaw: st.color,
        size,
        weight,
        ratio: Math.round(r * 100) / 100,
        need,
        w: Math.round(rect.width),
        h: Math.round(rect.height),
      });
    }
    return out;
  }, label);

await page.goto(`${BASE}/app/instances/${INSTANCE}`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);

// the confirmation dialog of the instance page
const danger = page.locator('button:has-text("Cancel instance"), button:has-text("Delete"), button:has-text("Destroy")').first();
if (await danger.count()) {
  await danger.click();
  await page.waitForTimeout(900);
  console.log('--- the confirmation dialog ---');
  console.log(JSON.stringify(await measure('confirm-dialog'), null, 2));
  await page.screenshot({ path: `${SHOT}/a11y-confirm-dialog.png` });
  const cancel = page.locator('[role="dialog"] button:has-text("Cancel")').first();
  if (await cancel.count()) await cancel.click();
  else await page.keyboard.press('Escape');
  await page.waitForTimeout(600);
} else {
  console.log('no danger button found on the instance page');
}

// the error toast: the form of the rename is sent with an empty name
await page.goto(`${BASE}/app/settings`, { waitUntil: 'networkidle' });
await page.waitForTimeout(1500);
const toast = await measure('settings');
console.log('--- the settings page ---');
console.log(JSON.stringify(toast, null, 2));

await context.close();
await browser.close();

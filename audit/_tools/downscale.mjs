import fs from 'node:fs';
import path from 'node:path';

/**
 * The captures of the phone are made at three times the density of the
 * screen, so they are big. They are scaled down to a single time with the
 * canvas of the browser, which is enough to read the layout and keeps the
 * artefact folder light.
 */

const PLAYWRIGHT = process.env.PLAYWRIGHT_PATH ?? '/opt/blipmade/tools/browser/node_modules/playwright-core/index.js';
const playwright = await import(PLAYWRIGHT);
const chromium = playwright.chromium ?? playwright.default?.chromium;

const DIR = process.argv[2] ?? '/opt/blipmade/screenshots/audit/mobile';
const FACTOR = Number(process.env.BM_DOWNSCALE ?? 3);

const browser = await chromium.launch({ executablePath: '/usr/bin/chromium', args: ['--no-sandbox'] });
const page = await browser.newPage();

const files = fs.readdirSync(DIR).filter((f) => f.endsWith('.png'));
let before = 0;
let after = 0;
let done = 0;

for (const file of files) {
  const full = path.join(DIR, file);
  const stat = fs.statSync(full);
  before += stat.size;
  if (stat.size < 120 * 1024) {
    after += stat.size;
    continue;
  }
  const data = fs.readFileSync(full).toString('base64');
  const out = await page.evaluate(
    async ({ data, factor }) => {
      const img = new Image();
      img.src = `data:image/png;base64,${data}`;
      await img.decode();
      const canvas = document.createElement('canvas');
      canvas.width = Math.round(img.width / factor);
      canvas.height = Math.round(img.height / factor);
      const ctx = canvas.getContext('2d');
      ctx.imageSmoothingQuality = 'high';
      ctx.drawImage(img, 0, 0, canvas.width, canvas.height);
      const dataUrl = canvas.toDataURL('image/png');
      return { base64: dataUrl.slice(dataUrl.indexOf(',') + 1), w: canvas.width, h: canvas.height };
    },
    { data, factor: FACTOR },
  );
  fs.writeFileSync(full, Buffer.from(out.base64, 'base64'));
  after += fs.statSync(full).size;
  done += 1;
  if (done % 20 === 0) console.log(`${done}/${files.length}`);
}

console.log(`\nscaled ${done} of ${files.length}`);
console.log(`before: ${(before / 1024 / 1024).toFixed(1)} MB`);
console.log(`after:  ${(after / 1024 / 1024).toFixed(1)} MB`);
await browser.close();
